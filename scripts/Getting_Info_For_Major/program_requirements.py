from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

COURSE_CODE_RE = re.compile(r"\b[A-Z]{3,5}\s?\d{3}[A-Z0-9]?\b")
CREDIT_RANGE_RE = re.compile(r"(?P<min>\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(?P<max>\d+(?:\.\d+)?)\s+credits?", re.IGNORECASE)
SINGLE_CREDIT_RE = re.compile(r"(?P<credits>\d+(?:\.\d+)?)\s+credits?", re.IGNORECASE)


@dataclass
class RequirementBucket:
    id: str
    title: str
    category: str
    min_credits: float = 0
    max_credits: float | None = None
    courses: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "min_credits": self.min_credits,
            "max_credits": self.max_credits,
            "courses": self.courses,
        }


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip()


def _slugify(value: str, fallback: str) -> str:
    value = _clean_text(value).lower()
    slug = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return slug or fallback


def _category_from_heading(heading: str) -> str:
    h = heading.lower()
    if "required" in h:
        return "CORE"
    if "complementary" in h:
        return "COMPLEMENTARY"
    if "elective" in h:
        return "ELECTIVE"
    return "CORE"


def _credit_bounds(text: str) -> tuple[float, float | None]:
    text = _clean_text(text)
    range_match = CREDIT_RANGE_RE.search(text)
    if range_match:
        return float(range_match.group("min")), float(range_match.group("max"))
    single_match = SINGLE_CREDIT_RE.search(text)
    if single_match:
        c = float(single_match.group("credits"))
        return c, c
    return 0, None


def extract_program_requirements(soup):
    content_root = soup.find(id="coursestext") or soup.find("main") or soup

    buckets: list[RequirementBucket] = []
    current_section_title = "Program Courses"
    current_section_category = "CORE"
    pending_bucket_label = ""

    for element in content_root.find_all(["h2", "p", "div"], recursive=True):
        if element.name == "h2":
            current_section_title = _clean_text(element.get_text(" ", strip=True))
            current_section_category = _category_from_heading(current_section_title)
            pending_bucket_label = ""
            continue

        if element.name == "p":
            text = _clean_text(element.get_text(" ", strip=True))
            if "credit" in text.lower() and ("selected from" in text.lower() or "choose" in text.lower()):
                pending_bucket_label = text
            continue

        if element.name == "div" and "courselist-wrapper" in (element.get("class") or []):
            table = element.find("table", class_="sc_courselist")
            if not table:
                continue

            bucket_label = pending_bucket_label or current_section_title
            pending_bucket_label = ""

            min_credits, max_credits = _credit_bounds(bucket_label)
            bucket = RequirementBucket(
                id=_slugify(f"{current_section_title}-{bucket_label}", f"bucket-{len(buckets)+1}"),
                title=bucket_label,
                category=current_section_category,
                min_credits=min_credits,
                max_credits=max_credits,
            )

            for row in table.select("tbody > tr"):
                row_classes = row.get("class") or []
                if "bubbledrawer" in row_classes:
                    continue
                code_cell = row.find("td", class_="codecol")
                if not code_cell:
                    continue
                match = COURSE_CODE_RE.search(_clean_text(code_cell.get_text(" ", strip=True)))
                if match:
                    bucket.courses.append(match.group(0).replace(" ", ""))

            if bucket.courses:
                bucket.courses = list(dict.fromkeys(bucket.courses))
                buckets.append(bucket)

    course_to_bucket = {}
    totals = {"core": 0.0, "comp": 0.0, "elec": 0.0}
    for b in buckets:
        for c in b.courses:
            course_to_bucket.setdefault(c, b.id)
        if b.category == "CORE":
            totals["core"] += b.min_credits
        elif b.category == "COMPLEMENTARY":
            totals["comp"] += b.min_credits
        else:
            totals["elec"] += b.min_credits

    return {
        "buckets": [b.to_dict() for b in buckets],
        "course_to_bucket": course_to_bucket,
        "credit_requirements": {k: int(v) if v.is_integer() else v for k, v in totals.items()},
    }
