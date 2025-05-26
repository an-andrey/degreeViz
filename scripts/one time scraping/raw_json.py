import requests
from bs4 import BeautifulSoup
import json


# Code to get all courses in mcgill from the url of the list of courses: "https://coursecatalogue.mcgill.ca/courses/"


def get_all_links(url):
    """
    :param url:
    :return: Get all courses link in course catalogue
    """
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")
    list_of_links = []
    course_links = soup.select("#textcontainer li a")
    count = 0
    for link in course_links:
        count += 1
        href = link.get("href")
        if href:
            full_url = "https://coursecatalogue.mcgill.ca" + href
            list_of_links.append(full_url)

    return list_of_links

def get_terms():
    """
    :return: the terms in which the classes will be offered
    """
    terms = None

    # Case 1: <span class="value"> inside terms_offered
    terms_div = soup.find("div", class_="text detail-terms_offered margin--tiny")
    if terms_div:
        value_span = terms_div.find("span", class_="value")
        if value_span:
            terms = value_span.text.strip()

    # Case 2: fallback to scheduled_terms div text
    if not terms:
        scheduled_div = soup.find("div", class_="text detail-scheduled_terms margin--tiny")
        if scheduled_div:
            terms = scheduled_div.text.strip()

    # Final fallback
    if not terms:
        terms = "This course is not offered this catalogue year."

    return terms

def get_prereq():
    """
    :return: the prereq and coreq as strings
    """
    note_div = soup.select_one("div.text.detail-note_text")
    prereq_text = "None"
    coreq_text = "None"

    if note_div:
        all_notes = note_div.find_all("li")
        for note in all_notes:
            text = note.text.strip().lower()
            if text.startswith("prerequisite"):
                prereq_text = note.text.replace("Prerequisite:", "").replace("Prerequisites:", "").strip()
            elif text.startswith("corequisite"):
                coreq_text = note.text.replace("Corequisite:", "").replace("Corequisites:", "").strip()

    return prereq_text, coreq_text




url = "https://coursecatalogue.mcgill.ca/courses/"
list_of_links = get_all_links(url)
count = 0
courses = []
for url in list_of_links:

    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")

    # getting the course title and code
    raw_title = soup.find("h1", class_="page-title").text.strip()
    parts = raw_title.split('.', 1)  # Split at the first period only
    if len(parts) == 2:
        course_code = parts[0].strip()
        title = parts[1].strip()
    else:
        course_code = ""
        title = raw_title

    description_div = soup.find("div", class_="section__content")
    description = description_div.text.strip() if description_div else "No description available."

    #Getting general course info
    credits = soup.find("div", class_="text detail-credits margin--tiny").find("span", class_="value").text.strip()
    faculty = soup.find("div", class_="text detail-offered_by margin--tiny").find("span", class_="value").text.strip()
    terms = get_terms()
    prereq_text, coreq_text = get_prereq()

    course_data = {
        "Course_Code": course_code,
        "Title": title,
        "Credits": credits,
        "Faculty": faculty,
        "Terms_Offered": terms,
        "Prerequisites": prereq_text,
        "Corequisites": coreq_text,
        "Course_Description": description,
        "url": url
    }

    courses.append(course_data)
    count+=1
    print(count)

# Save to JSON file
with open("courses.json", "w", encoding="utf-8") as f:
    json.dump(courses, f, indent=2, ensure_ascii=False)