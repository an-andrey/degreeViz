from flask import Flask, render_template, request, redirect, url_for
import json, os
#importing scripts
import scripts.get_prereqs as get_prereqs, scripts.scraper as scraper, scripts.get_program_codes as get_program_codes
from datetime import datetime

app = Flask(__name__)

courses_info = {}
with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)


#Make sure to update the function defined in scripts.js too
def parse_semester_to_color(semester_text):
    if not isinstance(semester_text, str): return "LightGray"

    if "Fall" in semester_text and "Winter" in semester_text: return "Orchid"
    if "Fall" in semester_text: return "Coral"
    if "Winter" in semester_text: return "LightSkyBlue"
    if "Summer" in semester_text: return "Gold"
    return "LightGray"

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
                            "color": node_data.get("color", parse_semester_to_color(sem_offered)), # Use stored color or recalculate
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

                    return render_template('index.html',
                                           prereqs=final_prereqs_for_template,
                                           details=final_details_for_template)
                
            
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
    major = request.args.get("searchResults")
    
    if action == "Visualize Program":
        course_codes = get_program_codes.get_program_codes(url)

        course_details_data = {} # dictionary of info needed to build the network
        gemini_data = {} # dictionary of minimial info needed for Gemini

        for code in course_codes:
            course_details_data[code] = {
                "title": courses_info[code]["Title"],
                "credits": courses_info[code]["Credits"],
                "semesters_offered": courses_info[code]["Terms_Offered"],
            }

            gemini_data[code] = {
                "Title": courses_info[code]["Title"],
                "Prerequisites": courses_info[code]["Prerequisites"]
            }
        
        #querying Gemini to get pre-req list
        courses_prereqs_data = get_prereqs.get_prereq_list(major, gemini_data)

        processed_details_data = {}
        for code, details in course_details_data.items():
            # Ensure all courses have details, even if minimal
            default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
            actual_details = {**default_detail, **details} # Merge with defaults

            processed_details_data[code] = {
                **actual_details, 
                "color": parse_semester_to_color(actual_details.get("semesters_offered", ""))
            }
        
        # Ensure all courses in prereqs_data have an entry in processed_details_data for the graph
        for course_code in courses_prereqs_data.keys():
            if course_code not in processed_details_data:
                processed_details_data[course_code] = {
                    "title": "Unknown Title (Prereq)", 
                    "credits": "N/A", 
                    "semesters_offered": "Unknown",
                    "color": "LightGray"
                }
                # Also ensure this course exists in course_details_data if it's a prereq but not detailed
                if course_code not in course_details_data:
                    course_details_data[course_code] = processed_details_data[course_code]


        return render_template('index.html',
                            prereqs=courses_prereqs_data,
                            details=processed_details_data)


    else:
        # Default action if no specific button was identified (e.g. initial GET request)
        # OR if form submitted without a recognized action
        if request.method == 'GET' and action is None:
            # This is an initial GET request to the form, no error needed
            return render_template('scrape_form.html')
        else:
            # This could be a GET with an unknown action or some other case
            return render_template('scrape_form.html', error="Please select a valid action.")

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port, debug=True)