from scripts import get_program_codes, get_prereqs, utils
import json

courses_info = {}

with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)

def process_program_data(program_url, major):
    try:
        course_codes = get_program_codes.get_program_codes(program_url)
        if not course_codes:
            print(f"No course codes found for URL: {program_url}")
            return None, None

        course_details_data = {}
        gemini_data = {}

        for code in course_codes:
            if code in courses_info:
                course_details_data[code] = {
                    "title": courses_info[code]["Title"],
                    "credits": courses_info[code]["Credits"],
                    "semesters_offered": courses_info[code]["Terms_Offered"],
                }
                gemini_data[code] = {
                    "Title": courses_info[code]["Title"],
                    "Prerequisites": courses_info[code]["Prerequisites"],
                    "Corequisites": courses_info[code]["Corequisites"],
                }
            else:
                print(f"Warning: Course code {code} from program {major} not found in global courses_info.json")
                # Add a placeholder if not found in global courses_info
                course_details_data[code] = {
                    "title": f"{code} (Details not found)",
                    "credits": "N/A",
                    "semesters_offered": "Unknown",
                }

                  # Querying Gemini to get pre-req list
        # Ensure gemini_data is not empty before calling get_prereq_list
        courses_prereqs_data = {}
        if gemini_data:
            courses_prereqs_data = get_prereqs.get_prereq_list(major, gemini_data)
            print(courses_prereqs_data)
        else:
            print(f"No data prepared for Gemini for program: {major}")


        processed_details_data = {}
        for code, details in course_details_data.items():
            default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
            actual_details = {**default_detail, **details}
            processed_details_data[code] = {
                **actual_details,
                "color": utils.parse_semester_to_color(actual_details.get("semesters_offered", ""))
            }

        # Ensure all courses in new_courses_prereqs_data have an entry in new_processed_details_data
        for course_code_prereq in courses_prereqs_data.keys():
            if course_code_prereq not in processed_details_data:
                processed_details_data[course_code_prereq] = {
                    "title": f"{courses_info[course_code_prereq]["Title"]} (Prereq)",
                    "credits": courses_info[course_code_prereq]["Credits"],
                    "semesters_offered": courses_info[course_code_prereq]["Terms_Offered"],
                    "color": "LightSteelBlue"
                }
            # Also ensure all individual prerequisites are in details
            for prereq_item in courses_prereqs_data[course_code_prereq]:
                if prereq_item not in processed_details_data:
                    processed_details_data[prereq_item] = {
                        "title": f"{courses_info[prereq_item]["Title"]} (Prereq)",
                        "credits": courses_info[prereq_item]["Credits"],
                        "semesters_offered": courses_info[prereq_item]["Terms_Offered"],
                        "color": "LightSteelBlue"
                    }


        return courses_prereqs_data, processed_details_data
    except Exception as e:
        print(f"Error in process_program_data for {program_url}: {e}")
        return None, None