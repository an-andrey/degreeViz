import requests
from bs4 import BeautifulSoup
import time
import re
import json 
import unicodedata

#Script to grab all the programs in mcgill and create a json in the following format: 
# { program title : program url }
# this will be used to pass into the search bar of the website

urls_to_scrape = [
    "https://coursecatalogue.mcgill.ca/en/undergraduate/science/overview-programs-offered/bachelor-science-program-groups/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/science/overview-programs-offered/minor-programs/", 
    "https://coursecatalogue.mcgill.ca/en/undergraduate/physical-occupational-therapy/physical-occupational-therapy-programs/#programstext", 
    "https://coursecatalogue.mcgill.ca/en/undergraduate/science/overview-programs-offered/arts-major-minor-concentrations-open-science-students/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/nursing/nursing/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/music/overview-programs/degrees-diplomas-offered/#text",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/management/programs/concentrations/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/management/programs/majors/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/management/programs/honours/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/law/programs/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/minor-environment/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/ba-faculty-program-environment/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/bachelor-arts-science-interfaculty-programs/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/environment-bscagenvsc-bsc/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/honours-program-environment/#programstext",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/education/overview/programs/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/education/overview/programs-first-nations-inuit/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/arts-science/programs/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/arts/programs/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/agri-env-sci/program-overview/bachelor-science-agricultural-environmental-sciences-overview/",
    "https://coursecatalogue.mcgill.ca/en/undergraduate/agri-env-sci/programs/bachelor-engineering-bioresource/#programstext",
]

#dictionnary of all programs to be passed a json later
programs = {}
base = "https://coursecatalogue.mcgill.ca"

#regex patterns to grab links of programs
pattern_base = re.compile(r'\(B\.[^)]*\)(?: \(\d{2} credits\))?')
pattern_music = re.compile(r'\(L\.Mus\.\) \(\d{2} credits\)')
pattern_law = re.compile(r'\((?:Joint\s)?B\.[^)]*\)')
pattern_certification = re.compile(r'\(Cert\.\) \(\d{2} credits\)')

patterns = [pattern_base, pattern_music, pattern_law]

#scraping through all the urls containing programs at mcgill, and finding all links that fit the regex patterns
for url in urls_to_scrape:
    res = requests.get(url)
    res.encoding = "utf-8"
    soup = BeautifulSoup(res.text, 'html.parser')
    

    for a in soup.find_all('a'):
        text = a.get_text(strip=True)
        for pattern in patterns:
            if pattern.search(text):
                href = a.get("href")
                if href:
                    #remove credit amount if shows up at the end of the course name
                    text = re.sub(r'\s*\([^()]*cr[eé]dits\)?+\s*$', '', text, flags=re.IGNORECASE)
                    #removing any weird non printable characters 
                    text = re.sub(r'[\u200B-\u200D\uFEFF]', '', text)

                    #making sure Honours is at the front
                    if "Honours (" in text: #added paranthesis, since don't want to remove 'Honours Component'
                        text = text.replace("Honours ", "")
                        text = "Honours " + text

                    programs[text] = base + a.get('href') + "#coursestext"
                else:
                    print(url, a)
                break
    #giving some time for the server
    time.sleep(0.2)

#Manually adding some entries
programs["Environment (Dip.)"] = "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/diploma-environment/environment-dip/#coursestext"
programs["Environment Joint Honours Component (B.A.)"] = "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/joint-honours-component/environment-joint-honours-component-ba/#coursestext"
programs["Dentistry (Four-Year Program) (D.M.D.)"] = "https://coursecatalogue.mcgill.ca/en/undergraduate/dentistry/professional/dentistry-programs/dentistry-dmd/#coursestext"

#creating the json file
with open("static/jsons/programs.json", "w", encoding="utf-8") as f:
    json.dump(programs, f, ensure_ascii=False, indent=4)