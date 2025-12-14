import requests
from bs4 import BeautifulSoup

#returns course codes of major
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