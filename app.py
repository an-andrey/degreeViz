from flask import Flask, render_template, request, redirect, url_for, jsonify, session
import json, os
from flask_session import Session
from supabase import create_client, Client
from dotenv import load_dotenv  

#importing scripts
from scripts.Getting_Info_For_Major import get_courses_of_major, get_information_for_major, get_prereqs
from scripts import utils
from scripts.app_functions import json_graph_file_handling, logging
from datetime import datetime

app = Flask(__name__)
app.config["SECRET_KEY"] = "test"
app.config["SESSION_TYPE"] = "filesystem"
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_USE_SIGNER"] = True

USER_SCHEDULES_TABLE_NAME = "userschedules"

Session(app)

# to handle different env, in Railway APP_ENV = 'prod'
APP_ENV = os.environ.get("APP_ENV", "local").lower()

if APP_ENV == "prod" or APP_ENV == "preprod": 
    load_dotenv(".env")
elif APP_ENV == "local":
    load_dotenv(".env.pre") 

SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_URL = os.environ.get("SUPABASE_URL") 

Client = create_client(SUPABASE_URL, SUPABASE_KEY)

#Injects Supabase credentials into all Jinja templates automatically
@app.context_processor
def inject_supabase_config():
    return dict(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY
    )

courses_info = {}
with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)

@app.route('/sync_auth', methods=['POST']) # sync js and python with supabase user id
def sync_auth():
    data = request.get_json()
    access_token = data.get('access_token')
    
    if access_token:
        try:
            # Verify the token is real and get the user ID
            user_response = Client.auth.get_user(access_token)
            session['user_id'] = user_response.user.id
            return jsonify({"status": "success"})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 401
            
    return jsonify({"status": "error", "message": "No token provided"}), 400

@app.route('/clear_auth', methods=['POST']) # remove user id from supabase on log-out
def clear_auth():
    session.pop('user_id', None)
    session.pop('schedule_id', None) # Clear any active graph ID
    return jsonify({"status": "success"})

@app.route('/', methods=['GET', "POST"]) #home page
def scrape_form():
    #adding a log for each user query
    logging.log_entry(request, "accessing home page")

    action = request.args.get('action')
    if request.method == 'POST' and action == "Load Graph": # when a user uploads a JSON file
            if 'graphFile' not in request.files: #checking if it's a json file
                return render_template('scrape_form.html', error="Invalid file json file provided")
            
            file = request.files['graphFile']

            if not json_graph_file_handling(file): #check if valid json file
                return render_template('scrape_form.html', error="Invalid file json file provided")
            
            else: #process the json file for the graph
                prereqs_data, details_data = json_graph_file_handling.process_json_graph_file(file)

                #Saving to session
                session['prereqs_data'] = prereqs_data
                session['details_data'] = details_data
                session['graph_data_available'] = True

                return redirect("graph")

    url = request.args.get('url')
    major = request.args.get("programSearch")
    
    if action == "Visualize Program": 
        courses_prereqs_data, processed_details_data = get_information_for_major.process_program_data(url, major) #scrape the major's site and grab all info
        
        #Saving the variable to session
        session['prereqs_data'] = courses_prereqs_data
        session['details_data'] = processed_details_data
        session['graph_data_available'] = True

        return redirect("graph")

    else:
        # Default action if no specific button was identified (e.g. initial GET request)
        # OR if form submitted without a recognized action
        if request.method == 'GET' and action is None:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            # This is an initial GET request to the form
            return render_template('scrape_form.html')
        else:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            return render_template('scrape_form.html', error="Please select a valid action.")

@app.route("/graph", methods=["GET","POST"]) #main route where graph is displayed
def graph(): 
    if session.get('graph_data_available'): #see if there's a saved graph
        prereqs = session.get('prereqs_data', {})
        details = session.get('details_data', {})
        logging.log_entry(request, "displaying graph")
        return render_template('graph.html', prereqs=prereqs, details=details)
    else:
        # If no data, redirect back to home page
        return redirect(url_for('scrape_form'))

@app.route("/add_program_form") # form for choosing which program to add to graph
def add_program_form():
    if not session.get('graph_data_available'): #verify there's an existing graph first
        return redirect(url_for('scrape_form', error="Please load or visualize a base program first."))
    return render_template("add_program_form.html")

@app.route("/add_program_to_graph", methods=["GET"]) # adding another program to their graph (like a minor)
def add_program_to_graph():
    if not session.get('graph_data_available'):
        return redirect(url_for('scrape_form', error="No active graph to add to. Please start a new one."))

    new_program_url = request.args.get('url')
    new_program_name = request.args.get('programSearch') # From add_network_form.html

    logging.log_entry(request, f"adding program {new_program_name} (url: {new_program_url}) to graph")    

    # Fetch and process data for the new program
    new_prereqs, new_details = get_information_for_major.process_program_data(new_program_url, new_program_name)

    if new_prereqs is None or new_details is None:
        return render_template('add_network_form.html', error=f"Could not process data for {new_program_name}.")

    # Retrieve current graph data from session
    current_prereqs = session.get('prereqs_data', {})
    current_details = session.get('details_data', {})

    # Merge details: Add new courses, prioritize existing details if a course code clashes.
    for code, detail_data in new_details.items():
        if code not in current_details: # Only add if it's a truly new course code
            current_details[code] = detail_data
        # Else: if course code exists, we keep the original details.
        # You could implement more sophisticated merging here if needed (e.g., update if new has more info)

    # Merge prerequisites
    for code, prereq_list in new_prereqs.items():
        if code not in current_prereqs:
            current_prereqs[code] = list(prereq_list) # Ensure it's a new list
        else:
            # Add only new prerequisites to the existing list for that course
            for prereq_item in prereq_list:
                if prereq_item not in current_prereqs[code]:
                    current_prereqs[code].append(prereq_item)

    # Store merged data back in session
    session['prereqs_data'] = current_prereqs
    session['details_data'] = current_details
    session['graph_data_available'] = True 

    return redirect(url_for('graph'))

@app.route('/modify_graph', methods=['GET']) 
def modify_nodes():

    if not session.get('graph_data_available'):
        # If no base graph, perhaps redirect to form with an error
        return redirect(url_for('scrape_form', error='Graph data not initialized. Please load or scrape a program first.'))

    request_type = request.args.get("request")
    details = session.get('details_data', {})
    prereqs = session.get("prereqs_data", {})


    #Fro some reason, not able to add node on client side, so refreshing page with new info manually
    if request_type == "add node":  # Changed from elif to if
        node_id = request.args.get("node_id")
        code = request.args.get("code")
        title = request.args.get("node_title")
        credits = request.args.get('credits', "3")
        category = request.args.get("category", "CORE")
        semesters_offered = request.args.get('semesters_offered', "Unknown")
        
        if node_id:
            details[node_id] = {
                "code": code,
                "title": title,
                "credits": credits,
                "category": category,
                "semesters_offered": semesters_offered,
                "status": "TO TAKE",
                "planned_semester": "Unassigned",
            }
            prereqs[node_id] = []

    #The rest of the requests are made using asynchronous AJAX requests, info updated with session only on refresh
    elif request_type == "edit node":
        node_id = request.args.get("node_id") # We now use the stable ID
        code = request.args.get("code")
        credits = request.args.get('credits', "N/A")
        title = request.args.get("node_title")
        category = request.args.get("category", "CORE")
        semesters_offered = request.args.get('semesters_offered', "Unknown")
                    
        # Just update the existing properties safely!
        if node_id in details:
            details[node_id]["code"] = code
            details[node_id]["credits"] = credits
            details[node_id]["title"] = title
            details[node_id]["category"] = category
            details[node_id]["semesters_offered"] = semesters_offered
        
    elif request_type == "delete node":
        # Fallback to "code" just in case you delete older nodes saved before the change
        node_id = request.args.get("node_id") or request.args.get("code")
        
        if node_id:
            if node_id in details:
                del details[node_id]
            if node_id in prereqs:
                del prereqs[node_id]
                
            # Safely scrub the deleted node from any other courses' prerequisite lists
            for req_list in prereqs.values():
                while node_id in req_list:
                    req_list.remove(node_id)
        
    elif request_type == "add edge":
        from_node = request.args.get("from_node")
        to_node = request.args.get("to_node")

        if to_node in prereqs:
            prereqs[to_node].append(from_node)
        else:
            prereqs[to_node] = [from_node]

        

    elif request_type == "delete edge":
        from_node = request.args.get("from_node")
        to_node = request.args.get("to_node")

        prereqs[to_node].remove(from_node)


    session['details_data'] = details
    session["prereqs_data"] = prereqs
    session.modified = True

    return jsonify(status="success", message="Modification made successfully")

@app.route('/save_graph_to_db', methods=['POST'])
def save_graph():
    #verify the graph got passed with the request
    if not session.get('graph_data_available'):
        return jsonify({"status": "error", "message": "No active graph to save."}), 400

    data = request.get_json()
    access_token = data.get("access_token")
    schedule_name = data.get("schedule_name", "My Degree Plan")
    
    # Check if this graph already exists in the database
    schedule_id = session.get('schedule_id') 

    if not access_token:
        return jsonify({"status": "error", "message": "User not authenticated."}), 401

    try:
        user_response = Client.auth.get_user(access_token)
        user_id = user_response.user.id

        # if data available from updates on JS side, otherwise grab the session one
        prereqs = data.get("prereqs_data", session.get('prereqs_data', {}))
        details = data.get("details_data", session.get('details_data', {}))
        credit_reqs = data.get("credit_requirements", {"core": 0, "comp": 0, "elec": 0})


        #update flask session with new data
        session['prereqs_data'] = prereqs
        session['details_data'] = details
        session['credit_requirements'] = credit_reqs

        if schedule_id:
            # UPDATE EXISTING GRAPH
            Client.table(USER_SCHEDULES_TABLE_NAME).update({
                "prereqs_data": prereqs,
                "details_data": details,
                "credit_requirements": credit_reqs # <-- Added this to the update block!
            }).eq("id", schedule_id).eq("user_id", user_id).execute()
            
            logging.log_entry(request, f"updated graph '{schedule_id}' in database")
            return jsonify({"status": "success", "message": "Graph updated successfully!", "schedule_id": schedule_id})
            
        else:
            # INSERT NEW GRAPH
            response = Client.table(USER_SCHEDULES_TABLE_NAME).insert({
                "user_id": user_id,
                "schedule_name": schedule_name,
                "prereqs_data": prereqs,
                "credit_requirements": credit_reqs, # <-- Added the missing comma here!
                "details_data": details
            }).execute()

            # Grab the newly generated UUID and save it to the session
            new_id = response.data[0]['id']
            session['schedule_id'] = new_id
            
            logging.log_entry(request, f"saved new graph '{schedule_name}' to database")
            return jsonify({"status": "success", "message": "Graph saved successfully!", "schedule_id": new_id})

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/saved_graphs')
def saved_graphs():
    user_id = session.get('user_id')
    print(user_id)
    # If Flask doesn't think they are logged in, kick them to home
    if not user_id:
        return redirect(url_for('scrape_form'))

    try:
        # Ask Supabase for this user's graphs, newest first
        response = Client.table(USER_SCHEDULES_TABLE_NAME).select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        schedules = response.data
    except Exception as e:
        print(f"Database error: {e}")
        schedules = []

    return render_template('saved_graphs.html', schedules=schedules)

@app.route('/load_graph', methods=['POST'])
def load_graph():
    schedule_id = request.form.get('schedule_id')
    user_id = session.get('user_id')
    
    if not schedule_id or not user_id:
        return redirect(url_for('saved_graphs'))
    
    try:
        # Fetch the specific graph's data from Supabase
        response = Client.table(USER_SCHEDULES_TABLE_NAME).select("*").eq("id", schedule_id).eq("user_id", user_id).execute()
        
        if response.data:
            graph = response.data[0]
            
            # Load the data into the Flask session
            session['prereqs_data'] = graph.get('prereqs_data', {})
            session['details_data'] = graph.get('details_data', {})
            session['schedule_id'] = graph.get('id')
            session['graph_data_available'] = True
            
            #Load the credit requirements into session memory
            session['credit_requirements'] = graph.get('credit_requirements', {"core": 0, "comp": 0, "elec": 0})
            
            logging.log_entry(request, f"opened saved graph '{graph.get('schedule_name')}'")
            return redirect(url_for('graph'))
            
    except Exception as e:
        print(f"Error loading graph: {e}")
    
    return redirect(url_for('saved_graphs'))

@app.route('/delete_graph', methods=['POST'])
def delete_graph():
    data = request.get_json()
    schedule_id = data.get('schedule_id')
    user_id = session.get('user_id')

    if not schedule_id or not user_id:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    
    try:
        # Delete the graph from Supabase
        Client.table(USER_SCHEDULES_TABLE_NAME).delete().eq("id", schedule_id).eq("user_id", user_id).execute()
        
        # If the user deletes the graph they are currently looking at, clear the session tracking
        if session.get('schedule_id') == schedule_id:
            session.pop('schedule_id', None)

        logging.log_entry(request, f"deleted graph '{schedule_id}'")
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/reset_password')
def reset_password():
    return render_template('reset_password.html')

@app.route('/terms_of_service') # required for google oauth
def terms_of_service():
    return render_template('terms_of_service.html')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)