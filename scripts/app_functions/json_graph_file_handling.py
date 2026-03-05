import json
from scripts import utils

#parsing user inputted json for their graph
def parse_json_graph_file(file):
    if not file or not file.endswith(".json"):
        return False
    
    try:
        loaded_data = json.load(file) # Parse the JSON file stream
        if 'nodes' not in loaded_data or 'edges' not in loaded_data:
            return False
    
    except Exception: 
        return False

    return True
    
def process_json_graph_file(file):
    loaded_data = json.load(file) # Parse the JSON file stream

    # Prepare data structures for graph.html
    prereqs_data = {}
    details_data = {}

    # Process nodes from the loaded JSON
    for node_data in loaded_data.get('nodes', []):
        node_id = node_data.get('id')

        # Extract details, using fallbacks for robustness
        sem_offered = node_data.get("original_semesters_offered", node_data.get("semesters_offered", "Unknown"))
        details_data[node_id] = {
            "title": node_data.get("original_title", node_data.get("title", "Unknown Title")),
            "credits": node_data.get("original_credits", node_data.get("credits", "N/A")),
            "semesters_offered": sem_offered,
            "color": node_data.get("color", utils.parse_semester_to_color(sem_offered)), 
            "id": node_id,
            "label": node_data.get("label", f"{node_id}\nUnknown Title\n(N/A credits)"),
            "shape": node_data.get("shape", "box"),
            "font": node_data.get("font", {'multi': 'html', 'align': 'center'}),
            "original_title": node_data.get("original_title", "Unknown Title"), 
            "original_credits": node_data.get("original_credits", "N/A"),
            "original_semesters_offered": sem_offered,
            "x": node_data.get("x"),
            "y": node_data.get("y")
        }
        prereqs_data[node_id] = [] # Initialize prereqs list for this node

    # Process edges from the loaded JSON
    for edge_data in loaded_data.get('edges', []):
        from_node = edge_data.get('from')
        to_node = edge_data.get('to')
        if from_node and to_node:
            if to_node not in prereqs_data:
                prereqs_data[to_node] = []
                if to_node not in details_data: 
                        details_data[to_node] = {
                        "title": f"{to_node} (Prereq from Edge)", "credits": "N/A", 
                        "semesters_offered": "Unknown", "color": "grey", "id": to_node,
                        "label": f"{to_node}\n(Prereq from Edge)\n(N/A credits)", "shape": "box",
                        "font": {'multi': 'html', 'align': 'center'},
                        "original_title": f"{to_node} (Prereq from Edge)", "original_credits": "N/A",
                        "original_semesters_offered": "Unknown"
                        }
            prereqs_data[to_node].append(from_node)

    return prereqs_data, details_data

