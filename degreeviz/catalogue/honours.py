"""Build mappings from regular McGill courses to honours alternatives."""

from __future__ import annotations

import json
from pathlib import Path


DEFAULT_COURSES_PATH = Path("static/json/courses_info.json")
DEFAULT_OUTPUT_PATH = Path("static/json/honours_matches.json")
EXCLUDED_TITLE_KEYWORDS = {"seminar", "thesis", "research", "project", "essay", "colloquium"}


def _normalized_non_honours_title(title: str) -> str:
    return " ".join(title.lower().replace("honours", "").split())


def build_honours_match_map(courses: dict) -> dict[str, str]:
    """Return `{regular_course_code: honours_course_code}` matches by department/title."""
    titles_by_department: dict[str, dict[str, list[tuple[str, str]]]] = {}

    for code, info in courses.items():
        title = info.get("Title", "")
        department = code.split()[0]
        normalized = _normalized_non_honours_title(title)
        titles_by_department.setdefault(department, {}).setdefault(normalized, []).append((code, title))

    honours_matches: dict[str, str] = {}
    for honours_code, info in courses.items():
        honours_title = info.get("Title", "")
        lower_title = honours_title.lower()
        if "honours" not in lower_title:
            continue
        if any(keyword in lower_title for keyword in EXCLUDED_TITLE_KEYWORDS):
            continue

        department = honours_code.split()[0]
        normalized = _normalized_non_honours_title(honours_title)
        for regular_code, regular_title in titles_by_department.get(department, {}).get(normalized, []):
            if "honours" not in regular_title.lower():
                honours_matches[regular_code] = honours_code

    return dict(sorted(honours_matches.items()))


def refresh_honours_matches(
    courses_path: Path = DEFAULT_COURSES_PATH,
    output_path: Path = DEFAULT_OUTPUT_PATH,
) -> dict[str, str]:
    """Read course metadata and write regular-to-honours course mappings."""
    with courses_path.open("r", encoding="utf-8") as file:
        courses = json.load(file)

    honours_matches = build_honours_match_map(courses)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as file:
        json.dump(honours_matches, file, indent=2, ensure_ascii=False)
        file.write("\n")
    return honours_matches
