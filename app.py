from flask import Flask, g, render_template, request, redirect, url_for, jsonify, session
import os
from collections.abc import Mapping
from datetime import datetime, timezone
from flask_session import Session
from supabase import create_client
from dotenv import load_dotenv  

# importing scripts
from degreeviz import logging_utils as logging
from degreeviz.errors import AuthError, DatabaseError, DegreeVizError, GraphValidationError, ProgramScrapeError
from degreeviz.graph.validation import (
    validate_graph_payload,
    validate_program_result,
)
from degreeviz.programs.graph_builder import build_program_graph
import time

"""
Flask controller for DegreeViz.

High-level flow:
1. `/` scrapes a selected McGill program and validates the resulting graph.
2. The resulting `prereqs_data`, `details_data`, and requirement buckets live in
   the Flask session so `/graph` can render them into JavaScript globals.
3. The graph page mutates its browser-side copies while the user edits.
4. Small AJAX routes keep the Flask session close enough for refreshes.
5. `/save_graph_to_db` receives the full browser state and persists it to
   Supabase for logged-in users.

The important split is session state vs browser state: after `/graph` loads,
JavaScript is the active editing surface, and saving should send the complete
current graph back to Flask rather than relying only on incremental session
updates.
"""

app = Flask(__name__)
app.config["SECRET_KEY"] = "test"
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_USE_SIGNER"] = True

USER_SCHEDULES_TABLE_NAME = "userschedules"
PLAN_SCHEMA_VERSION = 2

Session(app)
logging.configure_logging(app)

# to handle different env, in Railway APP_ENV = 'prod'
APP_ENV = os.environ.get("APP_ENV", "local").lower()

if APP_ENV == "prod" or APP_ENV == "preprod": 
    load_dotenv(".env")
elif APP_ENV == "local":
    load_dotenv(".env.pre") 

SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL") 
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


@app.before_request
def start_request_logging():
    """Attach request metadata used by structured logs."""
    logging.ensure_request_id()
    g.request_start_time = time.perf_counter()


@app.after_request
def log_http_response(response):
    """Log one compact request lifecycle event for non-static routes."""
    if request.endpoint != "static":
        duration_ms = (time.perf_counter() - getattr(g, "request_start_time", time.perf_counter())) * 1000
        logging.log_event(
            request,
            "http_request",
            status="error" if response.status_code >= 400 else "success",
            details={"status_code": response.status_code},
            duration_ms=duration_ms,
        )
    return response


def json_error(error: DegreeVizError):
    """Convert an expected application error into a JSON response."""
    logging.log_event(request, "request_failed", status="error", error=error, details=error.details)
    return jsonify({"status": "error", "message": error.user_message}), error.status_code


def form_error(template_name: str, error: DegreeVizError):
    """Render a user-safe form error and log the underlying failure."""
    logging.log_event(request, "request_failed", status="error", error=error, details=error.details)
    return render_template(template_name, error=error.user_message)


def current_user_id() -> str:
    """Return the authenticated Flask-session user id or raise."""
    user_id = session.get("user_id")
    if not user_id:
        raise AuthError()
    return user_id


def store_graph_in_session(payload):
    """Persist validated graph payload fields into Flask session."""
    session['details_data'] = payload["details_data"]
    session['prereqs_data'] = payload["prereqs_data"]
    session['program_requirements'] = payload.get("program_requirements", {})
    session['credit_requirements'] = payload.get("credit_requirements", {'core': 0, 'comp': 0, 'elec': 0})
    session['graph_data_available'] = True
    session.modified = True


def utc_now_iso() -> str:
    """Return a timezone-aware timestamp for Supabase JSON/API writes."""
    return datetime.now(timezone.utc).isoformat()


def build_plan_metadata(raw_metadata, payload):
    """Build lightweight metadata for migrations, debugging, and future agents."""
    metadata = dict(raw_metadata) if isinstance(raw_metadata, Mapping) else {}
    metadata.update({
        "schema_version": PLAN_SCHEMA_VERSION,
        "course_count": len(payload["details_data"]),
        "requirement_group_count": len(payload.get("program_requirements", {}).get("buckets", [])),
        "last_saved_at": utc_now_iso(),
    })
    return metadata


def user_email_from_response(user_response) -> str | None:
    """Extract the authenticated email from Supabase's user response."""
    return getattr(getattr(user_response, "user", None), "email", None)

#Injects Supabase credentials into all Jinja templates automatically
@app.context_processor
def inject_supabase_config():
    """Expose public Supabase config to templates."""
    return dict(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY # important to pass the key and not service_role_key
    )



def rebuild_requirements_from_details(details):
    """Recreate minimal requirement buckets from per-course metadata."""
    buckets = {}
    fallback_courses = []
    for code, course in (details or {}).items():
        bucket_id = course.get("requirement_bucket")
        if not bucket_id:
            fallback_courses.append(code)
            continue
        bucket = buckets.setdefault(bucket_id, {
            "id": bucket_id,
            "title": course.get("requirement_bucket_title") or bucket_id,
            "category": course.get("category", "CORE"),
            "min_credits": course.get("requirement_min_credits", 0),
            "max_credits": course.get("requirement_max_credits"),
            "courses": [],
        })
        bucket["courses"].append(code)
    if not buckets and fallback_courses:
        buckets["imported-saved-courses"] = {
            "id": "imported-saved-courses",
            "title": "Imported Saved Courses",
            "category": "CORE",
            "min_credits": 0,
            "max_credits": None,
            "courses": fallback_courses,
            "additional_courses": [],
        }
    return {"buckets": list(buckets.values())}


def has_requirement_buckets(requirements):
    """Return whether saved requirement metadata has visible course-pool buckets."""
    return bool(isinstance(requirements, Mapping) and requirements.get("buckets"))


def requirements_for_saved_graph(graph):
    """Use saved requirement metadata, falling back for legacy saved plans."""
    requirements = graph.get("program_requirements")
    if has_requirement_buckets(requirements):
        return requirements
    return rebuild_requirements_from_details(graph.get("details_data", {}))


def merge_program_requirements(current, incoming):
    """Merge requirement buckets from two programs without duplicating ids."""
    merged = dict(current or {})
    existing_buckets = {bucket.get("id"): bucket for bucket in merged.get("buckets", [])}
    for bucket in (incoming or {}).get("buckets", []):
        bucket_id = bucket.get("id")
        if not bucket_id or bucket_id in existing_buckets:
            continue
        existing_buckets[bucket_id] = bucket
    merged["buckets"] = list(existing_buckets.values())
    merged["course_to_bucket"] = {**(current or {}).get("course_to_bucket", {}), **(incoming or {}).get("course_to_bucket", {})}
    return merged

@app.route('/sync_auth', methods=['POST']) # sync js and python with supabase user id
def sync_auth():
    """Verify Supabase browser auth and mirror the user id into Flask session."""
    data = request.get_json() or {}
    access_token = data.get('access_token')
    
    if access_token:
        try:
            # Verify the token is real and get the user ID
            user_response = supabase_client.auth.get_user(access_token)
            session['user_id'] = user_response.user.id
            logging.log_event(request, "auth_synced", details={"user_id": user_response.user.id})
            return jsonify({"status": "success"})
        except Exception as e:
            return json_error(AuthError(str(e), user_message="Unable to verify your login. Please sign in again."))
            
    return json_error(AuthError("No token provided.", user_message="No login token was provided."))

@app.route('/clear_auth', methods=['POST']) # remove user id from supabase on log-out
def clear_auth():
    """Clear Flask auth/session metadata when Supabase signs out."""
    session.pop('user_id', None)
    session.pop('schedule_id', None) # Clear any active graph ID
    logging.log_event(request, "auth_cleared")
    return jsonify({"status": "success"})

@app.route('/', methods=['GET', "POST"]) #home page
def scrape_form():
    """Home page: visualize a selected McGill program."""
    logging.log_event(request, "home_page_opened")

    action = request.args.get('action')
    url = request.args.get('url')
    program_name = request.args.get("programSearch")
    
    if action == "Visualize Program":
        try:
            if not url:
                raise ProgramScrapeError("No program URL selected.", user_message="Please select a program from the search results.")
            program_data = build_program_graph(url, program_name)
            courses_prereqs_data, processed_details_data, requirements_data = validate_program_result(program_data)
            payload = validate_graph_payload({
                "details_data": processed_details_data,
                "prereqs_data": courses_prereqs_data,
                "program_requirements": requirements_data or {},
                "credit_requirements": (requirements_data or {}).get('credit_requirements', {'core': 0, 'comp': 0, 'elec': 0}),
            })
            store_graph_in_session(payload)
            logging.log_event(
                request,
                "program_visualized",
                details={"program": program_name, "url": url, "course_count": len(processed_details_data)},
            )
            return redirect("graph")
        except DegreeVizError as error:
            return form_error('scrape_form.html', error)

    else:
        # Default action if no specific button was identified (e.g. initial GET request)
        # OR if form submitted without a recognized action
        if request.method == 'GET' and action is None:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            session.pop('program_requirements', None)
            # This is an initial GET request to the form
            return render_template('scrape_form.html')
        else:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            return render_template('scrape_form.html', error="Please select a valid action.")

@app.route("/graph", methods=["GET","POST"]) #main route where graph is displayed
def graph():
    """Render the interactive graph if session graph data exists."""
    if session.get('graph_data_available'): #see if there's a saved graph
        prereqs = session.get('prereqs_data', {})
        details = session.get('details_data', {})
        logging.log_event(request, "graph_displayed", details={"course_count": len(details)})
        requirements = session.get('program_requirements') or rebuild_requirements_from_details(details)
        return render_template('graph.html', prereqs=prereqs, details=details, requirements=requirements)
    else:
        # If no data, redirect back to home page
        return redirect(url_for('scrape_form'))

@app.route("/add_program_form") # form for choosing which program to add to graph
def add_program_form():
    """Render the add-program form for an existing graph."""
    if not session.get('graph_data_available'): #verify there's an existing graph first
        return redirect(url_for('scrape_form', error="Please load or visualize a base program first."))
    return render_template("add_program_form.html")

@app.route("/add_program_to_graph", methods=["GET"]) # adding another program to their graph (like a minor)
def add_program_to_graph():
    """Scrape another program and merge it into the active session graph."""
    if not session.get('graph_data_available'):
        return redirect(url_for('graph'))
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    
    try:
        new_program_url = request.args.get('url')
        new_program_name = request.args.get('programName')

        logging.log_event(request, "program_add_started", details={"program": new_program_name, "url": new_program_url})
        if not new_program_url:
            raise ProgramScrapeError("No program URL selected.", user_message="Please select a program from the search results.")

        # Fetch and process data for the new program
        new_program_data = build_program_graph(new_program_url, new_program_name)
        new_prereqs, new_details, new_requirements = validate_program_result(new_program_data)

        # Retrieve current graph data from session
        current_prereqs = session.get('prereqs_data', {})
        current_details = session.get('details_data', {})

        # Merge details: Add new courses, prioritize existing details if a course code clashes.
        for code, detail_data in new_details.items():
            if code not in current_details: 
                current_details[code] = detail_data

        # Merge prerequisites
        for code, prereq_list in new_prereqs.items():
            if code not in current_prereqs:
                current_prereqs[code] = list(prereq_list) # Ensure it's a new list
            else:
                # Add only new prerequisites to the existing list for that course
                for prereq_item in prereq_list:
                    if prereq_item not in current_prereqs[code]:
                        current_prereqs[code].append(prereq_item)

        session['details_data'] = current_details
        session['prereqs_data'] = current_prereqs
        session['program_requirements'] = merge_program_requirements(session.get('program_requirements', {}), new_requirements or {})
        session['graph_data_available'] = True
        session.modified = True
        logging.log_event(
            request,
            "program_added",
            details={"program": new_program_name, "url": new_program_url, "new_course_count": len(new_details)},
        )

        # NEW: If JavaScript asked for this, send the raw JSON data back!
        if is_ajax:
            return jsonify({
                "status": "success", 
                "new_details": new_details, 
                "new_prereqs": new_prereqs,
                "new_requirements": new_requirements or {}
            })

        return redirect(url_for('graph'))
        
    except DegreeVizError as error:
        if is_ajax:
            return json_error(error)
        form_error('scrape_form.html', error)
        return redirect(url_for('graph'))

@app.route('/sync_graph_session', methods=['POST'])
def sync_graph_session():
    """Stores the browser-owned graph draft in Flask session for refresh survival."""
    try:
        payload = validate_graph_payload(request.get_json() or {})
        store_graph_in_session(payload)
        logging.log_event(request, "graph_session_synced", details={"course_count": len(payload["details_data"])})
        return jsonify({"status": "success"})
    except DegreeVizError as error:
        return json_error(error)

@app.route('/save_graph_to_db', methods=['POST'])
def save_graph():
    """Persist the browser-owned graph state to Supabase."""
    try:
        #verify the graph got passed with the request
        if not session.get('graph_data_available'):
            raise GraphValidationError("No active graph in session.", user_message="No active graph to save.")

        data = request.get_json() or {}
        access_token = data.get("access_token")
        plan_name = data.get("schedule_name", "My Degree Plan")
        saved_plan_id = session.get('schedule_id')

        if not access_token:
            raise AuthError("Missing access token.", user_message="Please log in before saving your graph.")

        user_response = supabase_client.auth.get_user(access_token)
        user_id = user_response.user.id
        owner_email = user_email_from_response(user_response)

        payload = validate_graph_payload({
            "details_data": data.get("details_data", session.get('details_data', {})),
            "prereqs_data": data.get("prereqs_data", session.get('prereqs_data', {})),
            "program_requirements": data.get("program_requirements", session.get('program_requirements', {})),
            "credit_requirements": data.get("credit_requirements", session.get('credit_requirements', {"core": 0, "comp": 0, "elec": 0})),
        })
        prereqs = payload["prereqs_data"]
        details = payload["details_data"]
        program_requirements = payload["program_requirements"]
        credit_reqs = payload["credit_requirements"]
        plan_metadata = build_plan_metadata(data.get("plan_metadata"), payload)
        store_graph_in_session(payload)
        session['plan_metadata'] = plan_metadata
        session['schema_version'] = PLAN_SCHEMA_VERSION
        session.modified = True
        saved_plan_payload = {
            "prereqs_data": prereqs,
            "details_data": details,
            "program_requirements": program_requirements,
            "credit_requirements": credit_reqs,
            "plan_metadata": plan_metadata,
            "schema_version": PLAN_SCHEMA_VERSION,
            "updated_at": utc_now_iso(),
        }
        if owner_email:
            saved_plan_payload["owner_email"] = owner_email

        if saved_plan_id:
            # Update an existing saved plan. The DB still calls this id
            # `schedule_id` in API payloads for backwards compatibility.
            supabase_client.table(USER_SCHEDULES_TABLE_NAME).update(saved_plan_payload).eq("id", saved_plan_id).eq("user_id", user_id).execute()
            
            logging.log_event(request, "graph_saved", details={"mode": "update", "schedule_id": saved_plan_id, "course_count": len(details)})
            return jsonify({"status": "success", "message": "Graph updated successfully!", "schedule_id": saved_plan_id})
            
        else:
            # Insert a new saved plan.
            response = supabase_client.table(USER_SCHEDULES_TABLE_NAME).insert({
                "user_id": user_id,
                "schedule_name": plan_name,
                **saved_plan_payload,
            }).execute()

            # Grab the newly generated UUID and save it to the session
            new_id = response.data[0]['id']
            session['schedule_id'] = new_id
            
            logging.log_event(request, "graph_saved", details={"mode": "insert", "schedule_id": new_id, "schedule_name": plan_name, "course_count": len(details)})
            return jsonify({"status": "success", "message": "Graph saved successfully!", "schedule_id": new_id})

    except DegreeVizError as error:
        return json_error(error)
    except Exception as e:
        return json_error(DatabaseError(str(e)))

@app.route('/saved_graphs')
def saved_graphs_redirect():
    """Redirect old saved-graphs URLs to the saved-plans page."""
    return redirect(url_for('saved_plans'))


@app.route('/saved_plans')
def saved_plans():
    """Show the authenticated user's saved plans."""
    try:
        user_id = current_user_id()
    except AuthError:
        return redirect(url_for('scrape_form'))

    try:
        # Ask Supabase for this user's graphs, newest first
        response = supabase_client.table(USER_SCHEDULES_TABLE_NAME).select("*").eq("user_id", user_id).order("updated_at", desc=True).execute()
        saved_plans = response.data
    except Exception as e:
        logging.log_event(request, "saved_graphs_load_failed", status="error", error=e)
        saved_plans = []

    return render_template('saved_graphs.html', saved_plans=saved_plans)

@app.route('/load_graph', methods=['POST'])
def load_graph():
    """Load one saved graph from Supabase into Flask session."""
    saved_plan_id = request.form.get('schedule_id')
    
    try:
        user_id = current_user_id()
        if not saved_plan_id:
            raise GraphValidationError("No saved plan id provided.", user_message="No saved plan was selected.")
        # Fetch the specific saved plan from Supabase.
        response = supabase_client.table(USER_SCHEDULES_TABLE_NAME).select("*").eq("id", saved_plan_id).eq("user_id", user_id).execute()
        
        if response.data:
            graph = response.data[0]
            payload = validate_graph_payload({
                "details_data": graph.get('details_data', {}),
                "prereqs_data": graph.get('prereqs_data', {}),
                "program_requirements": requirements_for_saved_graph(graph),
                "credit_requirements": graph.get('credit_requirements', {"core": 0, "comp": 0, "elec": 0}),
            })
            store_graph_in_session(payload)
            session['schedule_id'] = graph.get('id')
            session['plan_metadata'] = graph.get('plan_metadata') or {}
            session['schema_version'] = graph.get('schema_version') or 1
            session.modified = True
            
            logging.log_event(request, "saved_graph_loaded", details={"schedule_id": saved_plan_id, "schedule_name": graph.get('schedule_name')})
            return redirect(url_for('graph'))
        raise GraphValidationError("Saved plan not found.", user_message="That saved plan could not be found.")
            
    except DegreeVizError as error:
        logging.log_event(request, "saved_graph_load_failed", status="error", error=error, details=error.details)
    except Exception as e:
        logging.log_event(request, "saved_graph_load_failed", status="error", error=e)
    
    return redirect(url_for('saved_plans'))

@app.route('/delete_graph', methods=['POST'])
def delete_graph():
    """Delete one saved graph belonging to the authenticated user."""
    try:
        data = request.get_json() or {}
        saved_plan_id = data.get('schedule_id')
        user_id = current_user_id()

        if not saved_plan_id:
            raise GraphValidationError("No saved plan id provided.", user_message="No saved plan was selected.")

        # Delete the saved plan from Supabase.
        supabase_client.table(USER_SCHEDULES_TABLE_NAME).delete().eq("id", saved_plan_id).eq("user_id", user_id).execute()
        
        # If the user deletes the plan they are currently looking at, clear the session tracking.
        if session.get('schedule_id') == saved_plan_id:
            session.pop('schedule_id', None)

        logging.log_event(request, "saved_graph_deleted", details={"schedule_id": saved_plan_id})
        return jsonify({"status": "success"})
    except DegreeVizError as error:
        return json_error(error)
    except Exception as e:
        return json_error(DatabaseError(str(e)))

@app.route('/reset_password')
def reset_password():
    """Render the password reset page used by Supabase email links."""
    return render_template('reset_password.html')

@app.route('/terms_of_service') # required for google oauth
def terms_of_service():
    """Render legal pages required by OAuth providers."""
    return render_template('terms_of_service.html')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
