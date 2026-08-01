import re
import json
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

"""Refresh the McGill program search index used by the homepage."""

DEFAULT_OUTPUT_PATH = Path("static/json/programs.json")
BASE_URL = "https://coursecatalogue.mcgill.ca"

PROGRAM_INDEX_URLS = [
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

PROGRAM_LINK_PATTERNS = [
    re.compile(r"\(B\.[^)]*\)(?: \(\d{2} credits\))?"),
    re.compile(r"\(L\.Mus\.\) \(\d{2} credits\)"),
    re.compile(r"\((?:Joint\s)?B\.[^)]*\)"),
    re.compile(r"\(Cert\.\) \(\d{2} credits\)"),
]

MANUAL_PROGRAMS = {
    "Environment (Dip.)": "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/diploma-environment/environment-dip/#coursestext",
    "Environment Joint Honours Component (B.A.)": "https://coursecatalogue.mcgill.ca/en/undergraduate/environment/programs/joint-honours-component/environment-joint-honours-component-ba/#coursestext",
    "Dentistry (Four-Year Program) (D.M.D.)": "https://coursecatalogue.mcgill.ca/en/undergraduate/dentistry/professional/dentistry-programs/dentistry-dmd/#coursestext",
}


def clean_program_title(title: str) -> str:
    """Normalize program link text for search display."""
    title = re.sub(r"\s*\([^()]*cr[eé]dits\)?+\s*$", "", title, flags=re.IGNORECASE)
    title = re.sub(r"[\u200B-\u200D\uFEFF]", "", title).strip()
    if "Honours (" in title:
        title = title.replace("Honours ", "")
        title = "Honours " + title
    return title


def scrape_program_links(index_urls=None, delay: float = 0.2) -> dict[str, str]:
    """Scrape McGill program catalogue links for the homepage search index."""
    programs: dict[str, str] = {}
    for url in index_urls or PROGRAM_INDEX_URLS:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        response.encoding = "utf-8"
        soup = BeautifulSoup(response.text, "html.parser")

        for anchor in soup.find_all("a"):
            text = anchor.get_text(strip=True)
            if not any(pattern.search(text) for pattern in PROGRAM_LINK_PATTERNS):
                continue
            href = anchor.get("href")
            if not href:
                continue
            programs[clean_program_title(text)] = urljoin(BASE_URL, href) + "#coursestext"
        time.sleep(delay)

    programs.update(MANUAL_PROGRAMS)
    return dict(sorted(programs.items()))


def write_programs_json(programs: dict[str, str], output_path: Path = DEFAULT_OUTPUT_PATH) -> None:
    """Write the program search index to JSON."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(programs, file, ensure_ascii=False, indent=4)
        file.write("\n")


def refresh_program_index(output_path: Path = DEFAULT_OUTPUT_PATH, delay: float = 0.2) -> dict[str, str]:
    """Scrape and write the McGill program search index."""
    programs = scrape_program_links(delay=delay)
    write_programs_json(programs, output_path)
    return programs


if __name__ == "__main__":
    refreshed_programs = refresh_program_index()
    print(f"Saved {len(refreshed_programs)} programs to {DEFAULT_OUTPUT_PATH}")
