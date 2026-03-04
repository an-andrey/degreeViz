from flask import Flask, render_template, request, redirect, url_for, jsonify, session
import json, os
from flask_session import Session
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

Session(app)

courses_info = {}
with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)

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

                return redirect("view_graph")

    url = request.args.get('url')
    major = request.args.get("programSearch")
    
    if action == "Visualize Program": 
        courses_prereqs_data, processed_details_data = get_information_for_major.process_program_data(url, major) #scrape the major's site and grab all info
        
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
            # This is an initial GET request to the form
            return render_template('scrape_form.html')
        else:
            session.pop('prereqs_data', None)
            session.pop('details_data', None)
            session.pop('graph_data_available', None)
            return render_template('scrape_form.html', error="Please select a valid action.")

@app.route("/view_graph", methods=["GET","POST"]) #main route where graph is displayed
def view_graph(): 
    if session.get('graph_data_available'): #see if there's a saved graph
        prereqs = session.get('prereqs_data', {})
        details = session.get('details_data', {})
        logging.log_entry(request, "displaying graph")
        return render_template('graph_view.html', prereqs=prereqs, details=details)
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

    return redirect(url_for('view_graph'))

@app.route('/modify_graph', methods=['GET']) 
def modify_nodes():

    if not session.get('graph_data_available'):
        # If no base graph, perhaps redirect to form with an error
        return redirect(url_for('scrape_form', error='Graph data not initialized. Please load or scrape a program first.'))

    request_type = request.args.get("request")
    details = session.get('details_data', {})
    prereqs = session.get("prereqs_data", {})


    #Fro some reason, not able to add node on client side, so refreshing page with new info manually
    if request_type == "add node":
        # Extract data from query parameters
        code = request.args.get('code')
        credits = request.args.get('credits', "N/A")
        title = request.args.get("title")
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
        
        prereqs[code] = []

        session['details_data'] = details
        session['prereqs_data'] = prereqs

        session.modified = True
        print("updated session after adding node")
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