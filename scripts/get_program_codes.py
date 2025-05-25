import requests
from bs4 import BeautifulSoup

#returns course codes of major
def get_program_codes(url):
    res = requests.get(url)
    soup = BeautifulSoup(res.text, 'html.parser')

    #finding all required courses: 
    course_codes = soup.find_all("td", class_="codecol")
    course_codes = [code.get_text(strip=True) for code in course_codes]
    
    return course_codes

    
    