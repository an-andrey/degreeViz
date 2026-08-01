"""Runtime validation and normalization for graph payloads."""

from typing import Any, Dict, Iterable, Mapping, Tuple

from degreeviz.errors import GraphValidationError
from degreeviz.graph.types import CourseDetails, GraphPayload, PrereqMap, ProgramRequirements


VALID_CATEGORIES = {"CORE", "COMPLEMENTARY", "ELECTIVE"}
VALID_STATUSES = {"Unassigned", "TO TAKE", "TAKING", "DONE"}


def _require_mapping(value: Any, field_name: str) -> Mapping[str, Any]:
    """Return ``value`` as a mapping or raise a graph validation error."""
    if not isinstance(value, Mapping):
        raise GraphValidationError(
            f"{field_name} must be an object.",
            user_message=f"Graph data is missing a valid {field_name} object.",
            details={"field": field_name, "actual_type": type(value).__name__},
        )
    return value


def _as_float_or_none(value: Any, field_name: str, course_code: str):
    """Normalize optional coordinates into floats."""
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise GraphValidationError(
            f"{course_code}.{field_name} must be numeric.",
            user_message=f"Course {course_code} has invalid coordinates.",
            details={"course": course_code, "field": field_name, "value": value},
        ) from exc


def _normalize_credits(value: Any) -> str:
    """Keep credits JSON-friendly while accepting numbers or strings."""
    if value in (None, ""):
        return "N/A"
    return str(value)


def _as_float(value: Any, field_name: str, default: float = 0) -> float:
    """Normalize a required numeric field into a float."""
    if value in (None, ""):
        return default
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise GraphValidationError(
            f"{field_name} must be numeric.",
            user_message="Some credit requirement values are invalid.",
            details={"field": field_name, "value": value},
        ) from exc


def validate_course_details(raw_details: Any) -> CourseDetails:
    """Validate and normalize graph course details keyed by course id."""
    details_obj = _require_mapping(raw_details, "details_data")
    normalized: CourseDetails = {}

    for raw_course_id, raw_course in details_obj.items():
        course_id = str(raw_course_id).strip()
        if not course_id:
            raise GraphValidationError("Course ids cannot be blank.")
        course = _require_mapping(raw_course, f"details_data[{course_id}]")
        category = str(course.get("category") or "CORE").upper()
        if category not in VALID_CATEGORIES:
            category = "COMPLEMENTARY"
        default_status = "TO TAKE" if category == "CORE" and course.get("include_in_graph", True) is not False else "Unassigned"
        status = str(course.get("status") or default_status)
        if status not in VALID_STATUSES:
            status = "Unassigned"

        normalized[course_id] = {
            **dict(course),
            "code": str(course.get("code") or course_id).strip() or course_id,
            "title": str(course.get("title") or course.get("Title") or "Unknown Title").strip(),
            "credits": _normalize_credits(course.get("credits", course.get("Credits", "N/A"))),
            "category": category,
            "semesters_offered": str(course.get("semesters_offered") or course.get("Terms_Offered") or "Unknown"),
            "status": status,
            "planned_semester": str(course.get("planned_semester") or "Unassigned"),
            "include_in_graph": bool(course.get("include_in_graph", True)),
            "x": _as_float_or_none(course.get("x"), "x", course_id),
            "y": _as_float_or_none(course.get("y"), "y", course_id),
        }

    return normalized


def validate_prereq_map(raw_prereqs: Any, known_course_ids: Iterable[str]) -> PrereqMap:
    """Validate prerequisite edges keyed by destination course id."""
    prereqs_obj = _require_mapping(raw_prereqs, "prereqs_data")
    known = set(known_course_ids)
    normalized: PrereqMap = {}

    for raw_to_course, raw_from_courses in prereqs_obj.items():
        to_course = str(raw_to_course).strip()
        if not to_course:
            raise GraphValidationError("Prerequisite map contains a blank course id.")
        if not isinstance(raw_from_courses, list):
            raise GraphValidationError(
                f"Prerequisites for {to_course} must be a list.",
                user_message=f"Prerequisites for {to_course} are invalid.",
                details={"course": to_course, "actual_type": type(raw_from_courses).__name__},
            )
        deduped = []
        for raw_from_course in raw_from_courses:
            from_course = str(raw_from_course).strip()
            if not from_course or from_course == to_course:
                continue
            if from_course not in deduped:
                deduped.append(from_course)
        normalized[to_course] = deduped

    for course_id in known:
        normalized.setdefault(course_id, [])

    return normalized


def validate_program_requirements(raw_requirements: Any) -> ProgramRequirements:
    """Validate requirement metadata while preserving unknown future fields."""
    if raw_requirements in (None, ""):
        return {"buckets": []}
    requirements_obj = _require_mapping(raw_requirements, "program_requirements")
    buckets = requirements_obj.get("buckets", [])
    if not isinstance(buckets, list):
        raise GraphValidationError(
            "program_requirements.buckets must be a list.",
            user_message="Program requirements are invalid.",
            details={"field": "program_requirements.buckets"},
        )

    normalized_buckets = []
    for index, raw_bucket in enumerate(buckets):
        bucket = _require_mapping(raw_bucket, f"program_requirements.buckets[{index}]")
        bucket_id = str(bucket.get("id") or f"bucket-{index + 1}")
        normalized_buckets.append({
            **dict(bucket),
            "id": bucket_id,
            "title": str(bucket.get("title") or bucket_id),
            "category": str(bucket.get("category") or "CORE").upper(),
            "min_credits": _as_float(bucket.get("min_credits"), f"program_requirements.buckets[{index}].min_credits"),
            "max_credits": None if bucket.get("max_credits") in (None, "") else _as_float(bucket.get("max_credits"), f"program_requirements.buckets[{index}].max_credits"),
            "courses": [str(course) for course in bucket.get("courses", []) if str(course).strip()],
            "additional_courses": [str(course) for course in bucket.get("additional_courses", []) if str(course).strip()],
        })

    normalized = dict(requirements_obj)
    normalized["buckets"] = normalized_buckets
    return normalized


def validate_credit_requirements(raw_credit_requirements: Any) -> Dict[str, float]:
    """Validate the simple required-credit counters."""
    raw = raw_credit_requirements or {}
    if not isinstance(raw, Mapping):
        raise GraphValidationError("credit_requirements must be an object.")
    return {
        "core": _as_float(raw.get("core"), "credit_requirements.core"),
        "comp": _as_float(raw.get("comp"), "credit_requirements.comp"),
        "elec": _as_float(raw.get("elec"), "credit_requirements.elec"),
    }


def validate_graph_payload(raw_payload: Any) -> GraphPayload:
    """Validate a full graph payload from the browser or database."""
    payload = _require_mapping(raw_payload, "graph_payload")
    details = validate_course_details(payload.get("details_data"))
    prereqs = validate_prereq_map(payload.get("prereqs_data"), details.keys())
    requirements = validate_program_requirements(payload.get("program_requirements"))
    credit_requirements = validate_credit_requirements(payload.get("credit_requirements"))

    return {
        "details_data": details,
        "prereqs_data": prereqs,
        "program_requirements": requirements,
        "credit_requirements": credit_requirements,
    }


def validate_program_result(program_data: Any) -> Tuple[PrereqMap, CourseDetails, ProgramRequirements]:
    """Validate the tuple returned by program scraping/parsing code."""
    if not isinstance(program_data, tuple) or len(program_data) not in (2, 3):
        raise GraphValidationError(
            "Program parser returned an invalid result.",
            user_message="Unable to read that program's course structure.",
            details={"actual_type": type(program_data).__name__},
        )
    if len(program_data) == 2:
        prereqs, details = program_data
        requirements = {"buckets": []}
    else:
        prereqs, details, requirements = program_data
    if prereqs is None or details is None:
        raise GraphValidationError(
            "Program parser returned empty graph data.",
            user_message="Unable to find courses for that program.",
        )
    normalized_details = validate_course_details(details)
    normalized_prereqs = validate_prereq_map(prereqs, normalized_details.keys())
    normalized_requirements = validate_program_requirements(requirements)
    return normalized_prereqs, normalized_details, normalized_requirements
