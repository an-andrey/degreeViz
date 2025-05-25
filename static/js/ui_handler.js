// filepath: c:\Users\anamb\OneDrive\Desktop\Code\python\degreeViz\static\js\graphUiHandlers.js
export function setupHomeLinkHandler() {
  const homeLink = document.getElementById("homeLink");
  if (homeLink && homeLink.dataset.url) {
    homeLink.onclick = function () {
      window.location.href = homeLink.dataset.url;
    };
  } else if (homeLink) {
    console.warn("Home link URL not found in data-url attribute.");
  }
}

export function setupExportButtonHandler(network, nodes, edges) {
  const exportGraphBtn = document.getElementById("exportGraphBtn");
  if (exportGraphBtn) {
    exportGraphBtn.onclick = function () {
      if (!network) {
        console.error("Network not initialized for export.");
        return;
      }
      network.storePositions();
      const networkDataToExport = {
        nodes: nodes.get({
          fields: [
            "id",
            "label",
            "color",
            "shape",
            "font",
            "title",
            "original_title",
            "original_credits",
            "original_semesters_offered",
            "x",
            "y",
          ],
        }),
        edges: edges.get(),
      };
      const jsonData = JSON.stringify(networkDataToExport, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const fileUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = "course_graph.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(fileUrl);
      alert("Graph exported as course_graph.json!");
    };
  }
}

export function initialLayoutAdjustment(network, nodesDataSet) {
  let hierarchicalEnabledInitial = true;
  if (nodesDataSet.length > 0) {
    network.once("afterDrawing", function () {
      if (hierarchicalEnabledInitial) {
        network.setOptions({
          layout: { hierarchical: { enabled: false } },
        });
        network.fit();
        hierarchicalEnabledInitial = false;
      }
    });
  } else {
    console.warn("No nodes to draw. Hierarchical layout adjustment skipped.");
  }
}
