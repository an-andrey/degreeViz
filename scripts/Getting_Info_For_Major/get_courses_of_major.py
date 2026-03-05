import requests
from bs4 import BeautifulSoup

#Given url of the major, it scrapes the site and gets all the courses of the major.
#Eventually this could be ran on all programs and be hard-coded instead of running on every query

def get_program_codes(url):

    #Passing a header to mimic a real user instead
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }

    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, 'html.parser')

    #finding all required courses: 
    course_codes = soup.find_all("td", class_="codecol")
    course_codes = [code.get_text(strip=True) for code in course_codes]
    
    return course_codes

    
    