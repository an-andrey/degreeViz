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
    return [code.get_text(strip=True) for code in course_codes]


def get_course_metadata_from_program_page(code, soup):
    """Best-effort extraction of title/credits/terms from a program page table row.

    This is only a fallback for courses missing from static/json/courses_info.json.
    It does NOT replace the Gemini prerequisite pipeline.
    """
    # Locate the correct code cell
    code_cell = soup.find("td", class_="codecol", string=lambda txt: txt and code in txt)
    if not code_cell:
        for candidate in soup.find_all("td", class_="codecol"):
            if candidate.get_text(strip=True) == code:
                code_cell = candidate
                break

    if not code_cell:
        return None

    # Get the parent row of the code cell
    row = code_cell.find_parent("tr")
    if not row:
        return None

    title = ""
    credits = "N/A"
    semesters_offered = "Unknown"

    # Extract Title
    title_cell = code_cell.find_next_sibling("td")
    if title_cell:
        title = title_cell.get_text(strip=True).rstrip(".")

    # Extract Credits
    if title_cell:
        hours_cell = title_cell.find_next_sibling("td")
        if hours_cell:
            hours_text = hours_cell.get_text(strip=True)
            credit_match = re.search(r"(\d+(?:\.\d+)?)", hours_text)
            if credit_match:
                credits = credit_match.group(1)

    # Extract Semesters Offered from the adjacent bubbledrawer row
    # find_next_sibling find the next <tr> tag directly below the current course row
    drawer_row = row.find_next_sibling("tr", class_="bubbledrawer")
    if drawer_row:
        terms_paragraph = drawer_row.find("p", class_="bubbledrawer__terms")
        if terms_paragraph:
            # Extract text and strip out the "Terms offered:" prefix label
            raw_terms = terms_paragraph.get_text(" ", strip=True)
            semesters_offered = raw_terms.replace("Terms offered:", "").strip().strip('"')

    return {
        "code": code,
        "title": title or f"{code} (Details not found)",
        "credits": credits,
        "semesters_offered": semesters_offered,
    }
