import os
from celery import Celery
import json

# Your existing modules
import scraper
import get_prereqs

# --- Move parse_semester_to_color here (or a utils.py) ---
def parse_semester_to_color(semester_text):
    if not isinstance(semester_text, str): return "grey"
    text = semester_text.lower()
    if "fall and winter" in text or "autumn and winter" in text: return "LightGreen"
    if "fall" in text or "autumn" in text: return "DarkSalmon"
    if "winter" in text: return "CornFlowerBlue"
    if "summer" in text: return "Gold"
    return "LightGray"
# --- End of moved function ---

# Configure Celery:
# Railway typically provides REDIS_URL. For local dev, it can default.
redis_url = os.environ.get('REDIS_URL')

celery_app = Celery(
    'tasks',
    broker=redis_url,
    backend=redis_url
)
celery_app.conf.update(
    task_track_started=True
)

@celery_app.task(bind=True)
def run_scraping_task(self, url):
    try:
        infos = scraper.scrape_data(url)
        # scraper.scrape_data returns [courses_info, network_info, simplified_info, major]
        if not isinstance(infos, list) or len(infos) < 4:
            raise ValueError("Scraping returned unexpected data format.")
        return {
            "courses_info": infos[0],
            "network_info": infos[1],
            "gemini_data": infos[2],
            "major": infos[3]
        }
    except Exception as e:
        self.update_state(state='FAILURE', meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
        raise

@celery_app.task(bind=True)
def run_get_prereqs_task(self, scraping_output):
    try:
        major_name = scraping_output['major']
        gemini_data = scraping_output['gemini_data']
        
        courses_prereqs_data = get_prereqs.get_prereq_list(major_name, gemini_data)
        
        if isinstance(courses_prereqs_data, str) and "Error:" in courses_prereqs_data: # Check if get_prereqs returned an error string
            raise ValueError(f"Gemini prerequisite fetching failed: {courses_prereqs_data}")

        return {
            "courses_prereqs_data": courses_prereqs_data,
            "network_info": scraping_output['network_info'], # Pass through for the next task
            "major": major_name
        }
    except Exception as e:
        self.update_state(state='FAILURE', meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
        raise

@celery_app.task(bind=True)
def process_final_data_task(self, combined_results):
    try:
        courses_prereqs_data = combined_results['courses_prereqs_data']
        # This is infos[1] from the original scraper output, now called network_info
        course_details_data = combined_results['network_info'] 

        processed_details_data = {}
        for code, details in course_details_data.items():
            default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
            actual_details = {**default_detail, **details} 

            processed_details_data[code] = {
                **actual_details, 
                "color": parse_semester_to_color(actual_details.get("semesters_offered", ""))
            }
        
        for course_code in courses_prereqs_data.keys():
            if course_code not in processed_details_data:
                processed_details_data[course_code] = {
                    "title": "Unknown Title (Prereq)", 
                    "credits": "N/A", 
                    "semesters_offered": "Unknown",
                    "color": "LightGray"
                }
                # Ensure this course also exists in course_details_data if it's a prereq but not detailed
                # This logic might need refinement depending on desired behavior for course_details_data
                if course_code not in course_details_data:
                    course_details_data[course_code] = processed_details_data[course_code]
        
        return {
            "prereqs": courses_prereqs_data,
            "details": processed_details_data
        }
    except Exception as e:
        self.update_state(state='FAILURE', meta={'exc_type': type(e).__name__, 'exc_message': str(e)})
        raise