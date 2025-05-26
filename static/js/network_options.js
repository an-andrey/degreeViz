// filepath: c:\Users\anamb\OneDrive\Desktop\Code\python\degreeViz\static\js\visNetworkOptions.js
import { parseSemesterToColor } from "./utils.js";

export function getVisNetworkOptions(nodes, edges) {
  return {
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
    nodes: {
      // Global node options
      shape: "box",
      font: {
        // Basic font properties
        multi: "html",
        align: "center",
        // size: 14, // Default font size if needed
      },
      scaling: {
        label: {
          enabled: true, // Ensure label scaling is enabled to use its sub-options
          drawThreshold: 0,
        },
      },
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
      enabled: true,
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
      editNode: function (nodeDataToEdit, callback) {
        const newTitle = prompt(
          "Edit course title:",
          nodeDataToEdit.original_title
        );
        if (newTitle === null) {
          callback(null);
          return;
        }
        const newCredits = prompt(
          "Edit credits:",
          nodeDataToEdit.original_credits
        );
        if (newCredits === null) {
          callback(null);
          return;
        }
        const newSemesters = prompt(
          "Edit semesters offered:",
          nodeDataToEdit.original_semesters_offered
        );
        if (newSemesters === null) {
          callback(null);
          return;
        }
        const updatedData = { ...nodeDataToEdit };
        updatedData.original_title = newTitle;
        updatedData.original_credits = newCredits;
        updatedData.original_semesters_offered = newSemesters;
        updatedData.label = `${nodeDataToEdit.id}\n${newTitle}\n(${newCredits} credits)\n${newSemesters}`;
        // updatedData.title = `Course: ${nodeDataToEdit.id} - ${newTitle}\nCredits: ${newCredits}\nOffered: ${newSemesters}`;
        updatedData.color = parseSemesterToColor(newSemesters);
        callback(updatedData);
      },
      deleteNode: function (dataToDelete, callback) {
        const nodeIdToDelete = dataToDelete.nodes[0];
        if (!nodeIdToDelete || !nodes.get(nodeIdToDelete)) {
          console.warn(
            `Node ${nodeIdToDelete} not found or invalid for deletion.`
          );
          return callback(null);
        }
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
              const existingBypass = edges.get({
                filter: (e) => e.from === inEdge.from && e.to === outEdge.to,
              });
              if (existingBypass.length === 0) {
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
        if (newEdgesToAdd.length > 0) {
          edges.add(newEdgesToAdd);
        }
        nodes.remove(nodeIdToDelete);
        if (dataToDelete.edges && dataToDelete.edges.length > 0) {
          edges.remove(dataToDelete.edges);
        }
        callback(null);
      },
      addEdge: function (edgeData, callback) {
        if (edgeData.from === edgeData.to) {
          alert("Cannot link a course to itself.");
          callback(null);
          return;
        }
        const existingEdges = edges.get({
          filter: (edge) =>
            edge.from === edgeData.from && edge.to === edgeData.to,
        });
        if (existingEdges.length > 0) {
          alert(
            `An edge from ${edgeData.from} to ${edgeData.to} already exists.`
          );
          callback(null);
          return;
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
      deleteEdge: true,
    },
  };
}
