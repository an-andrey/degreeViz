import unittest

from degreeviz.errors import GraphValidationError
from degreeviz.graph.validation import validate_graph_payload


class GraphValidationTests(unittest.TestCase):
    def test_valid_payload_is_normalized(self):
        payload = validate_graph_payload({
            "details_data": {
                "comp 250": {
                    "Title": "Intro to Computer Science",
                    "Credits": 3,
                    "category": "core",
                    "status": "DONE",
                    "x": "10.5",
                    "y": 20,
                }
            },
            "prereqs_data": {"comp 250": ["MATH 133", "MATH 133", ""]},
            "program_requirements": {
                "buckets": [{
                    "id": "required",
                    "title": "Required Courses",
                    "category": "core",
                    "min_credits": "3",
                    "courses": ["comp 250"],
                }]
            },
            "credit_requirements": {"core": "3", "comp": None, "elec": ""},
        })

        course = payload["details_data"]["comp 250"]
        self.assertEqual(course["title"], "Intro to Computer Science")
        self.assertEqual(course["credits"], "3")
        self.assertEqual(course["category"], "CORE")
        self.assertEqual(course["x"], 10.5)
        self.assertEqual(payload["prereqs_data"]["comp 250"], ["MATH 133"])
        self.assertEqual(payload["credit_requirements"], {"core": 3.0, "comp": 0, "elec": 0})

    def test_invalid_prereq_shape_raises_user_safe_error(self):
        with self.assertRaises(GraphValidationError) as context:
            validate_graph_payload({
                "details_data": {"COMP 250": {"title": "Intro"}},
                "prereqs_data": {"COMP 250": "MATH 133"},
                "program_requirements": {"buckets": []},
                "credit_requirements": {},
            })

        self.assertIn("Prerequisites for COMP 250", context.exception.user_message)

    def test_visible_core_courses_default_to_take(self):
        payload = validate_graph_payload({
            "details_data": {"COMP 250": {"title": "Intro", "category": "CORE"}},
            "prereqs_data": {},
            "program_requirements": {"buckets": []},
            "credit_requirements": {},
        })

        self.assertEqual(payload["details_data"]["COMP 250"]["status"], "TO TAKE")


if __name__ == "__main__":
    unittest.main()
