import re
import requests
from bs4 import BeautifulSoup

# Given url of the major, it scrapes the site and gets all the courses of the major.
# Eventually this could be run on all programs and be hard-coded instead of running on every query.

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

COURSE_CODE_RE = re.compile(r"\b[A-Z]{3,5}\s?\d{3}[A-Z0-9]?\b")


def get_program_soup(url):
    # Passing a header to mimic a real user instead.
    res = requests.get(url, headers=HEADERS)
    res.raise_for_status()
    return BeautifulSoup(res.text, "html.parser")


def get_program_codes(url, soup=None):
    soup = soup or get_program_soup(url)

    # On McGill pages, program course rows use <td class="codecol">COMP 250</td>.
    course_codes = soup.find_all("td", class_="codecol")
    return [code.get_text(strip=True).replace(" ", "") for code in course_codes]


def get_course_metadata_from_program_page(code, soup):
    """Best-effort extraction of title/credits/terms from a program page table row.

    This is only a fallback for courses missing from static/json/courses_info.json.
    It does NOT replace the Gemini prerequisite pipeline.
    """
    normalized_code = code.replace(" ", "")
    code_cell = soup.find("td", class_="codecol", string=lambda txt: txt and normalized_code in txt.replace(" ", ""))
    if not code_cell:
        for candidate in soup.find_all("td", class_="codecol"):
            text = candidate.get_text(" ", strip=True).replace(" ", "")
            if text == normalized_code:
                code_cell = candidate
                break

    if not code_cell:
        return None

    row = code_cell.find_parent("tr")
    if not row:
        return None

    row_text = row.get_text(" ", strip=True)
    title = ""
    title_cell = row.find("td", class_=lambda cls: cls and ("titlecol" in cls or "courseblocktitle" in cls))
    if title_cell:
        title = title_cell.get_text(" ", strip=True)
    else:
        code_match = COURSE_CODE_RE.search(row_text)
        if code_match:
            title = row_text[code_match.end():].strip(" -:")

    credits = "N/A"
    credit_match = re.search(r"(\d+(?:\.\d+)?)\s*credits?", row_text, re.IGNORECASE)
    if credit_match:
        credits = credit_match.group(1)

    return {
        "title": title or f"{normalized_code} (Details not found)",
        "credits": credits,
        "semesters_offered": "Unknown",
    }
