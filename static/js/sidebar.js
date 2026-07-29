/*
 * sidebar.js
 * Drives the right-side course inspector on the graph page.
 *
 * Selecting a node copies its data from `detailsData` into form controls.
 * Changing status, planned semester, category, or grade dispatches a
 * `graphState.updateCourse` action so labels, derived views, dirty state, and
 * session draft sync stay centralized.
 */

export function setupSidebar(
  network,
  nodes,
  graphState,
  performWithoutHistory,
) {
  const inspector = document.getElementById("nodeInspector");
  if (!inspector) return;
  let currentlySelectedNodeId = null;

  function positionInspectorOverCoursePool() {
    const graphContent = document.getElementById("graph-content");
    const coursePool = document.getElementById("optionalCourseShelf");
    if (!graphContent || !coursePool) return;

    const contentRect = graphContent.getBoundingClientRect();
    const poolRect = coursePool.getBoundingClientRect();
    inspector.style.top = `${Math.max(0, poolRect.top - contentRect.top)}px`;
    inspector.style.left = `${Math.max(0, poolRect.left - contentRect.left)}px`;
    inspector.style.width = `${poolRect.width}px`;
    inspector.style.height = `${poolRect.height}px`;
  }

  function openCourseInspector(courseId) {
    currentlySelectedNodeId = courseId;
    const nodeData = graphState.details[courseId];
    if (!nodeData) return;

    document.getElementById("inspectorCode").textContent =
      nodeData.code || courseId || "Unknown Code";
    document.getElementById("inspectorTitle").textContent =
      nodeData.title || "Unknown Title";
    document.getElementById("inspectorCredits").textContent =
      `${nodeData.credits || 3} Credits`;

    const catEl = document.getElementById("inspectorCategory");
    if (catEl.tagName === "SELECT") catEl.value = nodeData.category || "CORE";
    else catEl.textContent = nodeData.category || "CORE";

    document.getElementById("inspectorOffered").textContent =
      nodeData.semesters_offered || "Unknown";
    document.getElementById("inspectorStatus").value =
      nodeData.status || "Unassigned";

    const gradeContainer = document.getElementById("inspectorGradeContainer");
    const gradeSelect = document.getElementById("inspectorGrade");
    if (nodeData.status === "DONE") {
      gradeContainer.style.display = "block";
      gradeSelect.value = nodeData.grade || "";
    } else {
      gradeContainer.style.display = "none";
      gradeSelect.value = "";
    }

    const planned = nodeData.planned_semester || "Unassigned";
    if (planned === "Unassigned") {
      document.getElementById("inspectorTermSeason").value = "Unassigned";
    } else {
      const parts = planned.split(" ");
      document.getElementById("inspectorTermSeason").value = parts[0] || "Fall";
      document.getElementById("inspectorTermYear").value =
        parts[1] || new Date().getFullYear();
    }

    positionInspectorOverCoursePool();
    inspector.classList.add("open");
  }

  window.openCourseInspector = openCourseInspector;

  // Populate Dropdowns
  const select = document.getElementById("inspectorTerm");
  if (select) {
    select.innerHTML = '<option value="Unassigned">Unassigned</option>';
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 3; y++) {
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="F${y}">Fall ${y}</option>`,
      );
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="W${y + 1}">Winter ${y + 1}</option>`,
      );
      select.insertAdjacentHTML(
        "beforeend",
        `<option value="S${y + 1}">Summer ${y + 1}</option>`,
      );
    }
  }

  const yearSelect = document.getElementById("inspectorTermYear");
  if (yearSelect) {
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      yearSelect.insertAdjacentHTML(
        "beforeend",
        `<option value="${y}" ${y === currentYear ? "selected" : ""}>${y}</option>`,
      );
    }
  }

  // Graph Clicks
  network.on("selectNode", function (params) {
    const nodeId = params.nodes[0];
    openCourseInspector(nodeId);
  });

  network.on("deselectNode", () => {
    inspector.classList.remove("open");
    currentlySelectedNodeId = null;
  });
  document
    .getElementById("closeInspector")
    .addEventListener("click", () => inspector.classList.remove("open"));

  window.addEventListener("resize", () => {
    if (inspector.classList.contains("open")) positionInspectorOverCoursePool();
  });

  // Handle Status Change -> Updates Color
  document
    .getElementById("inspectorStatus")
    .addEventListener("change", function (e) {
      if (currentlySelectedNodeId && graphState.details[currentlySelectedNodeId]) {
        const nData = graphState.details[currentlySelectedNodeId];
        const patch = { status: e.target.value };

        const gradeContainer = document.getElementById(
          "inspectorGradeContainer",
        );
        if (patch.status === "DONE") {
          gradeContainer.style.display = "block";
        } else {
          gradeContainer.style.display = "none";
          patch.grade = null;
          document.getElementById("inspectorGrade").value = "";
        }

        graphState.updateCourse(currentlySelectedNodeId, patch);
      }
    });

  // Handle Term Change -> Updates Label
  function updatePlannedTerm() {
    if (!currentlySelectedNodeId || !graphState.details[currentlySelectedNodeId])
      return;
    const season = document.getElementById("inspectorTermSeason").value;
    const year = document.getElementById("inspectorTermYear").value;
    graphState.updateCourse(currentlySelectedNodeId, {
      planned_semester: season === "Unassigned" ? "Unassigned" : `${season} ${year}`,
    });
  }

  document
    .getElementById("inspectorTermSeason")
    .addEventListener("change", updatePlannedTerm);
  document
    .getElementById("inspectorTermYear")
    .addEventListener("change", updatePlannedTerm);

  const categorySelect = document.getElementById("inspectorCategory");
  if (categorySelect && categorySelect.tagName === "SELECT") {
    categorySelect.addEventListener("change", function (e) {
      if (currentlySelectedNodeId && graphState.details[currentlySelectedNodeId]) {
        graphState.updateCourse(currentlySelectedNodeId, { category: e.target.value });
      }
    });
  }

  const inspectorGrade = document.getElementById("inspectorGrade");
  if (inspectorGrade) {
    inspectorGrade.addEventListener("change", function (e) {
      if (currentlySelectedNodeId && graphState.details[currentlySelectedNodeId]) {
        graphState.updateCourse(currentlySelectedNodeId, { grade: e.target.value });
      }
    });
  }
}
