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
    return; // Stop execution if data is missing
  }
  if (Object.keys(detailsData).length === 0) {
    console.warn(
      "detailsData is empty. The graph might not display any nodes."
    );
  }

  // 1. Create an array of nodes for Vis.js
  const nodes = new vis.DataSet();
  for (const courseId in detailsData) {
    if (detailsData.hasOwnProperty(courseId)) {
      const detail = detailsData[courseId];
      nodes.add({
        id: courseId,
        label: `${courseId}\n${detail.title || "Unknown Title"}\n(${
          detail.credits || "N/A"
        } credits)`,
        color: detail.color || parseSemesterToColor(detail.semesters_offered), // Use provided color or parse
        shape: "box",
        font: { multi: "html", align: "center" },
        title: `Course: ${courseId} - ${
          detail.title || "Unknown Title"
        }\nCredits: ${detail.credits || "N/A"}\nOffered: ${
          detail.semesters_offered || "Unknown"
        }`,
        original_title: detail.title || "Unknown Title",
        original_credits: detail.credits || "N/A",
        original_semesters_offered: detail.semesters_offered || "Unknown",
      });
    }
  }

  // 2. Create an array of edges (arrows) for Vis.js
  const edges = new vis.DataSet();
  for (const courseId in prereqsData) {
    if (prereqsData.hasOwnProperty(courseId)) {
      const prerequisites = prereqsData[courseId];
      if (Array.isArray(prerequisites)) {
        prerequisites.forEach((prereqId) => {
          if (nodes.get(prereqId) && nodes.get(courseId)) {
            // Ensure both source and target nodes exist
            edges.add({
              from: prereqId,
              to: courseId,
              arrows: "to",
              smooth: {
                enabled: true,
                type: "cubicBezier",
                forceDirection: "horizontal",
                roundness: 0.4,
              },
            });
          } else {
            if (!nodes.get(prereqId)) {
              console.warn(
                `Prerequisite source node ${prereqId} for course ${courseId} not found. Edge not created.`
              );
            }
            if (!nodes.get(courseId)) {
              console.warn(
                `Prerequisite target node ${courseId} (from ${prereqId}) not found. Edge not created.`
              );
            }
          }
        });
      }
    }
  }

  // 3. Create a network
  const container = document.getElementById("courseNetwork");
  if (!container) {
    console.error("Network container #courseNetwork not found.");
    return;
  }
  const data = {
    nodes: nodes,
    edges: edges,
  };
  const options = {
    layout: {
      hierarchical: {
        enabled: true,
        direction: "LR",
        sortMethod: "directed",
        levelSeparation: 280,
        nodeSpacing: 140,
        treeSpacing: 220,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
        shakeTowards: "roots",
      },
    },
    physics: {
      enabled: false,
    },
    edges: {
      color: {
        color: "#848484",
        highlight: "#5D5D5D",
        hover: "#5D5D5D",
        inherit: "from",
        opacity: 1.0,
      },
      width: 1.5,
      smooth: {
        enabled: true,
        type: "cubicBezier",
        forceDirection: "horizontal",
        roundness: 0.4,
      },
    },
    interaction: {
      dragNodes: true,
      dragView: true,
      hover: true,
      zoomView: true,
      tooltipDelay: 200,
      navigationButtons: true,
      keyboard: true,
    },
    manipulation: {
      enabled: false,
      initiallyActive: false,
      addNode: function (nodeData, callback) {
        nodeData.id = prompt("Enter new Course ID (e.g., COMP101):", "");
        if (!nodeData.id) {
          alert("Node ID cannot be empty.");
          return callback(null);
        }
        if (nodes.get(nodeData.id)) {
          alert("Node with this ID already exists!");
          return callback(null);
        }
        const title = prompt("Enter course title:", "New Course");
        const credits = prompt("Enter credits:", "3");
        const semesters = prompt(
          "Enter semesters offered (e.g., Fall, Winter):",
          "Fall"
        );

        nodeData.original_title = title || "New Course";
        nodeData.original_credits = credits || "3";
        nodeData.original_semesters_offered = semesters || "Fall";

        nodeData.label = `${nodeData.id}\n${nodeData.original_title}\n(${nodeData.original_credits} credits)`;
        nodeData.title = `Course: ${nodeData.id} - ${nodeData.original_title}\nCredits: ${nodeData.original_credits}\nOffered: ${nodeData.original_semesters_offered}`;
        nodeData.color = parseSemesterToColor(
          nodeData.original_semesters_offered
        );
        nodeData.shape = "box";
        nodeData.font = { multi: "html", align: "center" };
        callback(nodeData);
      },
      editNode: function (nodeData, callback) {
        const newTitle = prompt("Edit course title:", nodeData.original_title);
        const newCredits = prompt("Edit credits:", nodeData.original_credits);
        const newSemesters = prompt(
          "Edit semesters offered:",
          nodeData.original_semesters_offered
        );
        if (newTitle === null || newCredits === null || newSemesters === null)
          return callback(null);
        nodeData.original_title = newTitle;
        nodeData.original_credits = newCredits;
        nodeData.original_semesters_offered = newSemesters;
        nodeData.label = `${nodeData.id}\n${newTitle}\n(${newCredits} credits)`;
        nodeData.title = `Course: ${nodeData.id} - ${newTitle}\nCredits: ${newCredits}\nOffered: ${newSemesters}`;
        nodeData.color = parseSemesterToColor(newSemesters);
        callback(nodeData);
      },
      deleteNode: function (dataToDelete, callback) {
        const nodeIdToDelete = dataToDelete.nodes[0];
        if (!nodeIdToDelete) return callback(null);
        let incomingEdges = edges.get({
          filter: (edge) => edge.to === nodeIdToDelete,
        });
        let outgoingEdges = edges.get({
          filter: (edge) => edge.from === nodeIdToDelete,
        });
        let newEdgesToAdd = [];
        incomingEdges.forEach((inEdge) => {
          outgoingEdges.forEach((outEdge) => {
            if (inEdge.from !== outEdge.to) {
              const existing = edges.get({
                filter: (e) => e.from === inEdge.from && e.to === outEdge.to,
              });
              if (existing.length === 0) {
                newEdgesToAdd.push({
                  from: inEdge.from,
                  to: outEdge.to,
                  arrows: "to",
                  smooth: {
                    enabled: true,
                    type: "cubicBezier",
                    forceDirection: "horizontal",
                    roundness: 0.4,
                  },
                });
              }
            }
          });
        });
        if (newEdgesToAdd.length > 0) edges.add(newEdgesToAdd);
        callback(dataToDelete);
      },
      addEdge: function (edgeData, callback) {
        if (edgeData.from === edgeData.to) {
          alert(
            "Cannot link a course to itself. Attempted From: " +
              edgeData.from +
              ", To: " +
              edgeData.to
          );
          return callback(null);
        }
        edgeData.arrows = "to";
        edgeData.smooth = {
          enabled: true,
          type: "cubicBezier",
          forceDirection: "horizontal",
          roundness: 0.4,
        };
        callback(edgeData);
      },
      deleteEdge: function (dataToDelete, callback) {
        callback(dataToDelete);
      },
    },
  };
  const network = new vis.Network(container, data, options);

  // if changing, make sure to update the one defined in app.py
  function parseSemesterToColor(semesterText) {
    if (typeof semesterText !== "string") return "LightGray";
    const text = semesterText.toLowerCase();
    if (text.includes("Fall") && text.includes("Winter")) return "DarkOrchid";
    if (text.includes("Fall")) return "Coral";
    if (text.includes("Winter")) return "CornFlowerBlue";
    if (text.includes("Summer")) return "Gold";
    return "LightGray";
  }

  // --- Custom Button Event Listeners ---
  const addNodeBtn = document.getElementById("addNodeBtn");
  const addEdgeBtn = document.getElementById("addEdgeBtn");
  const editModeBtn = document.getElementById("editModeBtn");
  const deleteSelectedBtn = document.getElementById("deleteSelectedBtn");
  const disableEditModeBtn = document.getElementById("disableEditModeBtn");
  const exportGraphBtn = document.getElementById("exportGraphBtn");
  const homeLink = document.getElementById("homeLink");

  if (addNodeBtn)
    addNodeBtn.onclick = function () {
      network.addNodeMode();
      if (disableEditModeBtn) disableEditModeBtn.style.display = "inline-block";
    };
  if (addEdgeBtn)
    addEdgeBtn.onclick = function () {
      network.addEdgeMode();
      if (disableEditModeBtn) disableEditModeBtn.style.display = "inline-block";
    };
  if (editModeBtn)
    editModeBtn.onclick = function () {
      network.editNode();
      if (disableEditModeBtn) disableEditModeBtn.style.display = "inline-block";
    };
  if (deleteSelectedBtn)
    deleteSelectedBtn.onclick = function () {
      network.deleteSelected();
    };
  if (disableEditModeBtn)
    disableEditModeBtn.onclick = function () {
      network.disableEditMode();
      this.style.display = "none";
    };

  if (homeLink && homeLink.dataset.url) {
    // Check if data-url attribute exists
    homeLink.onclick = function () {
      window.location.href = homeLink.dataset.url; // Use the URL from data attribute
    };
  } else if (homeLink) {
    console.warn("Home link URL not found in data-url attribute.");
  }

  if (exportGraphBtn) {
    exportGraphBtn.onclick = function () {
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

  let hierarchicalEnabled = true;
  if (nodes.length > 0) {
    // Only try to draw if there are nodes
    network.once("afterDrawing", function () {
      if (hierarchicalEnabled) {
        network.setOptions({
          layout: { hierarchical: { enabled: false } },
        });
        hierarchicalEnabled = false;
      }
    });
  } else {
    console.warn("No nodes to draw. Hierarchical layout adjustment skipped.");
  }
});
