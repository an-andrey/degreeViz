from scripts import get_program_codes, get_prereqs, utils
import json

courses_info = {}
honours_matches = {}

with open('static/json/courses_info.json', 'r', encoding='utf-8') as f:
    courses_info = json.load(f)

with open('static/json/honours_matches.json', 'r', encoding='utf-8') as f:
    honours_matches = json.load(f)

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
        else:
            print(f"No data prepared for Gemini for program: {major}")


        #filling in everything that's missing, and adding color field
        course_details_full = {}
        for code, details in course_details_data.items():
            default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
            actual_details = {**default_detail, **details}
            course_details_full[code] = {
                **actual_details,
                "color": utils.parse_semester_to_color(actual_details.get("semesters_offered", ""))
            }

        # Ensure all courses that Gemini gave prereqs to are actually courses to take
        for course_code_prereq in courses_prereqs_data.keys():
            if course_code_prereq not in course_details_full:
                if course_code_prereq in courses_info:
                    course_details_full[course_code_prereq] = {
                        
                            "title": f"{courses_info[course_code_prereq]["Title"]} (Prereq)",
                            "credits": courses_info[course_code_prereq]["Credits"],
                            "semesters_offered": courses_info[course_code_prereq]["Terms_Offered"],
                            "color": "LightSteelBlue"
                    }
                else:
                    course_details_full[course_code_prereq] = {"title": "Details Not Found", "credits": "N/A", "semesters_offered": "Unknown", "color": "LightSteelBlue"}

            #if in an honours program, swapping all regular prereqs to the honours one.
            for i in range(len(courses_prereqs_data[course_code_prereq])):
                prereq_code = courses_prereqs_data[course_code_prereq][i]

                if major[:7] == "Honours" and prereq_code in honours_matches:
                    courses_prereqs_data[course_code_prereq][i] = honours_matches[prereq_code]
                    
 
            # Ensure all prereqs for each course also have all info
            for prereq_item in courses_prereqs_data[course_code_prereq]:
                if prereq_item not in course_details_full:
                    if prereq_item in courses_info:
                        course_details_full[prereq_item] = {
                            "title": f"{courses_info[prereq_item]["Title"]} (Prereq)",
                            "credits": courses_info[prereq_item]["Credits"],
                            "semesters_offered": courses_info[prereq_item]["Terms_Offered"],
                            "color": "LightSteelBlue"
                        }
                    else:
                        course_details_full[prereq_code] = {"title": "Details Not Found (Prereq)", "credits": "N/A", "semesters_offered": "Unknown", "color": "LightSteelBlue"}


        return courses_prereqs_data, course_details_full
    except Exception as e:
        print(f"Error in process_program_data for {program_url}: {e}")
        return None, None