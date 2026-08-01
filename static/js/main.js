/*
 * main.js
 * Entry point for the graph page. Flask injects `detailsData`,
 * `prereqsData`, and `programRequirements` into `graph.html`; this module
 * turns those plain objects into vis-network DataSets, wires every UI
 * subsystem to the same in-memory objects, and sends broad
 * `degreeviz:data-updated` events when secondary views should rerender.
 *
 * Important mental model:
 * - `nodes` / `edges` are the visual graph state owned by vis-network.
 * - `detailsData` / `prereqsData` are the saveable application state.
 * - Most handlers must update both worlds, then mark the graph dirty.
 */
import { initializeNodes, initializeEdges } from "./data_init.js";
import { createGraphState } from "./graph_state.js";
import { getVisNetworkOptions } from "./network_options.js";
import {
  setupHomeLinkHandler,
  initialLayoutAdjustment,
  setupSaveButtonHandler,
  markGraphDirty,
} from "./ui_handler.js";
import { setupAddProgramButton } from "./program_handler.js";
import { setupHistory } from "./history.js";
import { setupSheetViewListeners, updateSheetView } from "./sheet_view.js";
import { setupSidebar } from "./sidebar.js";
import {
  generateNodeLabel,
  getCategoryShape,
  getCategoryShapeProperties,
  getStatusColor,
} from "./node_utils.js";
import { updateGpaTracker } from "./gpa_tracker.js";
import { setupOptionalCoursesShelf } from "./optional_courses.js";

document.addEventListener("DOMContentLoaded", function () {
  if (
    typeof prereqsData === "undefined" ||
    typeof detailsData === "undefined"
  ) {
    console.error("Data not found.");
    return;
  }

  const graphState = createGraphState({
    details: detailsData,
    prereqs: prereqsData,
    requirements: window.programRequirements || programRequirements || { buckets: [] },
    markDirty: markGraphDirty,
  });
  window.graphState = graphState;

  const nodes = initializeNodes(graphState.details, graphState.prereqs);
  const edges = initializeEdges(graphState.prereqs, nodes);
  const container = document.getElementById("courseNetwork");
  const options = getVisNetworkOptions(nodes, edges, graphState);

  //update node colours
  const formatUpdates = nodes
    .get()
    .map((n) => {
      const d = graphState.details[n.id];
      if (d) {
        return {
          id: n.id,
          label: generateNodeLabel(
            d.code || n.id,
            d.title,
            d.credits,
            d.planned_semester,
          ),
          color: getStatusColor(d.status),
          shape: getCategoryShape(d.category),
          shapeProperties: getCategoryShapeProperties(d.category),
        };
      }
      return null;
    })
    .filter((n) => n !== null);

  nodes.update(formatUpdates);

  // Position restore logic
  if (
    nodes.get().some((node) => node.x !== undefined && node.y !== undefined)
  ) {
    options.layout.hierarchical.enabled = false;
  }

  const addCourseBtn = document.getElementById("addCustomCourseBtn");
  if (addCourseBtn) {
    addCourseBtn.addEventListener("click", () => {
      // This forces the graph into "drop a node" crosshair mode!
      network.addNodeMode();
    });
  }

  const network = new vis.Network(container, { nodes, edges }, options);

  // Initialize UI & Tools
  setupHomeLinkHandler();
  setupSaveButtonHandler(network, nodes, edges, graphState);
  initialLayoutAdjustment(network, nodes);
  setupSheetViewListeners(
    graphState.details,
    (details) => updateSheetView(details, graphState.requirements),
    () => graphState.notify({ views: false }),
  );

  // Initialize Complex Subsystems
  const { performWithoutHistory, saveGraphState } = setupHistory(
    network,
    nodes,
    edges,
    markGraphDirty,
  );
  graphState.setNetworkContext({ network, nodes, edges, performWithoutHistory });
  setupSidebar(
    network,
    nodes,
    graphState,
    performWithoutHistory,
  );
  setupAddProgramButton(
    network,
    nodes,
    edges,
    graphState,
    saveGraphState,
  );
  setupOptionalCoursesShelf(network, nodes, edges, graphState);

  const infoPopovers = [
    ["plannerInfoBtn", "plannerInfoPopover"],
    ["creditInfoBtn", "creditInfoPopover"],
    ["gpaInfoBtn", "gpaInfoPopover"],
  ]
    .map(([buttonId, popoverId]) => ({
      button: document.getElementById(buttonId),
      popover: document.getElementById(popoverId),
    }))
    .filter(({ button, popover }) => button && popover);

  function closeInfoPopover({ button, popover }) {
    popover.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }

  infoPopovers.forEach((target) => {
    target.button.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = target.popover.hidden;
      infoPopovers.forEach(closeInfoPopover);
      target.popover.hidden = !shouldOpen;
      target.button.setAttribute("aria-expanded", String(shouldOpen));
    });
  });

  document.addEventListener("click", (event) => {
    infoPopovers.forEach((target) => {
      if (
        !target.popover.hidden &&
        !target.popover.contains(event.target) &&
        !target.button.contains(event.target)
      ) {
        closeInfoPopover(target);
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") infoPopovers.forEach(closeInfoPopover);
  });

  const openOptionalShelfBtn = document.getElementById("openOptionalShelfBtn");
  const optionalShelf = document.getElementById("optionalCourseShelf");
  const plannerLayout = document.querySelector(".planner-layout");
  if (openOptionalShelfBtn && optionalShelf && plannerLayout) {
    const closeBtn = document.createElement("button");
    closeBtn.className = "secondary-btn";
    closeBtn.textContent = "Hide";
    closeBtn.onclick = () => {
      plannerLayout.classList.add("shelf-hidden");
      openOptionalShelfBtn.style.display = "inline-block";
    };
    const header = optionalShelf.querySelector(".optional-shelf-header");
    if (header) header.appendChild(closeBtn);

    openOptionalShelfBtn.addEventListener("click", () => {
      plannerLayout.classList.remove("shelf-hidden");
      openOptionalShelfBtn.style.display = "none";
    });
  }

  // Core Network Events
  network.on("click", function (params) {
    if (network.manipulation.options.enabled) {
      if (params.nodes.length > 0 || params.edges.length > 0)
        network.enableEditMode();
      else network.disableEditMode();
    }
  });

  network.on("dragEnd", function (params) {
    if (params.nodes.length > 0) {
      const positions = network.getPositions(params.nodes);
      const updates = params.nodes.map((id) => ({
        id,
        x: positions[id].x,
        y: positions[id].y,
      }));
      performWithoutHistory(() => nodes.update(updates));
      params.nodes.forEach((id) => {
        if (graphState.details[id] && positions[id]) {
          graphState.details[id].x = positions[id].x;
          graphState.details[id].y = positions[id].y;
        }
      });
      saveGraphState();
      graphState.notify();
    }
  });

  // Initial Data Sync
  setTimeout(() => {
    updateSheetView(graphState.details, graphState.requirements);
    updateGpaTracker(graphState.details);
  }, 500);
});
