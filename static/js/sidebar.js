import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

export function setupSidebar(
  network,
  nodes,
  detailsData,
  markGraphDirty,
  performWithoutHistory,
) {
  const inspector = document.getElementById("nodeInspector");
  if (!inspector) return;
  let currentlySelectedNodeId = null;

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
    currentlySelectedNodeId = nodeId;
    const nodeData = detailsData[nodeId];

    if (nodeData) {
      document.getElementById("inspectorCode").textContent =
        nodeData.code || "Unknown Code";
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

      const planned = nodeData.planned_semester || "Unassigned";
      if (planned === "Unassigned") {
        document.getElementById("inspectorTermSeason").value = "Unassigned";
      } else {
        const parts = planned.split(" ");
        document.getElementById("inspectorTermSeason").value =
          parts[0] || "Fall";
        document.getElementById("inspectorTermYear").value =
          parts[1] || new Date().getFullYear();
      }
      inspector.classList.add("open");
    }
  });

  network.on("deselectNode", () => {
    inspector.classList.remove("open");
    currentlySelectedNodeId = null;
  });
  document
    .getElementById("closeInspector")
    .addEventListener("click", () => inspector.classList.remove("open"));

  // Sidebar Updates
  function triggerDataSync() {
    markGraphDirty();
    updateSheetView(detailsData);
  }

  // Handle Status Change -> Updates Color
  document
    .getElementById("inspectorStatus")
    .addEventListener("change", function (e) {
      if (currentlySelectedNodeId && detailsData[currentlySelectedNodeId]) {
        const nData = detailsData[currentlySelectedNodeId];
        nData.status = e.target.value;

        // Instantly update the color on the canvas!
        performWithoutHistory(() => {
          nodes.update({
            id: currentlySelectedNodeId,
            color: getStatusColor(nData.status),
          });
        });

        const newLabel = generateNodeLabel(
          nData.code || currentlySelectedNodeId,
          nData.title,
          nData.credits,
          nData.semesters_offered,
          nData.category,
          nData.planned_semester,
          nData.status,
        );
        performWithoutHistory(() => {
          nodes.update({ id: currentlySelectedNodeId, label: newLabel });
        });
        triggerDataSync();
      }
    });

  // Handle Term Change -> Updates Label
  function updatePlannedTerm() {
    if (!currentlySelectedNodeId || !detailsData[currentlySelectedNodeId])
      return;
    const season = document.getElementById("inspectorTermSeason").value;
    const year = document.getElementById("inspectorTermYear").value;
    const nData = detailsData[currentlySelectedNodeId];

    nData.planned_semester =
      season === "Unassigned" ? "Unassigned" : `${season} ${year}`;

    // Instantly update the label to show the new "Planned" semester!
    const newLabel = generateNodeLabel(
      nData.code || currentlySelectedNodeId,
      nData.title,
      nData.credits,
      nData.semesters_offered,
      nData.category,
      nData.planned_semester,
      nData.status,
    );
    performWithoutHistory(() => {
      nodes.update({ id: currentlySelectedNodeId, label: newLabel });
    });
    triggerDataSync();
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
      if (currentlySelectedNodeId && detailsData[currentlySelectedNodeId]) {
        const nData = detailsData[currentlySelectedNodeId];
        nData.category = e.target.value;

        // Uses the centralized label generator!
        const newLabel = generateNodeLabel(
          nData.code || "Unknown Code",
          nData.title,
          nData.credits,
          nData.semesters_offered,
          nData.category,
          nData.status,
        );

        performWithoutHistory(() => {
          nodes.update({ id: currentlySelectedNodeId, label: newLabel });
        });
        triggerDataSync();
      }
    });
  }
}
