import json
import os

from dotenv import load_dotenv
from google import genai


def build_prerequisite_map(program_name, program_courses_data):
    """Ask Gemini to turn catalogue prereq text into a simple prereq map."""
    load_dotenv()

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=gemini_api_key)

    courses_json_string = json.dumps(program_courses_data, indent=None, separators=(',', ':'))
    
    prompt = f"""
    You are an academic advisor of McGill Univserity, tasked with creating a python dictionary of a recommended definite pre-requisite selection for the courses provided by the programmers. 
    Given courses for '{program_name}', Identify definitive prerequisites and corequisites. For corequisites, treat each corequisite as a prerequisite for the other course involved.
    Resolve 'OR' ambiguities by choosing the most relevant course within the program. If you are given an OR, make sure to choose a course that is part of the courses provided, when possible.
    Ignore corequisites and 'permission of department' if a course is specified. OUTPUT ONLY THE PYTHON DICTIONARY, NOTHING ELSE in the format of {{course_code: [prereqs and coreqs]}}.
    The pre-reqs should only be course codes, drop anything that is not a course code.
    {courses_json_string} 
    """
    response = ""
    try:
        try:  
            response = client.models.generate_content(
                model='gemini-2.5-flash-lite',
                contents=prompt
            )
        except Exception:
            return {}

        text_response = response.text.strip()

        # Clean up markdown blocks and attempt to parse
        if text_response.startswith("```python"):
            text_response = text_response[len("```python"):].strip()
        if text_response.startswith("```json"):
            text_response = text_response[len("```json"):].strip()
        if text_response.endswith("```"):
            text_response = text_response[:-len("```")].strip()

        resolved_prereqs = json.loads(text_response.replace("'", '"'))
        return resolved_prereqs
    except Exception:
        return {}


def parse_requirement_rules(program_name, rule_texts):
    """Ask Gemini to structure plain-English requirement constraints."""
    load_dotenv()
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=gemini_api_key)
    prompt = f"""
    For McGill program '{program_name}', convert these plain-English degree rules into strict JSON array.
    Output ONLY JSON. Schema per item: {{"rule_text": str, "allowed_prefixes": [str], "min_level": int|null, "exclude_courses": [str], "must_have_credits_at_level": {{"level": int, "credits": int}}|null}}
    Rules:
    {json.dumps(rule_texts)}
    """
    try:
        resp = client.models.generate_content(model='gemini-2.5-flash-lite', contents=prompt)
        txt = resp.text.strip()
        if txt.startswith("```json"):
            txt = txt[len("```json"):].strip()
        if txt.endswith("```"):
            txt = txt[:-3].strip()
        return json.loads(txt)
    except Exception:
        return []
