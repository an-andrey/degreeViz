import json

#This file creates a dictionnary of honours course and their
#equivalent non honours course with the code of the non-honours course as the key


# NOTE THAT SOME OF THE ENTRIES IN THE JSON PRODUCED BY THIS FILE WHERE MANUALLY DELETED SUCH AS HONOURS 
# HISTORY CLASSES WITH THEIR GRADUATE VERSION

# Load the cleaned JSON file
with open("static/json/courses_info.json", "r", encoding="utf-8") as file:
    data = json.load(file)

# Normalize and map by department
normalized_titles_by_dept = {}

for code, info in data.items():
    title = info.get("Title", "")
    normalized = title.lower().replace("honours", "").replace("  ", " ").strip()
    dept = code.split()[0]  # First 4-letter prefix
    if dept not in normalized_titles_by_dept:
        normalized_titles_by_dept[dept] = {}
    if normalized not in normalized_titles_by_dept[dept]:
        normalized_titles_by_dept[dept][normalized] = []
    normalized_titles_by_dept[dept][normalized].append((code, title))

# Now find Honours courses and try to match with non-Honours ones from same dept
honours_matches = []
count = 0

# We exclude these words since these types of classes do not have non-honours version
excluded_keywords = {"seminar", "thesis", "research", "project", "essay", "Colloquium"}

for code, info in data.items():
    title = info.get("Title", "")
    title_lower = title.lower()

    # Check if it's an Honours course and not excluded
    if "honours" in title_lower and not any(keyword in title_lower for keyword in excluded_keywords):
        count += 1
        print(title)
        dept = code.split()[0]
        normalized = title_lower.replace("honours", "").replace("  ", " ").strip()

        possible_matches = normalized_titles_by_dept.get(dept, {}).get(normalized, [])
        for match_code, match_title in possible_matches:
            if "honours" not in match_title.lower():
                honours_matches.append({
                    "honours_course": f"{code}: {title}",
                    "non_honours_course": f"{match_code}: {match_title}"
                })

# Print results
count2 = 0
for match in honours_matches:
    count2 += 1
    print("Honours:        ", match["honours_course"])
    print("Non-Honours:    ", match["non_honours_course"])
    print()
print(count2)
print(count)
print(honours_matches)
# Create a dictionary for output
# Create a dictionary where key and value are just the course codes (before the colon)
honours_match_dict = {}

for match in honours_matches:
    non_hon_code = match["non_honours_course"].split(":")[0].strip()
    hon_code = match["honours_course"].split(":")[0].strip()
    honours_match_dict[non_hon_code] = hon_code

# Save to JSON
with open("static/json/honours_matches.json", "w", encoding="utf-8") as outfile:
    json.dump(honours_match_dict, outfile, indent=2, ensure_ascii=False)