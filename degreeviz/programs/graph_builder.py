import json
import logging
import re
from pathlib import Path

from degreeviz.errors import ProgramScrapeError
from degreeviz.programs import catalogue_page, llm_prerequisites, requirements

COURSES_INFO_PATH = Path("static/json/courses_info.json")
HONOURS_MATCHES_PATH = Path("static/json/honours_matches.json")

courses_info: dict = {}
honours_matches: dict = {}
logger = logging.getLogger("degreeviz")

with COURSES_INFO_PATH.open("r", encoding="utf-8") as f:
    courses_info = json.load(f)

with HONOURS_MATCHES_PATH.open("r", encoding="utf-8") as f:
    honours_matches = json.load(f)


def build_program_graph(program_url: str, program_name: str | None):
    """Build prerequisite, detail, and requirement data for one McGill program.

    A McGill "program" may be a major, minor, honours program, concentration,
    or any other catalogue plan. The returned tuple is the server-side source
    for the interactive browser graph.

    Raises:
        ProgramScrapeError: if the program page cannot be fetched or parsed.
    """
    try:
        program_soup = catalogue_page.fetch_program_soup(program_url)
        course_codes = catalogue_page.extract_program_course_codes(program_url, soup=program_soup)
        requirements_data = requirements.extract_program_requirements(program_soup)
        program_slug = re.sub(r"[^a-z0-9]+", "-", (program_name or "program").lower()).strip("-") or "program"
        for idx, bucket in enumerate(requirements_data.get("buckets", []), start=1):
            bucket["program_name"] = program_name
            bucket_id = bucket.get("id") or f"bucket-{idx}"
            if not str(bucket_id).startswith(f"{program_slug}-"):
                bucket["id"] = f"{program_slug}-{bucket_id}"

        requirements_data["course_to_bucket"] = {
            code: (f"{program_slug}-{bucket_id}" if bucket_id and not str(bucket_id).startswith(f"{program_slug}-") else bucket_id)
            for code, bucket_id in requirements_data.get("course_to_bucket", {}).items()
        }
        rule_texts = [b.get("constraints_text") for b in requirements_data.get("buckets", []) if b.get("constraints_text")]
        requirements_data["parsed_rules"] = llm_prerequisites.parse_requirement_rules(program_name, rule_texts) if rule_texts else []
        if not course_codes:
            raise ProgramScrapeError(
                f"No course codes found for URL: {program_url}",
                user_message="Unable to find courses for that program.",
                details={"program": program_name, "url": program_url},
            )

        course_details_data = {}
        llm_course_data = {}

        for code in course_codes:
            if code in courses_info:
                course_details_data[code] = {
                    "title": courses_info[code]["Title"],
                    "credits": courses_info[code]["Credits"],
                    "semesters_offered": courses_info[code]["Terms_Offered"],
                }
                llm_course_data[code] = {
                    "Title": courses_info[code]["Title"],
                    "Prerequisites": courses_info[code]["Prerequisites"],
                    "Corequisites": courses_info[code]["Corequisites"],
                }
            else:
                logger.warning("Course code %s from program %s not found in courses_info.json", code, program_name)
                fallback_metadata = catalogue_page.extract_course_metadata_from_program_page(code, program_soup)
                course_details_data[code] = fallback_metadata or {
                    "title": f"{code} (Details not found)",
                    "credits": "N/A",
                    "semesters_offered": "Unknown",
                }

        # Query Gemini for a simplified prerequisite map. Static course data is
        # still the source of truth for titles/credits/terms.
        courses_prereqs_data = {}
        if llm_course_data:
            courses_prereqs_data = llm_prerequisites.build_prerequisite_map(program_name, llm_course_data)
            if not isinstance(courses_prereqs_data, dict):
                logger.warning("Gemini prereq response for %s was %s, expected dict", program_name, type(courses_prereqs_data).__name__)
                courses_prereqs_data = {}
        else:
            logger.warning("No Gemini prereq data prepared for program %s", program_name)


        # Fill in any metadata that downstream graph views expect.
        course_details_full = {}
        for code, details in course_details_data.items():
            default_detail = {"title": "Unknown Title", "credits": "N/A", "semesters_offered": "Unknown"}
            actual_details = {**default_detail, **details}
            bucket_id = requirements_data.get("course_to_bucket", {}).get(code)
            bucket = next(
                (bucket for bucket in requirements_data.get("buckets", []) if bucket.get("id") == bucket_id),
                None,
            )
            category = "CORE" if (bucket and bucket.get("category") == "CORE") else "COMPLEMENTARY"
            course_details_full[code] = {
                **actual_details,
                "category": category,
                "requirement_bucket": bucket_id,
                "requirement_bucket_title": bucket.get("title") if bucket else None,
                "requirement_min_credits": bucket.get("min_credits") if bucket else 0,
                "requirement_max_credits": bucket.get("max_credits") if bucket else None,
                "include_in_graph": True if (bucket and bucket.get("category") == "CORE") else False,
                "status": "TO TAKE" if category == "CORE" else "Unassigned",
                "planned_semester": "Unassigned",
            }

        # Ensure all courses that Gemini gave prereqs to are actually courses to take
        for course_code_prereq in courses_prereqs_data.keys():
            if course_code_prereq not in course_details_full:
                if course_code_prereq in courses_info:
                    course_details_full[course_code_prereq] = {
                        
                            "title": f"{courses_info[course_code_prereq]['Title']} (Prereq)",
                            "credits": courses_info[course_code_prereq]["Credits"],
                            "semesters_offered": courses_info[course_code_prereq]["Terms_Offered"],
                    }
                else:
                    course_details_full[course_code_prereq] = {"title": "Details Not Found", "credits": "N/A", "semesters_offered": "Unknown"}

            #if in an honours program, swapping all regular prereqs to the honours one.
            for i in range(len(courses_prereqs_data[course_code_prereq])):
                prereq_code = courses_prereqs_data[course_code_prereq][i]

                if (program_name or "").startswith("Honours") and prereq_code in honours_matches:
                    courses_prereqs_data[course_code_prereq][i] = honours_matches[prereq_code]
                    

            # Ensure all prereqs for each course also have all info
            for prereq_item in courses_prereqs_data[course_code_prereq]:
                if prereq_item not in course_details_full:
                    if prereq_item in courses_info:
                        course_details_full[prereq_item] = {
                            "title": f"{courses_info[prereq_item]['Title']} (Prereq)",
                            "credits": courses_info[prereq_item]["Credits"],
                            "semesters_offered": courses_info[prereq_item]["Terms_Offered"],
                        }
                    else:
                        course_details_full[prereq_code] = {"title": "Details Not Found (Prereq)", "credits": "N/A", "semesters_offered": "Unknown"}


        return courses_prereqs_data, course_details_full, requirements_data
    except Exception as e:
        if isinstance(e, ProgramScrapeError):
            raise
        raise ProgramScrapeError(
            f"Error in build_program_graph for {program_url}: {e}",
            details={"program": program_name, "url": program_url},
        ) from e
