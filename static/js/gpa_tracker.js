export function updateGpaTracker(detailsData) {
  const transcriptContainer = document.getElementById("transcriptContainer");
  const cgpaDisplay = document.getElementById("cumulativeGpaDisplay");
  if (!transcriptContainer || !cgpaDisplay) return;

  transcriptContainer.innerHTML = "";

  // 1. Filter and group ALL DONE courses
  const semesters = {};
  let totalGradePoints = 0;
  let totalGradedCredits = 0;

  Object.entries(detailsData).forEach(([courseCode, course]) => {
    // Check if it's DONE, regardless of whether a semester was chosen
    if (course.status === "DONE") {
      // If no semester is assigned, throw it in a default bucket
      const term =
        course.planned_semester && course.planned_semester !== "Unassigned"
          ? course.planned_semester
          : "Unassigned Term";

      if (!semesters[term]) semesters[term] = [];

      course.code = course.code || courseCode;
      semesters[term].push(course);
    }
  });

  // 2. Sort semesters chronologically
  const sortedTerms = Object.keys(semesters).sort((a, b) => {
    // Force the "Unassigned Term" to always stay at the very bottom of the transcript
    if (a === "Unassigned Term") return 1;
    if (b === "Unassigned Term") return -1;

    const seasonWeight = { Winter: 1, Summer: 2, Fall: 3 };
    const [seasonA, yearA] = a.split(" ");
    const [seasonB, yearB] = b.split(" ");
    return yearA !== yearB
      ? yearA - yearB
      : seasonWeight[seasonA] - seasonWeight[seasonB];
  });

  // 3. Build Transcript UI
  if (sortedTerms.length === 0) {
    transcriptContainer.innerHTML = `
        <div class="power-user-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>
          <span>No completed courses found. Mark courses as <kbd>DONE</kbd> and assign a semester in the graph to build your transcript. </span>
        </div>`;
    cgpaDisplay.textContent = "GPA: 0.00";
    return;
  }

  const gradeMap = {
    "4.0": "A",
    3.7: "A-",
    3.3: "B+",
    "3.0": "B",
    2.7: "B-",
    2.3: "C+",
    "2.0": "C",
    "1.0": "D",
    "0.0": "F",
  };

  sortedTerms.forEach((term) => {
    const coursesInTerm = semesters[term];
    let termGradePoints = 0;
    let termGradedCredits = 0;

    const tableHTML = coursesInTerm
      .map((course) => {
        const credits = parseFloat(course.credits) || 0;
        let gradeStr = course.grade || "";
        let gpaRowHTML = '<td class="muted-text"><em>No grade</em></td>';

        if (gradeStr !== "") {
          const gradeVal = parseFloat(gradeStr);
          termGradePoints += gradeVal * credits;
          termGradedCredits += credits;
          totalGradePoints += gradeVal * credits;
          totalGradedCredits += credits;

          const letter = gradeMap[gradeStr] || "";
          gpaRowHTML = `<td><strong>${letter}</strong> (${gradeStr})</td>`;
        }

        return `
        <tr>
          <td><strong>${course.code}</strong></td>
          <td>${course.title}</td>
          <td>${credits}</td>
          ${gpaRowHTML}
        </tr>
      `;
      })
      .join("");

    const termGpa =
      termGradedCredits > 0
        ? (termGradePoints / termGradedCredits).toFixed(2)
        : "0.00";

    const card = document.createElement("div");
    card.className = "table-card transcript-card";

    card.innerHTML = `
      <div class="term-header">
        <h4>${term}</h4>
        <span class="term-gpa">Term GPA: <span>${termGpa}</span></span>
      </div>
      <table class="styled-table transcript-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Title</th>
            <th>Credits</th>
            <th>Grade</th>
          </tr>
        </thead>
        <tbody>
          ${tableHTML}
        </tbody>
      </table>
    `;

    transcriptContainer.appendChild(card);
  });

  // 4. Update CGPA Display
  const cgpa =
    totalGradedCredits > 0
      ? (totalGradePoints / totalGradedCredits).toFixed(2)
      : "0.00";
  cgpaDisplay.textContent = `GPA: ${cgpa}`;
}
