import requests
from bs4 import BeautifulSoup

#Given url of the major, it scrapes the site and gets all the courses of the major.
#Eventually this could be ran on all programs and be hard-coded instead of running on every query

def get_program_codes(url):
    res = requests.get(url)
    soup = BeautifulSoup(res.text, 'html.parser')

    #finding all required courses: 
    course_codes = soup.find_all("td", class_="codecol")
    course_codes = [code.get_text(strip=True) for code in course_codes]
    
    return course_codes

    
    