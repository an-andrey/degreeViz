#Make sure to update the function defined in scripts.js too
def parse_semester_to_color(semester_text):
    if not isinstance(semester_text, str): return "LightGray"

    if "Fall" in semester_text and "Winter" in semester_text: return "Orchid"
    if "Fall" in semester_text: return "Coral"
    if "Winter" in semester_text: return "LightSkyBlue"
    if "Summer" in semester_text: return "Gold"
    return "LightGray"