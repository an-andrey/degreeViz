import requests
from bs4 import BeautifulSoup
import time
import json

#returns an array with 3 dictionaries of scraped data
# [full info, info for the network, pre_requisite info]
def scrape_data(url):

    def extract_course_info(url):
        res = requests.get(url)
        soup = BeautifulSoup(res.text, 'html.parser')

        #finding the major
        major = soup.find("h1", class_="page-title")
        if major:
            major = major.get_text(strip=True)
        else:
            "Degree Not Found"

        #finding all required courses: 
        course_codes = soup.find_all("td", class_="codecol")
        course_codes = [code.get_text(strip=True) for code in course_codes]

        #finding all the credits: 
        credits_list = soup.find_all("td", class_="hourscol")
        credits_list = [credit.get_text(strip=True) for credit in credits_list]

        #finding all the titles: 
        titles_list = soup.find_all("p", class_="bubbledrawer__title")
        titles_list = [title.get_text(strip=True) for title in titles_list]
        
        #finding all the descriptions: 
        desc_list = soup.find_all("p", class_="bubbledrawer__desc")
        desc_list = [desc.get_text(strip=True) for desc in desc_list]

        #Finding all the buttons
        buttons = soup.find_all('a', class_='btn', string='See course page for more information')

        # Extract hrefs
        links = [btn['href'] for btn in buttons if btn.has_attr('href')]
        
        return major, course_codes, credits_list, titles_list, desc_list, links

    def extract_course_prereq(url):
        res = requests.get(url)
        soup = BeautifulSoup(res.text, 'html.parser')

        #Finding pre-req info
        prereq_text = ""
        coreq_text = ""

        info_div = soup.find("div", class_="text detail-note_text margin--default")
        li_list = info_div.find_all("li")

        for li in li_list:
            text = li.get_text(strip=True)
            if text.startswith("Prerequisite(s):"):
                prereq_text = text[len("Prerequisite(s):"):].strip()

            elif text.startswith("Prerequisites:"):
                prereq_text = text[len("Prerequisites:"):].strip()

            elif text.startswith("Prerequisite:"):
                prereq_text = text[len("Prerequisite:"):].strip()

            elif text.startswith("Corequisite(s):"):
                coreq_text = text[len("Corequisite(s):"):].strip()
                break

            elif text.startswith("Corequisites:"):
                coreq_text = text[len("Corequisites:"):].strip()

            elif text.startswith("Corequisite:"):
                coreq_text = text[len("Corequisite:"):].strip()
        
        return [prereq_text, coreq_text] 

    page_url = url
    # page_url = "https://coursecatalogue.mcgill.ca/en/undergraduate/science/programs/mathematics-statistics/statistics-computer-science-honours-bsc/#coursestext"
    major, course_codes, credits_list, titles_list, desc_list, links = extract_course_info(page_url)

    base_url = "https://coursecatalogue.mcgill.ca"

    prereq_list = []
    coreq_list = []

    for link in links: 
        reqs = extract_course_prereq(base_url+link)
        
        prereq_list.append(reqs[0])
        coreq_list.append(reqs[1])
        #to not overload the server
        time.sleep(0.2)
        
    courses_info = {}
    network_info = {}
    simplified_info = {}

    for code, credits, title, desc, link, prereq, coreq in zip(course_codes, credits_list, titles_list, desc_list, links, prereq_list, coreq_list):
        courses_info[code] = {
            "Title": title,
            "Credits": credits,
            "Prerequisite(s)": prereq,
            "Corequisite(s)": coreq,
            "Course Link": link,
            "Description": desc
        }

        network_info[code] = {
            "title": title,
            "credits": credits,
            "semesters_offered": ""
        }

        simplified_info[code] = {
            "Title": title,
            "Prerequisite(s)": f"{prereq} and {coreq}",
        }

    return [courses_info, network_info, simplified_info, major]
