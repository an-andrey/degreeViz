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
    constraints_text: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "category": self.category,
            "min_credits": self.min_credits,
            "max_credits": self.max_credits,
            "courses": self.courses,
            "constraints_text": self.constraints_text,
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
    return "COMPLEMENTARY"




def _is_required_heading(text: str) -> bool:
    t = text.lower()
    return "required" in t


def _is_footer_or_site_text(text: str) -> bool:
    t = text.lower()
    blockers = ["copyright", "cookie", "privacy", "contact us", "helpful links", "course catalogue"]
    return any(b in t for b in blockers)


def _looks_like_constraint(text: str) -> bool:
    t = text.lower()
    return ("credit" in t) and ("selected from" in t or "excluding" in t or "level or above" in t or "must be at the" in t)

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




def _extract_inline_courses(text: str) -> list[str]:
    return list(dict.fromkeys([m.group(0) for m in COURSE_CODE_RE.finditer(text)]))


def _flush_standalone_text_bucket(text: str, buckets: list[RequirementBucket], current_section_title: str) -> None:
    min_credits, max_credits = _credit_bounds(text)
    courses = _extract_inline_courses(text)
    bucket = RequirementBucket(
        id=_slugify(f"{current_section_title}-{text}", f"bucket-{len(buckets)+1}"),
        title=text,
        category="COMPLEMENTARY",
        min_credits=min_credits,
        max_credits=max_credits,
        courses=courses,
        constraints_text=text,
    )
    buckets.append(bucket)

def extract_program_requirements(soup):
    content_root = soup.find(id="coursestext") or soup.find("main") or soup

    buckets: list[RequirementBucket] = []
    current_section_title = "Program Courses"
    current_section_category = "CORE"
    pending_bucket_label = ""
    pending_constraint_text = ""

    for element in content_root.find_all(["h2", "p", "div"], recursive=True):
        if element.name == "h2":
            current_section_title = _clean_text(element.get_text(" ", strip=True))
            current_section_category = _category_from_heading(current_section_title)
            pending_bucket_label = ""
            pending_constraint_text = ""
            continue

        if element.name == "p":
            text = _clean_text(element.get_text(" ", strip=True))
            if _is_footer_or_site_text(text):
                continue
            if "selected from" in text.lower() and "credit" in text.lower():
                pending_bucket_label = text
                pending_constraint_text = ""
                next_div = element.find_next_sibling()
                while next_div and getattr(next_div, "name", None) is None:
                    next_div = next_div.find_next_sibling()
                if not (next_div and next_div.name == "div" and "courselist-wrapper" in (next_div.get("class") or [])):
                    _flush_standalone_text_bucket(text, buckets, current_section_title)
                    pending_bucket_label = ""

            elif _looks_like_constraint(text):
                pending_constraint_text = text
                next_div = element.find_next_sibling()
                while next_div and getattr(next_div, "name", None) is None:
                    next_div = next_div.find_next_sibling()
                if not (next_div and next_div.name == "div" and "courselist-wrapper" in (next_div.get("class") or [])):
                    _flush_standalone_text_bucket(text, buckets, current_section_title)
                    pending_constraint_text = ""
            continue

        if element.name == "div" and "courselist-wrapper" in (element.get("class") or []):
            table = element.find("table", class_="sc_courselist")
            if not table:
                continue

            bucket_label = pending_bucket_label or current_section_title
            pending_bucket_label = ""

            min_credits, max_credits = _credit_bounds(bucket_label)
            lower_label = bucket_label.lower()
            has_selection = ("selected from" in lower_label) or ("choose" in lower_label) or (max_credits is not None and max_credits > min_credits)
            bucket_category = "CORE" if (_is_required_heading(current_section_title) and not has_selection and bucket_label == current_section_title) else "COMPLEMENTARY"
            bucket = RequirementBucket(
                id=_slugify(f"{current_section_title}-{bucket_label}", f"bucket-{len(buckets)+1}"),
                title=bucket_label,
                category=bucket_category,
                min_credits=min_credits,
                max_credits=max_credits,
                constraints_text=(pending_constraint_text if (pending_constraint_text and _clean_text(pending_constraint_text) != _clean_text(bucket_label)) else None),
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
                    bucket.courses.append(match.group(0))

            if bucket.courses:
                bucket.courses = list(dict.fromkeys(bucket.courses))
                buckets.append(bucket)
                pending_constraint_text = ""

    deduped=[]
    seen=set()
    for b in buckets:
        key=(b.title,b.category,tuple(sorted(b.courses)))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(b)
    buckets=deduped

    # deterministic post-pass: any bucket whose title includes "Required" is CORE.
    for b in buckets:
        if _is_required_heading(b.title):
            b.category = "CORE"

    # fallback: if a heading has no explicit required word, treat max-min-credit bucket as CORE.
    by_heading = {}
    for b in buckets:
        heading = b.id.split("-")[0] if b.id else ""
        by_heading.setdefault(heading, []).append(b)
    for _, group in by_heading.items():
        if not any(g.category == "CORE" for g in group):
            core_candidate = max(group, key=lambda x: x.min_credits)
            core_candidate.category = "CORE"

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
