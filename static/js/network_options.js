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
          drawThreshold: 0, // <<< KEY CHANGE HERE: Labels hidden if their calculated size is less than this. 0 = always draw.
          // min: 10, // Optional: Minimum font size (in px) when scaling
          // max: 30, // Optional: Maximum font size (in px) when scaling
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
        const id = prompt("Enter new Course ID (e.g., COMP101):", "");
        if (!id) {
          callback(null);
          return;
        }
        if (nodes.get(id)) {
          alert("Node with this ID already exists!");
          callback(null);
          return;
        }
        const title = prompt("Enter course title:", "New Course");
        if (title === null) {
          callback(null);
          return;
        }
        const credits = prompt("Enter credits:", "3");
        if (credits === null) {
          callback(null);
          return;
        }
        const semesters = prompt(
          "Enter semesters offered (e.g., Fall, Winter):",
          "Fall"
        );
        if (semesters === null) {
          callback(null);
          return;
        }

        const newNodeDataFull = {
          id: id,
          label: `${id}\n${title}\n(${credits} credits)\n${semesters}`,
          title: `Course: ${id} - ${title}\nCredits: ${credits}\nOffered: ${semesters}`,
          color: parseSemesterToColor(semesters),
          shape: "box",
          font: { multi: "html", align: "center" },
          original_title: title,
          original_credits: credits,
          original_semesters_offered: semesters,
          x: nodeData.x,
          y: nodeData.y,
        };
        callback(newNodeDataFull);
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
        updatedData.title = `Course: ${nodeDataToEdit.id} - ${newTitle}\nCredits: ${newCredits}\nOffered: ${newSemesters}`;
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
