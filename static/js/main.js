import { initializeNodes, initializeEdges } from "./data_init.js";
import { getVisNetworkOptions } from "./network_options.js";
import {
  setupHomeLinkHandler,
  setupExportButtonHandler,
  initialLayoutAdjustment,
  setupSaveButtonHandler,
  markGraphDirty,
} from "./ui_handler.js";

document.addEventListener("DOMContentLoaded", function () {
  if (
    typeof prereqsData === "undefined" ||
    typeof detailsData === "undefined"
  ) {
    console.error(
      "Data (prereqsData or detailsData) not found. Make sure it's passed correctly from the Flask template.",
    );
    const networkContainer = document.getElementById("courseNetwork");
    if (networkContainer) {
      networkContainer.innerHTML =
        '<p style="color: red; text-align: center;">Error: Course data could not be loaded.</p>';
    }
    return;
  }

  const nodes = initializeNodes(detailsData);
  const edges = initializeEdges(prereqsData, nodes);

  const container = document.getElementById("courseNetwork");
  if (!container) {
    console.error("Network container #courseNetwork not found.");
    return;
  }

  const data = {
    nodes: nodes,
    edges: edges,
  };

  const options = getVisNetworkOptions(nodes, edges);

  // --- POSITION RESTORE LOGIC ---
  // If ANY node has an x/y coordinate saved, disable the auto-hierarchy
  // so the graph loads exactly where the user left it.
  let hasSavedPositions = false;
  nodes.forEach((node) => {
    if (node.x !== undefined && node.y !== undefined) {
      hasSavedPositions = true;
    }
  });

  if (hasSavedPositions) {
    options.layout.hierarchical.enabled = false;
  }
  // ------------------------------

  const network = new vis.Network(container, data, options);

  // Setup UI Handlers
  setupHomeLinkHandler();
  setupExportButtonHandler(network, nodes, edges);
  setupSaveButtonHandler(network, nodes, edges);
  initialLayoutAdjustment(network, nodes);

  // Enable/disable edit mode depending on where you click
  network.on("click", function (params) {
    if (network.manipulation.options.enabled) {
      if (params.nodes.length > 0 || params.edges.length > 0) {
        network.enableEditMode();
      } else {
        network.disableEditMode();
      }
    }
  });
  // -- POPULATE SEMESTER DROP DOWN --
  function populateSemesterDropdown() {
    const select = document.getElementById("inspectorTerm");
    if (!select) return;

    // Always keep the unassigned option at the top
    select.innerHTML = '<option value="Unassigned">Unassigned</option>';

    const currentYear = new Date().getFullYear();

    // Generate terms for past 2 years until 2 years in the future
    for (let y = currentYear - 2; y <= currentYear + 3; y++) {
      // Fall
      const fallOpt = document.createElement("option");
      fallOpt.value = `F${y}`;
      fallOpt.textContent = `Fall ${y}`;
      select.appendChild(fallOpt);

      // Winter (technically happens in the beginning of the NEXT year)
      const winterOpt = document.createElement("option");
      winterOpt.value = `W${y + 1}`;
      winterOpt.textContent = `Winter ${y + 1}`;
      select.appendChild(winterOpt);

      // Summer
      const summerOpt = document.createElement("option");
      summerOpt.value = `S${y + 1}`;
      summerOpt.textContent = `Summer ${y + 1}`;
      select.appendChild(summerOpt);
    }
  }

  populateSemesterDropdown();

  // --- INSPECTOR SIDEBAR LOGIC ---
  const inspector = document.getElementById("nodeInspector");
  let currentlySelectedNodeId = null;

  // 1. Populate the Year Dropdown (Current year - 1 up to + 2)
  function populateYearDropdown() {
    const yearSelect = document.getElementById("inspectorTermYear");
    if (!yearSelect) return;
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === currentYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }
  }
  populateYearDropdown();

  // 2. Open sidebar on node select
  network.on("selectNode", function (params) {
    const nodeId = params.nodes[0];
    currentlySelectedNodeId = nodeId;
    const nodeData = detailsData[nodeId];

    if (nodeData) {
      document.getElementById("inspectorCode").textContent = nodeId;
      document.getElementById("inspectorTitle").textContent =
        nodeData.title || "Unknown Title";
      document.getElementById("inspectorCredits").textContent =
        `${nodeData.credits || 3} Credits`;
      document.getElementById("inspectorCategory").textContent =
        nodeData.category || "CORE";
      document.getElementById("inspectorOffered").textContent =
        nodeData.semesters_offered || "Unknown";

      document.getElementById("inspectorStatus").value =
        nodeData.status || "TO TAKE";

      // Parse the Planned Term (e.g., "Fall 2024" -> "Fall" and "2024")
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

  // 3. Close sidebar logic
  network.on("deselectNode", function () {
    inspector.classList.remove("open");
    currentlySelectedNodeId = null;
  });

  document.getElementById("closeInspector").addEventListener("click", () => {
    inspector.classList.remove("open");
  });

  // 4. Listen for Sidebar Changes
  document
    .getElementById("inspectorStatus")
    .addEventListener("change", function (e) {
      if (currentlySelectedNodeId && detailsData[currentlySelectedNodeId]) {
        detailsData[currentlySelectedNodeId].status = e.target.value;
        markGraphDirty();
      }
    });

  // Handle the Split Term/Year
  function updatePlannedTerm() {
    if (!currentlySelectedNodeId || !detailsData[currentlySelectedNodeId])
      return;
    const season = document.getElementById("inspectorTermSeason").value;
    const year = document.getElementById("inspectorTermYear").value;

    const newVal = season === "Unassigned" ? "Unassigned" : `${season} ${year}`;
    detailsData[currentlySelectedNodeId].planned_semester = newVal;
    markGraphDirty();
  }
  document
    .getElementById("inspectorTermSeason")
    .addEventListener("change", updatePlannedTerm);
  document
    .getElementById("inspectorTermYear")
    .addEventListener("change", updatePlannedTerm);

  // --- POSITION SAVING LOGIC (DRAG END) ---
  network.on("dragEnd", function (params) {
    if (params.nodes.length > 0) {
      const positions = network.getPositions(params.nodes);

      // Update our dataset with precise pixel coordinates
      const updates = params.nodes.map((nodeId) => {
        return {
          id: nodeId,
          x: positions[nodeId].x,
          y: positions[nodeId].y,
        };
      });

      // Quietly update dataset and trigger a save state
      performWithoutHistory(() => nodes.update(updates));
      saveGraphState();
      markGraphDirty();
    }
  });
  // ----------------------------------------

  // --- UNDO / REDO HISTORY STACK ---
  let undoStack = [];
  let redoStack = [];

  function saveGraphState() {
    const currentPositions = network.getPositions();
    const currentNodes = nodes.get().map((n) => {
      // Ensure we grab the absolute latest positions on screen
      if (currentPositions[n.id]) {
        n.x = currentPositions[n.id].x;
        n.y = currentPositions[n.id].y;
      }
      return { ...n };
    });
    const currentEdges = edges.get().map((e) => ({ ...e }));

    undoStack.push({ nodes: currentNodes, edges: currentEdges });
    redoStack = []; // Clear redo on any new action
    updateUndoRedoButtons();
  }

  // Wrapper to prevent the undo/redo action itself from triggering a save
  function performWithoutHistory(action) {
    nodes.off("add", saveGraphState);
    nodes.off("remove", saveGraphState);
    nodes.off("update", saveGraphState);
    edges.off("add", saveGraphState);
    edges.off("remove", saveGraphState);

    action();

    nodes.on("add", saveGraphState);
    nodes.on("remove", saveGraphState);
    nodes.on("update", saveGraphState);
    edges.on("add", saveGraphState);
    edges.on("remove", saveGraphState);
  }

  // Bind the history saver to normal graph manipulations
  performWithoutHistory(() => {}); // Hack to just turn the listeners on

  // Wait half a second for physics to settle on initial load, then save base state
  setTimeout(saveGraphState, 500);

  // Wire up the buttons
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");

  if (undoBtn) {
    undoBtn.addEventListener("click", () => {
      if (undoStack.length > 1) {
        redoStack.push(undoStack.pop());
        const prevState = undoStack[undoStack.length - 1];

        performWithoutHistory(() => {
          nodes.clear();
          edges.clear();
          nodes.add(prevState.nodes);
          edges.add(prevState.edges);
        });

        updateUndoRedoButtons();
        markGraphDirty();
      }
    });
  }

  if (redoBtn) {
    redoBtn.addEventListener("click", () => {
      if (redoStack.length > 0) {
        const nextState = redoStack.pop();
        undoStack.push(nextState);

        performWithoutHistory(() => {
          nodes.clear();
          edges.clear();
          nodes.add(nextState.nodes);
          edges.add(nextState.edges);
        });

        updateUndoRedoButtons();
        markGraphDirty();
      }
    });
  }

  function updateUndoRedoButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }
  // ---------------------------------
});
