// filepath: c:\Users\anamb\OneDrive\Desktop\Code\python\degreeViz\static\js\main.js
import { initializeNodes, initializeEdges } from "./data_init.js";
import { getVisNetworkOptions } from "./network_options.js";
import {
  setupHomeLinkHandler,
  setupExportButtonHandler,
  initialLayoutAdjustment,
} from "./ui_handler.js";

document.addEventListener("DOMContentLoaded", function () {
  if (
    typeof prereqsData === "undefined" ||
    typeof detailsData === "undefined"
  ) {
    console.error(
      "Data (prereqsData or detailsData) not found. Make sure it's passed correctly from the Flask template."
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

  const options = getVisNetworkOptions(nodes, edges); // Pass nodes and edges
  const network = new vis.Network(container, data, options);

  // Setup UI Handlers
  setupHomeLinkHandler();
  setupExportButtonHandler(network, nodes, edges);
  initialLayoutAdjustment(network, nodes);
});
