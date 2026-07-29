import unittest

from degreeviz.catalogue.course_scraper import build_report, course_code_from_url, parse_terms_offered
from degreeviz.catalogue.honours import build_honours_match_map


class CourseScraperTests(unittest.TestCase):
    def test_parse_terms_maps_catalogue_year(self):
        self.assertEqual(
            parse_terms_offered("This course is offered in Summer, Fall and Winter.", start_year=2026),
            "Summer 2026, Fall 2026, Winter 2027",
        )

    def test_parse_terms_handles_not_offered(self):
        self.assertEqual(
            parse_terms_offered("", start_year=2026),
            "This course is not offered this catalogue year.",
        )

    def test_course_code_from_url(self):
        self.assertEqual(course_code_from_url("https://coursecatalogue.mcgill.ca/courses/math-222"), "MATH 222")

    def test_build_report_tracks_new_and_removed_courses(self):
        report = build_report(["COMP 250", "MATH 222"], ["COMP 250", "COMP 251"])
        self.assertEqual(report["new_courses"], ["COMP 251"])
        self.assertEqual(report["removed_courses"], ["MATH 222"])

    def test_build_honours_match_map(self):
        matches = build_honours_match_map({
            "MATH 222": {"Title": "Calculus 3"},
            "MATH 254": {"Title": "Honours Calculus 3"},
            "MATH 470": {"Title": "Honours Research Project"},
        })

        self.assertEqual(matches, {"MATH 222": "MATH 254"})


if __name__ == "__main__":
    unittest.main()
