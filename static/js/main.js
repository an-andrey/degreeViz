import { initializeNodes, initializeEdges } from "./data_init.js";
import { getVisNetworkOptions } from "./network_options.js";
import {
  setupHomeLinkHandler,
  setupExportButtonHandler,
  initialLayoutAdjustment,
  setupSaveButtonHandler,
  markGraphDirty,
} from "./ui_handler.js";
import { setupHistory } from "./history.js";
import { setupSheetViewListeners, updateSheetView } from "./sheet_view.js";
import { setupSidebar } from "./sidebar.js";
import { generateNodeLabel, getStatusColor } from "./node_utils.js";

document.addEventListener("DOMContentLoaded", function () {
  if (
    typeof prereqsData === "undefined" ||
    typeof detailsData === "undefined"
  ) {
    console.error("Data not found.");
    return;
  }

  const nodes = initializeNodes(detailsData);
  const edges = initializeEdges(prereqsData, nodes);
  const container = document.getElementById("courseNetwork");
  const options = getVisNetworkOptions(nodes, edges);

  //update node colours
  const formatUpdates = nodes
    .get()
    .map((n) => {
      const d = detailsData[n.id];
      if (d) {
        return {
          id: n.id,
          label: generateNodeLabel(
            d.code || n.id,
            d.title,
            d.credits,
            d.semesters_offered,
            d.category,
            d.planned_semester,
            d.status,
          ),
          color: getStatusColor(d.status),
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

  const network = new vis.Network(container, { nodes, edges }, options);

  // Initialize UI & Tools
  setupHomeLinkHandler();
  setupExportButtonHandler(network, nodes, edges);
  setupSaveButtonHandler(network, nodes, edges);
  initialLayoutAdjustment(network, nodes);
  setupSheetViewListeners(detailsData, updateSheetView, markGraphDirty);

  // Initialize Complex Subsystems
  const { performWithoutHistory, saveGraphState } = setupHistory(
    network,
    nodes,
    edges,
    markGraphDirty,
  );
  setupSidebar(
    network,
    nodes,
    detailsData,
    markGraphDirty,
    performWithoutHistory,
  );

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
      saveGraphState();
      markGraphDirty();
    }
  });

  // Initial Data Sync
  setTimeout(() => updateSheetView(detailsData), 500);
});
