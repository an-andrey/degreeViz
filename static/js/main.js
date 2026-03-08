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
