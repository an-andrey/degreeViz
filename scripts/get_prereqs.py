from google import genai
import json
import os
from dotenv import load_dotenv


#returns (hopefully) a dictionnary of the pre-requisities
def get_prereq_list(major_name, major_courses_data):
    # Access the API key from Colab secrets
    load_dotenv()

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    client = genai.Client()

    courses_json_string = json.dumps(major_courses_data, indent=None, separators=(',', ':')) # Even more compact JSON
    
    prompt = f"""
    You are an academic advisor of McGill Univserity, tasked with creating a python dictionary of a recommended definite pre-requisite selection for the courses provided by the programmers. 
    Given courses for '{major_name}' major, Identify definitive prerequisites and corequisites. For corequisites, treat each corequisite as a prerequisite for the other course involved.
    Resolve 'OR' ambiguities by choosing the most relevant course within the major. If you are given an OR, make sure to choose a course that is part of the courses provided, when possible.
    Ignore corequisites and 'permission of department' if a course is specified. OUTPUT ONLY THE PYTHON DICTIONARY, NOTHING ELSE in the format of {{course_code: [prereqs and coreqs]}}.
    The pre-reqs should only be course codes, drop anything that is not a course code.
    {courses_json_string} 
    """

    try:   
        response = client.models.generate_content(
            model='gemini-2.0-flash',
            contents=prompt
        )

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
    except Exception as e:
        # try one more time just in case if something is wrong
        try:
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt
            )

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
    
        except Exception as e:
            return f"Error: {e}\nResponse from Gemini: {response.text}"
