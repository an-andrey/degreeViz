from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import json, os
#importing scripts
from scripts import get_program_codes, get_prereqs, prepare_data, utils
from datetime import datetime

app = Flask(__name__)
app.secret_key = "test"


courses_info = {}
with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)

@app.route('/', methods=['GET', "POST"])
def scrape_route():
    
    #adding a log for each user query
    user_ip = request.remote_addr
    timestamp = datetime.now()

    if request.args.get("action") == "Scrape and Visualize":
        print(f"user {user_ip} made a {request.args.get('action')} request for {request.args.get('url')} at {timestamp}")
    else:
        print(f"user {user_ip} made a {request.args.get('action')} request at {timestamp}")


    if request.method == 'POST':

        # when a user uploads a JSON file
        action = request.form.get('action')
        if action == "Load Graph":

            if 'graphFile' not in request.files:
                return render_template('scrape_form.html', error="No file selected for upload.")
            
            file = request.files['graphFile']

            if file.filename == '':
                return render_template('scrape_form.html', error="No file selected for upload.")
            
            if file and file.filename.endswith('.json'):
                try:
                    loaded_data = json.load(file) # Parse the JSON file stream
                    
                    # Prepare data structures for index.html
                    final_prereqs_for_template = {}
                    final_details_for_template = {}

                    if 'nodes' not in loaded_data or 'edges' not in loaded_data:
                        return render_template('scrape_form.html', error="Invalid JSON graph file: 'nodes' or 'edges' key missing.")

                    # Process nodes from the loaded JSON
                    for node_data in loaded_data.get('nodes', []):
                        node_id = node_data.get('id')
                        if not node_id: 
                            print("Skipping node without ID from JSON:", node_data)
                            continue 

                        # Extract details, using fallbacks for robustness
                        sem_offered = node_data.get("original_semesters_offered", node_data.get("semesters_offered", "Unknown"))
                        final_details_for_template[node_id] = {
                            "title": node_data.get("original_title", node_data.get("title", "Unknown Title")),
                            "credits": node_data.get("original_credits", node_data.get("credits", "N/A")),
                            "semesters_offered": sem_offered,
                            "color": node_data.get("color", utils.parse_semester_to_color(sem_offered)), # Use stored color or recalculate
                            "id": node_id,
                            "label": node_data.get("label", f"{node_id}\nUnknown Title\n(N/A credits)"),
                            "shape": node_data.get("shape", "box"),
                            "font": node_data.get("font", {'multi': 'html', 'align': 'center'}),
                            "original_title": node_data.get("original_title", "Unknown Title"), # Ensure these are passed for editing
                            "original_credits": node_data.get("original_credits", "N/A"),
                            "original_semesters_offered": sem_offered,
                            "x": node_data.get("x"),
                            "y": node_data.get("y")
                        }
                        final_prereqs_for_template[node_id] = [] # Initialize prereqs list for this node

                    # Process edges from the loaded JSON
                    for edge_data in loaded_data.get('edges', []):
                        from_node = edge_data.get('from')
                        to_node = edge_data.get('to')
                        if from_node and to_node:
                            if to_node not in final_prereqs_for_template:
                                final_prereqs_for_template[to_node] = []
                                if to_node not in final_details_for_template: 
                                     final_details_for_template[to_node] = {
                                        "title": f"{to_node} (Prereq from Edge)", "credits": "N/A", 
                                        "semesters_offered": "Unknown", "color": "grey", "id": to_node,
                                        "label": f"{to_node}\n(Prereq from Edge)\n(N/A credits)", "shape": "box",
                                        "font": {'multi': 'html', 'align': 'center'},
                                        "original_title": f"{to_node} (Prereq from Edge)", "original_credits": "N/A",
                                        "original_semesters_offered": "Unknown"
                                     }
                            final_prereqs_for_template[to_node].append(from_node)
                    
                    if not final_details_for_template: # Check if any nodes were actually processed
                         return render_template('scrape_form.html', error="No valid node data found in the uploaded JSON file.")

                    #Saving the variable to session
                    session['prereqs_data'] = final_prereqs_for_template
                    session['details_data'] = final_details_for_template
                    session['graph_data_available'] = True

                    return redirect("view_graph")
                
                except json.JSONDecodeError:
                    return render_template('scrape_form.html', error="Invalid JSON file: Could not parse content.")
                except Exception as e:
                    print(f"Error processing uploaded graph file: {e}") # Log the actual error
                    return render_template('scrape_form.html', error=f"An error occurred while processing the graph file: {e}")
            else:
                return render_template('scrape_form.html', error="Invalid file type. Please upload a .json file.")
        else:
            # If POST but not "Load Graph" action
            return render_template('scrape_form.html', error="Unknown POST action.")

    action = request.args.get('action')
    url = request.args.get('url')
    major = request.args.get("programSearch")
    
    if action == "Visualize Program":
        courses_prereqs_data, processed_details_data = prepare_data.process_program_data(url, major)
        
        #Saving the variable to session
        session['prereqs_data'] = courses_prereqs_data
        session['details_data'] = processed_details_data
        session['graph_data_available'] = True

        return redirect("view_graph")

    else:
        # Default action if no specific button was identified (e.g. initial GET request)
        # OR if form submitted without a recognized action
        if request.method == 'GET' and action is None:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            # This is an initial GET request to the form, no error needed
            return render_template('scrape_form.html')
        else:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            # This could be a GET with an unknown action or some other case
            return render_template('scrape_form.html', error="Please select a valid action.")


#see if there's a saved graph
@app.route("/view_graph", methods=["GET","POST"])
def view_graph():
    if session.get('graph_data_available'):
        prereqs = session.get('prereqs_data', {})
        details = session.get('details_data', {})
        return render_template('index.html', prereqs=prereqs, details=details)
    else:
        # If no data, redirect to home to load/scrape a program
        return redirect(url_for('scrape_form'))

@app.route("/add_program")
def add_program():
    if not session.get('graph_data_available'):
        return redirect(url_for('scrape_form', error="Please load or visualize a base program first."))
    return render_template("add_network_form.html")

@app.route("/add_program_to_graph", methods=["GET"])
def add_program_to_graph():
    user_ip = request.remote_addr
    timestamp = datetime.now()

    if not session.get('graph_data_available'):
        return redirect(url_for('scrape_form', error="No active graph to add to. Please start a new one."))

    new_program_url = request.args.get('url')
    new_program_name = request.args.get('programSearch') # From add_network_form.html

    if not new_program_url or not new_program_name:
        return render_template('add_network_form.html', error="Program URL or name missing.")

    print(f"User {user_ip} attempting to add program {new_program_name} ({new_program_url}) at {timestamp}")

    # Fetch and process data for the new program
    new_prereqs, new_details = prepare_data.process_program_data(new_program_url, new_program_name)

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
    session['graph_data_available'] = True # Ensure this is set

    print(f"Successfully merged {new_program_name} into the graph for user {user_ip} at {timestamp}")
    return redirect(url_for('view_graph'))

@app.route('/modify_graph', methods=['GET']) 
def handle_add_node_via_redirect():

    if not session.get('graph_data_available'):
        # If no base graph, perhaps redirect to form with an error
        return redirect(url_for('scrape_form', error='Graph data not initialized. Please load or scrape a program first.'))

    request_type = request.args.get("request")
    details = session.get('details_data', {})
    prereqs = session.get("prereqs_data", {})

    print(f"got {request_type} request")
    
    #Fro some reason, not able to add node on client side, so refreshing page with new info manually
    if request_type == "add node":
        # Extract data from query parameters
        code = request.args.get('code')
        credits = request.args.get('credits', "N/A")
        title = request.args.get("node_title")
        semesters_offered = request.args.get('semesters_offered', "Unknown")
        x = request.args.get('x')
        y = request.args.get('y')

        # Add the node in details_data
        details[code] = {
            "title": title, 
            "credits": credits,
            "semesters_offered": semesters_offered,
            "x": x,
            "y": y,
            "color": utils.parse_semester_to_color(semesters_offered)
        }

        session['details_data'] = details
        session.modified = True

        return redirect(url_for('view_graph'))

    #The rest of the requests are made using asynchronous AJAX requests, info updated with session only on refresh
    elif request_type == "edit node":
        code = request.args.get("code")
        credits = request.args.get('credits', "N/A")
        title = request.args.get("node_title")
        semesters_offered = request.args.get('semesters_offered', "Unknown")
        
        #update existing info
        details[code]["credits"] = credits
        details[code]["title"] = title
        details[code]["semesters_offered"] = semesters_offered
        details[code]["color"] = utils.parse_semester_to_color(semesters_offered)
        
    elif request_type == "delete node":
        code = request.args.get("code")

        del details[code] 
        if code in prereqs:
            del prereqs[code]

        for course_code in list(prereqs.keys()):
            preqreq_list = prereqs[course_code]

            if code in preqreq_list:
                preqreq_list.remove(code)
        
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
    




if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)