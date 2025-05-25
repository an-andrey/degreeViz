//if changing colors in here, make sure to modify the function in app.py
//takes in the semester offered, and outputs the given colors to set the nodes
export function parseSemesterToColor(semesterText) {
  if (typeof semesterText !== "string") return "LightGray";
  if (semesterText.includes("Fall") && semesterText.includes("Winter"))
    return "Orchid";
  if (semesterText.includes("Fall")) return "Coral";
  if (semesterText.includes("Winter")) return "LightSkyBlue";
  if (semesterText.includes("Summer")) return "Gold";
  return "LightGray";
}
