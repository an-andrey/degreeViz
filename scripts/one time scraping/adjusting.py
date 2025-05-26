import json

#This file must be run after raw_json to update the json file to the right format and modyfing some of the entries of the json


# --- Step 1: Load original JSON data ---
with open("static/json/raw.json", "r", encoding="utf-8") as file:
    original_data = json.load(file)

# --- Step 2: Transform data using Course_Code as key ---
transformed_data = {
    course["Course_Code"]: {
        key: value for key, value in course.items() if key != "Course_Code"
    }
    for course in original_data
}

# --- Step 3: Clean data ---
def clean_text(obj):
    if isinstance(obj, dict):
        return {k: clean_text(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_text(i) for i in obj]
    elif isinstance(obj, str):
        return obj.replace("\n", " ").rstrip(".")  # Remove newlines and trailing period
    return obj

cleaned_data = {}
for code, course in transformed_data.items():
    course["Title"] = course.get("Title", "").rstrip(".")  # Remove trailing period from title only
    cleaned_data[code] = clean_text(course)  # Clean rest of the fields

# --- Step 4: Save cleaned data ---
with open("static/json/courses_info.json", "w", encoding="utf-8") as f:
    json.dump(cleaned_data, f, indent=2, ensure_ascii=False)



print("Saved cleaned data to courses_info.json")
