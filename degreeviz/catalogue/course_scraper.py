import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


BASE_URL = "https://coursecatalogue.mcgill.ca"
COURSES_INDEX_URL = f"{BASE_URL}/courses/"
DEFAULT_OUTPUT_PATH = Path("static/json/courses_info.json")
DEFAULT_REPORT_PATH = Path("static/json/courses_refresh_report.json")
DEFAULT_START_YEAR = 2026
REQUEST_TIMEOUT = 30
COURSE_CODE_RE = re.compile(r"\b([A-Z]{3,4})\s*-?\s*(\d{3}[A-Z0-9]*)\b", re.IGNORECASE)
def build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
    )
    retry = Retry(
        total=3,
        connect=3,
        read=3,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def fetch_soup(session: requests.Session, url: str) -> BeautifulSoup:
    response = session.get(url, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    if is_verification_page(soup):
        raise RuntimeError(
            f"{url} returned a bot-verification page. Try again later or from a browser-backed/network-trusted environment."
        )
    return soup


def is_verification_page(soup: BeautifulSoup) -> bool:
    page_text = soup.get_text(" ", strip=True).lower()
    return "verify that you're not a robot" in page_text or "javascript is disabled" in page_text


def clean_text(value: Optional[str], default: str = "None") -> str:
    if not value:
        return default
    cleaned = re.sub(r"\s+", " ", value).strip()
    return cleaned.rstrip(".") if cleaned else default


def course_code_from_text(text: str) -> Optional[str]:
    match = COURSE_CODE_RE.search(text)
    if not match:
        return None
    return f"{match.group(1).upper()} {match.group(2).upper()}"


def course_code_from_url(url: str) -> Optional[str]:
    path_parts = [part for part in urlparse(url).path.split("/") if part and part != "index.html"]
    if not path_parts:
        return None
    return course_code_from_text(path_parts[-1].replace("-", " "))


def get_course_links(session: requests.Session, index_url: str = COURSES_INDEX_URL) -> Dict[str, str]:
    soup = fetch_soup(session, index_url)
    links: Dict[str, str] = {}
    candidates = soup.select("#textcontainer ul li a[href], ul li a[href]")

    for anchor in candidates:
        href = anchor.get("href")
        if not href:
            continue
        absolute_url = urljoin(BASE_URL, href)
        parsed = urlparse(absolute_url)
        if parsed.netloc != urlparse(BASE_URL).netloc or not parsed.path.startswith("/courses/"):
            continue

        link_text = anchor.get_text(" ", strip=True)
        course_code = course_code_from_text(link_text) or course_code_from_url(absolute_url)
        if course_code:
            links[course_code] = absolute_url

    if not links:
        raise RuntimeError(f"No course links found at {index_url}. The catalogue markup may have changed.")
    return dict(sorted(links.items()))


def get_value(soup: BeautifulSoup, detail_class: str, default: str = "None") -> str:
    detail = soup.select_one(f".{detail_class} .value")
    return clean_text(detail.get_text(" ", strip=True) if detail else None, default)


def parse_title_from_page(soup: BeautifulSoup, fallback_code: str, fallback_title: str = "None") -> Tuple[str, str]:
    page_title = soup.find("h1", class_="page-title")
    raw_title = clean_text(page_title.get_text(" ", strip=True) if page_title else "", "")
    if not raw_title:
        return fallback_code, fallback_title

    code = course_code_from_text(raw_title) or fallback_code
    title = raw_title
    code_prefix = re.escape(code).replace(r"\ ", r"\s+")
    title = re.sub(rf"^{code_prefix}\s*[.:-]\s*", "", title, flags=re.IGNORECASE).strip()
    return code, clean_text(title, fallback_title)


def parse_terms_offered(raw_terms: str, start_year: int = DEFAULT_START_YEAR) -> str:
    if not raw_terms or raw_terms == "None":
        return "This course is not offered this catalogue year."

    terms = []
    term_years = {
        "summer": ("Summer", start_year),
        "fall": ("Fall", start_year),
        "winter": ("Winter", start_year + 1),
    }
    lower_terms = raw_terms.lower()
    for term_key in ("summer", "fall", "winter"):
        if term_key in lower_terms:
            term, year = term_years[term_key]
            terms.append(f"{term} {year}")

    return ", ".join(terms) if terms else "This course is not offered this catalogue year."


def extract_terms(soup: BeautifulSoup, start_year: int = DEFAULT_START_YEAR) -> str:
    raw_terms = get_value(soup, "detail-terms_offered", "")
    if not raw_terms:
        raw_terms = get_value(soup, "detail-scheduled_terms", "")
    return parse_terms_offered(raw_terms, start_year)


def extract_prereqs_and_coreqs(soup: BeautifulSoup) -> Tuple[str, str]:
    prerequisites = "None"
    corequisites = "None"

    for note in soup.select(".detail-note_text li"):
        text = clean_text(note.get_text(" ", strip=True), "")
        lower_text = text.lower()
        if lower_text.startswith("prerequisite"):
            prerequisite_text = re.sub(r"^prerequisites?\s*:\s*", "", text, flags=re.IGNORECASE)
            prerequisite_parts = re.split(r"\bor\s+corequisites?\s*:\s*", prerequisite_text, maxsplit=1, flags=re.IGNORECASE)
            prerequisites = clean_text(prerequisite_parts[0])
            if len(prerequisite_parts) > 1:
                corequisites = clean_text(prerequisite_parts[1])
        elif lower_text.startswith("corequisite"):
            corequisites = clean_text(re.sub(r"^corequisites?\s*:\s*", "", text, flags=re.IGNORECASE))

    return prerequisites, corequisites


def extract_description(soup: BeautifulSoup) -> str:
    description_header = soup.find(
        lambda tag: tag.name in {"h2", "h3"}
        and "section__title" in tag.get("class", [])
        and tag.get_text(" ", strip=True).lower() == "description"
    )
    if description_header:
        description = description_header.find_next_sibling("div", class_="section__content")
        if description:
            return clean_text(description.get_text(" ", strip=True))

    first_section = soup.find("div", class_="section__content")
    return clean_text(first_section.get_text(" ", strip=True) if first_section else None)


def scrape_course(
    session: requests.Session,
    course_code: str,
    url: str,
    start_year: int = DEFAULT_START_YEAR,
) -> Tuple[str, dict]:
    soup = fetch_soup(session, url)
    code_from_page, title = parse_title_from_page(soup, course_code)
    prerequisites, corequisites = extract_prereqs_and_coreqs(soup)

    return code_from_page, {
        "Title": title,
        "Credits": get_value(soup, "detail-credits"),
        "Faculty": get_value(soup, "detail-offered_by"),
        "Terms_Offered": extract_terms(soup, start_year),
        "Prerequisites": prerequisites,
        "Corequisites": corequisites,
        "Course_Description": extract_description(soup),
        "url": url,
    }


def load_existing_course_codes(path: Path) -> List[str]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if isinstance(data, dict):
        return sorted(data.keys())
    if isinstance(data, list):
        return sorted(course.get("Course_Code") for course in data if course.get("Course_Code"))
    return []


def build_report(existing_codes: Iterable[str], scraped_codes: Iterable[str]) -> dict:
    existing = set(existing_codes)
    scraped = set(scraped_codes)
    return {
        "new_courses": sorted(scraped - existing),
        "removed_courses": sorted(existing - scraped),
        "course_count_before": len(existing),
        "course_count_after": len(scraped),
    }


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)
        file.write("\n")


def scrape_mcgill_courses(
    output_path: Path = DEFAULT_OUTPUT_PATH,
    report_path: Path = DEFAULT_REPORT_PATH,
    start_year: int = DEFAULT_START_YEAR,
    workers: int = 8,
    delay: float = 0.0,
) -> dict:
    existing_codes = load_existing_course_codes(output_path)
    index_session = build_session()
    course_links = get_course_links(index_session)
    courses_data = {}
    errors = {}

    with ThreadPoolExecutor(max_workers=max(1, workers)) as executor:
        futures = {}
        for course_code, url in course_links.items():
            if delay:
                time.sleep(delay)
            session = build_session()
            future = executor.submit(scrape_course, session, course_code, url, start_year)
            futures[future] = course_code

        for future in as_completed(futures):
            course_code = futures[future]
            try:
                parsed_code, course_info = future.result()
                courses_data[parsed_code] = course_info
            except Exception as error:
                errors[course_code] = str(error)

    if errors:
        sample_errors = "\n".join(f"{code}: {message}" for code, message in list(errors.items())[:10])
        raise RuntimeError(f"Failed to scrape {len(errors)} courses. First errors:\n{sample_errors}")

    courses_data = dict(sorted(courses_data.items()))
    report = build_report(existing_codes, courses_data.keys())
    report["start_year"] = start_year
    report["terms_written"] = {
        "Summer": start_year,
        "Fall": start_year,
        "Winter": start_year + 1,
    }

    write_json(output_path, courses_data)
    write_json(report_path, report)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Refresh McGill course catalogue data.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Path for courses_info.json.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH, help="Path for new/removed course report.")
    parser.add_argument("--start-year", type=int, default=DEFAULT_START_YEAR, help="Academic catalogue start year.")
    parser.add_argument("--workers", type=int, default=8, help="Number of parallel course page fetches.")
    parser.add_argument("--delay", type=float, default=0.0, help="Delay between scheduling course fetches.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    refresh_report = scrape_mcgill_courses(
        output_path=args.output,
        report_path=args.report,
        start_year=args.start_year,
        workers=args.workers,
        delay=args.delay,
    )
    print(f"Saved courses to {args.output}")
    print(f"Saved refresh report to {args.report}")
    print(f"New courses: {len(refresh_report['new_courses'])}")
    print(f"Removed courses: {len(refresh_report['removed_courses'])}")
