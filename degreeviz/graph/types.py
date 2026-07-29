"""Typed graph data contracts used by Flask and browser JSON payloads."""

from typing import Any, Dict, List, Optional, TypedDict, Union


JsonValue = Union[None, bool, int, float, str, List["JsonValue"], Dict[str, "JsonValue"]]


class CourseDetail(TypedDict, total=False):
    """Serializable course metadata for one graph node."""

    code: str
    title: str
    credits: Union[str, int, float]
    category: str
    semesters_offered: str
    status: str
    planned_semester: str
    grade: Optional[str]
    include_in_graph: bool
    x: Optional[float]
    y: Optional[float]
    color: Any
    requirement_bucket: Optional[str]
    requirement_bucket_title: Optional[str]
    requirement_min_credits: Union[int, float]
    requirement_max_credits: Optional[Union[int, float]]


PrereqMap = Dict[str, List[str]]
CourseDetails = Dict[str, CourseDetail]


class RequirementBucket(TypedDict, total=False):
    """One requirement bucket shown in the course pool / credit tracker."""

    id: str
    title: str
    category: str
    min_credits: Union[int, float]
    max_credits: Optional[Union[int, float]]
    courses: List[str]
    additional_courses: List[str]
    constraints_text: str
    program_name: str


class ProgramRequirements(TypedDict, total=False):
    """Requirement metadata derived from a program page."""

    buckets: List[RequirementBucket]
    course_to_bucket: Dict[str, str]
    credit_requirements: Dict[str, Union[int, float]]
    parsed_rules: List[JsonValue]


class GraphPayload(TypedDict, total=False):
    """Full graph payload sent from browser to Flask."""

    details_data: CourseDetails
    prereqs_data: PrereqMap
    program_requirements: ProgramRequirements
    credit_requirements: Dict[str, Union[int, float]]

