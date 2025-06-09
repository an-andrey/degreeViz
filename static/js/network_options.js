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
        const id = prompt("Enter new Course ID (e.g., COMP101):", "");
        if (!id) {
          alert("Node ID cannot be empty.");
          return callback(null);
        }
        if (nodes.get(id)) {
          alert("Node with this ID already exists!");
          return callback(null);
        }
        const title = prompt("Enter course title:", "New Course");
        const credits = prompt("Enter credits:", "3");
        const semesters = prompt(
          "Enter semesters offered (e.g., Fall, Winter):",
          "Fall"
        );

        // Handle cases where user cancels prompts
        if (title === null || credits === null || semesters === null) {
          return callback(null); // User cancelled one of the prompts
        }

        const queryParams = new URLSearchParams({
          request: "add node",
          code: id,
          title: title,
          credits: credits,
          semesters_offered: semesters,
          x: nodeData.x,
          y: nodeData.y,
        }).toString();

        callback(null);

        fetch(`/modify_graph?${queryParams}`, {
          method: "GET", // Or 'POST'
          headers: { "X-Requested-With": "XMLHttpRequest" },
        }).then((response) => {
          if (response.ok) {
            window.location.href = response.url;
          } else {
            console.log("failed to add node");
          }
        });
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

        // nodeData.id = newCode;
        console.log(newSemesters);
        nodeData.original_title = newTitle;
        nodeData.original_credits = newCredits;
        nodeData.original_semesters_offered = newSemesters;
        nodeData.label = `${nodeData.id}\n${newTitle}\n(${newCredits} credits)\n${newSemesters}`;
        nodeData.color = parseSemesterToColor(newSemesters);
        callback(nodeData);

        const queryParams = new URLSearchParams({
          request: "edit node",
          code: nodeData.id,
          node_title: newTitle,
          credits: newCredits,
          semesters_offered: newSemesters,
        }).toString();

        fetch(`/modify_graph?${queryParams}`, {
          method: "GET", // Or 'POST'
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
      },
      deleteNode: function (dataToDelete, callback) {
        const nodeIdToDelete = dataToDelete.nodes[0];
        if (!nodeIdToDelete || !nodes.get(nodeIdToDelete)) {
          console.warn(
            `Node ${nodeIdToDelete} not found or invalid for deletion.`
          );
          return callback(null);
        }

        const queryParams = new URLSearchParams({
          request: "delete node",
          code: nodeIdToDelete,
        }).toString();

        callback(dataToDelete);

        // Making request to server to update session itself
        fetch(`/modify_graph?${queryParams}`, {
          method: "GET", // Or 'POST'
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
      },
      addEdge: function (edgeData, callback) {
        // edgeData contains from, to, and potentially other properties
        const fromNodeId = edgeData.from;
        const toNodeId = edgeData.to;

        if (fromNodeId === toNodeId) {
          alert("Cannot link a course to itself.");
          callback(null); // Cancel adding the edge
          return;
        }

        // Check if an edge already exists (client-side check)
        const existingEdges = edges.get({
          filter: (edge) => edge.from === fromNodeId && edge.to === toNodeId,
        });

        if (existingEdges.length > 0) {
          alert(`An edge from ${fromNodeId} to ${toNodeId} already exists.`);
          callback(null); // Cancel adding the edge
          return;
        }

        // If all checks pass, optimistically update the client-side graph
        // You might want to assign a temporary ID or let vis.js handle it
        // For simplicity, we'll let vis.js assign an ID if not provided
        edgeData.arrows = "to"; // Or your default arrow type
        edgeData.smooth = {
          // Or your default smooth options
          enabled: true,
          type: "cubicBezier",
          forceDirection: "horizontal",
          roundness: 0.4,
        };

        callback(edgeData); // This adds the edge to the local vis.js graph

        // Now, send an asynchronous request to the server to update the session
        const queryParams = new URLSearchParams({
          request: "add edge", // Ensure server expects "add_edge"
          from_node: fromNodeId,
          to_node: toNodeId,
        }).toString();

        fetch(`/modify_graph?${queryParams}`, {
          method: "GET", // Or 'POST' if you prefer, adjust server accordingly
          headers: {
            "X-Requested-With": "XMLHttpRequest", // Often used to identify AJAX requests
          },
        });
      },
      deleteEdge: function (dataToDelete, callback) {
        // dataToDelete contains {edges: [edgeId1, edgeId2,...], nodes: []}
        const edgeIdsToDelete = dataToDelete.edges;

        if (!edgeIdsToDelete || edgeIdsToDelete.length === 0) {
          console.warn("deleteEdge called but no edge IDs were provided.");
          callback(null);
          return;
        }

        // For simplicity, let's assume we only handle one edge deletion at a time via UI.
        // If multiple edges can be selected and deleted, you'd loop or send all.
        const edgeId = edgeIdsToDelete[0];
        const edgeObject = edges.get(edgeId); // Get the edge from client-side DataSet

        if (!edgeObject) {
          console.warn(`Edge with ID "${edgeId}" not found locally.`);
          callback(null);
          return;
        }

        const fromNodeId = edgeObject.from;
        const toNodeId = edgeObject.to;

        // Optimistically remove the edge from the client-side graph
        callback(dataToDelete); // This removes the edge(s) from local vis.js graph

        // Send asynchronous request to the server
        const queryParams = new URLSearchParams({
          request: "delete edge", // Ensure server expects "delete_edge"
          from_node: fromNodeId,
          to_node: toNodeId,
          // If your server needs the specific edge ID (vis.js internal ID)
          // you could send it too, but from/to is usually how prereqs are stored.
          // edge_id: edgeId
        }).toString();

        fetch(`/modify_graph?${queryParams}`, {
          method: "GET", // Or 'POST'
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
        });
      },
    },
  };
}
