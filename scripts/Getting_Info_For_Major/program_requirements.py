"""Parse McGill program pages into graduation-oriented requirement buckets.

Parser assumptions about McGill course catalogue HTML:
- Program requirements are rendered under a content root with id="coursestext".
- Course rows contain <td class="codecol"> cells for course codes.
- Bucket intent is typically expressed in adjacent headings/captions and often
  includes ranges like "8-15 credits".
"""

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
    return re.sub(r"\s+", " ", text or "").strip()


def _slugify(value: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or fallback


def _category_from_text(text: str) -> str:
    normalized = text.lower()
    if "elective" in normalized:
        return "ELECTIVE"
    if "complementary" in normalized or "selected from" in normalized or "choose" in normalized:
        return "COMPLEMENTARY"
    return "CORE"


def _credit_bounds(text: str) -> tuple[float, float | None]:
    range_match = CREDIT_RANGE_RE.search(text)
    if range_match:
        return float(range_match.group("min")), float(range_match.group("max"))

    single_match = SINGLE_CREDIT_RE.search(text)
    if single_match:
        credits = float(single_match.group("credits"))
        return credits, credits

    return 0, None


def extract_program_requirements(soup) -> dict[str, Any]:
    buckets: list[RequirementBucket] = []
    current_heading = "Program Courses"

    content_root = soup.find(id="coursestext") or soup.find("main") or soup
    for element in content_root.find_all(["h2", "h3", "h4", "p", "table"], recursive=True):
        if element.name in {"h2", "h3", "h4", "p"}:
            text = _clean_text(element.get_text(" ", strip=True))
            if text and ("credit" in text.lower() or element.name in {"h2", "h3", "h4"}):
                current_heading = text
            continue

        if not element.find("td", class_=lambda cls: cls and "codecol" in cls):
            continue

        table_title = _clean_text(element.find("caption").get_text(" ", strip=True)) if element.find("caption") else current_heading
        min_credits, max_credits = _credit_bounds(table_title)
        bucket = RequirementBucket(
            id=_slugify(table_title, f"bucket-{len(buckets) + 1}"),
            title=table_title or "Program Courses",
            category=_category_from_text(table_title or ""),
            min_credits=min_credits,
            max_credits=max_credits,
        )

        for code_cell in element.find_all("td", class_="codecol"):
            raw = _clean_text(code_cell.get_text(" ", strip=True))
            match = COURSE_CODE_RE.search(raw)
            if match:
                normalized = match.group(0).replace(" ", "")
                if normalized not in bucket.courses:
                    bucket.courses.append(normalized)

        if bucket.courses:
            buckets.append(bucket)

    course_to_bucket: dict[str, str] = {}
    totals = {"core": 0.0, "comp": 0.0, "elec": 0.0}
    for bucket in buckets:
        for code in bucket.courses:
            course_to_bucket.setdefault(code, bucket.id)

        if bucket.category == "COMPLEMENTARY":
            totals["comp"] += bucket.min_credits
        elif bucket.category == "ELECTIVE":
            totals["elec"] += bucket.min_credits
        else:
            totals["core"] += bucket.min_credits

    credit_requirements = {k: int(v) if v.is_integer() else v for k, v in totals.items()}

    return {
        "buckets": [bucket.to_dict() for bucket in buckets],
        "course_to_bucket": course_to_bucket,
        "credit_requirements": credit_requirements,
    }
