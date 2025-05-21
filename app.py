from flask import Flask, render_template, request, redirect, url_for
import json, os
#importing scripts
import get_prereqs, scraper

from datetime import datetime



app = Flask(__name__)

#Demo Data
courses_prereqs_data = {
    'MATH 133': [],
    'MATH 140': [],
    'MATH 141': ['MATH 140'],
    'COMP 202': [],
    'COMP 206': ['COMP 202'],
    'COMP 250': ['MATH 140', 'MATH 133', 'COMP 202'],
    'COMP 252': ['COMP 250', 'MATH 235'],
    'COMP 273': ['COMP 206'],
    'COMP 302': ['COMP 250', 'MATH 240'],
    'COMP 330': ['COMP 251'],
    'COMP 362': ['COMP 252'],
    'MATH 247': ['MATH 133'],
    'MATH 248': ['MATH 133'],
    'MATH 251': ['MATH 235'],
    'MATH 255': ['MATH 254'],
    'MATH 356': ['MATH 255', 'MATH 222'],
    'MATH 357': ['MATH 356'],
    'MATH 533': ['MATH 357', 'MATH 247'],
    'MATH 242': ['MATH 141'],
    'MATH 254': ['MATH 141'],
    'MATH 235': ['MATH 133'],
    'MATH 245': ['MATH 133'],
    'MATH 387': ['MATH 325', 'COMP 202', 'MATH 255'],
    'MATH 397': ['MATH 247', 'COMP 202'],
    'MATH 523': ['MATH 533'],
    'MATH 524': ['MATH 324'],
    'MATH 525': ['MATH 324'],
    'MATH 527D1': ['MATH 324', 'MATH 223', 'MATH 208', 'MATH 423'],
    'MATH 527D2': ['MATH 324', 'MATH 223', 'MATH 208', 'MATH 423'],
    'MATH 556': ['MATH 323', 'MATH 356'],
    'MATH 557': ['MATH 556', 'MATH 324'],
    'MATH 558': ['MATH 223', 'MATH 247', 'MATH 208', 'MATH 324', 'MATH 357'],
    'MATH 559': ['MATH 324', 'MATH 357', 'MATH 557', 'MATH 208'],
    'MATH 350': ['MATH 235', 'MATH 251'],
    'MATH 352': [],
    'MATH 454': ['MATH 255'],
    'MATH 462': ['MATH 247', 'MATH 248', 'COMP 202'],
    'MATH 545': ['MATH 324'],
    'MATH 563': ['MATH 223', 'MATH 248', 'MATH 255', 'COMP 202'],
    'MATH 578': ['MATH 247', 'MATH 387'],
    'MATH 587': ['MATH 356', 'MATH 255'],
    'MATH 594': [],
    'COMP 424': ['COMP 206', 'MATH 323', 'COMP 251'],
    'COMP 462': ['COMP 251', 'MATH 323'],
    'COMP 540': ['MATH 327'],
    'COMP 547': ['COMP 362', 'MATH 323'],
    'COMP 551': ['MATH 323', 'COMP 202', 'MATH 133', 'MATH 222'],
    'COMP 552': ['MATH 350'],
    'COMP 564': ['COMP 462'],
    'COMP 567': ['COMP 566']
}

course_details_data = {
    "MATH 133": {
        "title": "Linear Algebra and Geometry",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 140": {
        "title": "Calculus 1",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 141": {
        "title": "Calculus 2",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 202": {
        "title": "Foundations of Programming",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "COMP 206": {
        "title": "Introduction to Software Systems",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "COMP 250": {
        "title": "Introduction to Computer Science",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "COMP 252": {
        "title": "Honours Algorithms and Data Structures",
        "credits": "3",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 273": {
        "title": "Introduction to Computer Systems",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "COMP 302": {
        "title": "Programming Languages and Paradigms",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "COMP 330": {
        "title": "Theory of Computation",
        "credits": "3",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 362": {
        "title": "Honours Algorithm Design",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 247": {
        "title": "Honours Applied Linear Algebra",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 248": {
        "title": "Honours Vector Calculus",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 251": {
        "title": "Honours Algebra 2",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 255": {
        "title": "Honours Analysis 2",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 356": {
        "title": "Honours Probability",
        "credits": "3",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 357": {
        "title": "Honours Statistics",
        "credits": "3",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 533": {
        "title": "Regression and Analysis of Variance",
        "credits": "4",
        "semesters_offered": "Fall"
    },
    "MATH 242": {
        "title": "Analysis 1",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 254": {
        "title": "Honours Analysis 1",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 235": {
        "title": "Algebra 1",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 245": {
        "title": "Honours Algebra 1",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 387": {
        "title": "Honours Numerical Analysis",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 397": {
        "title": "Honours Matrix Numerical Analysis",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 523": {
        "title": "Generalized Linear Models",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 524": {
        "title": "Nonparametric Statistics",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 525": {
        "title": "Sampling Theory and Applications",
        "credits": "4",
        "semesters_offered": "Winter"
    },
    "MATH 527D1": {
        "title": "Statistical Data Science\n Practicum",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 527D2": {
        "title": "Statistical Data Science\n Practicum",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 556": {
        "title": "Mathematical Statistics 1",
        "credits": "4",
        "semesters_offered": "Winter"
    },
    "MATH 557": {
        "title": "Mathematical Statistics 2",
        "credits": "4",
        "semesters_offered": "Fall"
    },
    "MATH 558": {
        "title": "Design of Experiments",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 559": {
        "title": "Bayesian Theory and Methods",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 350": {
        "title": "Honours Discrete Mathematics\n",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "MATH 352": {
        "title": "Problem Seminar",
        "credits": "1",
        "semesters_offered": "Fall"
    },
    "MATH 454": {
        "title": "Honours Analysis 3",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "MATH 462": {
        "title": "Machine Learning\n",
        "credits": "3",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 545": {
        "title": "Introduction to Time Series Analysis",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 563": {
        "title": "Honours Convex Optimization\n",
        "credits": "4",
        "semesters_offered": "Fall"
    },
    "MATH 578": {
        "title": "Numerical Analysis 1",
        "credits": "4",
        "semesters_offered": "Winter"
    },
    "MATH 587": {
        "title": "Advanced Probability Theory 1",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "MATH 594": {
        "title": "Topics in Mathematics and Statistics\n",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 424": {
        "title": "Artificial Intelligence",
        "credits": "3",
        "semesters_offered": "Fall"
    },
    "COMP 462": {
        "title": "Computational Biology Methods",
        "credits": "3",
        "semesters_offered": "Winter"
    },
    "COMP 540": {
        "title": "Matrix Computations",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 547": {
        "title": "Cryptography and Data Security",
        "credits": "4",
        "semesters_offered": "Fall"
    },
    "COMP 551": {
        "title": "Applied Machine Learning",
        "credits": "4",
        "semesters_offered": "Fall and Winter"
    },
    "COMP 552": {
        "title": "Combinatorial Optimization",
        "credits": "4",
        "semesters_offered": "Fall"
    },
    "COMP 564": {
        "title": "Advanced Computational Biology Methods and Research",
        "credits": "0-3",
        "semesters_offered": "Fall"
    },
    "COMP 567": {
        "title": "Discrete Optimization 2",
        "credits": "3",
        "semesters_offered": "Winter"
    }
}

def parse_semester_to_color(semester_text):
    if not isinstance(semester_text, str): return "grey"
    text = semester_text.lower()
    if "fall and winter" in text: return "DarkOrchid"
    if "fall" in text: return "Coral"
    if "winter" in text: return "CornFlowerBlue"
    if "summer" in text: return "Gold"
    return "LightGray"

@app.route('/demo')
def index():

    processed_details_data = {}
    for code, details in course_details_data.items():
        # Ensure all demo courses have details, even if minimal
        default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
        actual_details = {**default_detail, **details} # Merge with defaults

        processed_details_data[code] = {
            **actual_details, 
            "color": parse_semester_to_color(actual_details.get("semesters_offered", ""))
        }
    
    # Include courses that are prereqs, but not part of the degree in the graph
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
                            "original_semesters_offered": sem_offered
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

    if action == "See DEMO":
        return redirect(url_for('index'))
    
    elif action == "Visualize Program":
        if not (url and url.startswith("https://coursecatalogue.mcgill.ca/en/undergraduate/") and url.endswith("/#coursestext")):
            return render_template("scrape_form.html", error="Make sure to provide a valid McGill course page url. You can find it at the <a href='https://coursecatalogue.mcgill.ca/en/undergraduate/'>Course Catalogue</a> and choose your program!")

        infos = scraper.scrape_data(url)

        major = infos[3] # the major scraped from the website
        gemini_data = infos[2] # dictionary of minimial info needed for Gemini
        
        #querying Gemini to get pre-req list
        courses_prereqs_data = get_prereqs.get_prereq_list(major, gemini_data)

        course_details_data = infos[1] # dictionary of info needed to build the network

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