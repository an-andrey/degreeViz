import unittest

from bs4 import BeautifulSoup

from degreeviz.programs.requirements import extract_program_requirements


class ProgramRequirementTests(unittest.TestCase):
    def test_extracts_required_and_complementary_buckets(self):
        soup = BeautifulSoup(
            """
            <main id="coursestext">
              <h2>Required Courses (6 credits)</h2>
              <div class="courselist-wrapper">
                <table class="sc_courselist"><tbody>
                  <tr><td class="codecol">COMP 250</td><td>Intro</td></tr>
                  <tr><td class="codecol">MATH 222</td><td>Calc</td></tr>
                </tbody></table>
              </div>
              <h2>Complementary Courses</h2>
              <p>3 credits selected from:</p>
              <div class="courselist-wrapper">
                <table class="sc_courselist"><tbody>
                  <tr><td class="codecol">COMP 251</td><td>Algorithms</td></tr>
                </tbody></table>
              </div>
            </main>
            """,
            "html.parser",
        )

        requirements = extract_program_requirements(soup)

        self.assertEqual(len(requirements["buckets"]), 2)
        self.assertEqual(requirements["buckets"][0]["category"], "CORE")
        self.assertEqual(requirements["buckets"][0]["courses"], ["COMP 250", "MATH 222"])
        self.assertEqual(requirements["buckets"][1]["category"], "COMPLEMENTARY")
        self.assertEqual(requirements["course_to_bucket"]["COMP 251"], requirements["buckets"][1]["id"])
        self.assertEqual(requirements["credit_requirements"]["core"], 6)
        self.assertEqual(requirements["credit_requirements"]["comp"], 3)

    def test_ignores_flexible_rule_without_static_course_list(self):
        soup = BeautifulSoup(
            """
            <main id="coursestext">
              <h2>Complementary Courses</h2>
              <p>0-9 credits selected from COMP courses at the 500 level or above.</p>
            </main>
            """,
            "html.parser",
        )

        requirements = extract_program_requirements(soup)

        self.assertEqual(requirements["buckets"], [])
        self.assertEqual(requirements["course_to_bucket"], {})

    def test_ignores_flexible_rule_even_with_following_course_list(self):
        soup = BeautifulSoup(
            """
            <main id="coursestext">
              <h2>Complementary Courses</h2>
              <p>0-9 credits selected from Computer Science courses at the 500 level or above.</p>
              <div class="courselist-wrapper">
                <table class="sc_courselist"><tbody>
                  <tr><td class="codecol">COMP 500</td><td>Advanced Topic</td></tr>
                </tbody></table>
              </div>
            </main>
            """,
            "html.parser",
        )

        requirements = extract_program_requirements(soup)

        self.assertEqual(requirements["buckets"], [])
        self.assertEqual(requirements["course_to_bucket"], {})


if __name__ == "__main__":
    unittest.main()
