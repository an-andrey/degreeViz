// filepath: c:\Users\anamb\OneDrive\Desktop\Code\python\degreeViz\static\js\visNetworkOptions.js
import { parseSemesterToColor } from "./utils.js";
import { markGraphDirty, openCustomPrompt } from "./ui_handler.js";

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
        openCustomPrompt({
          title: "Add New Course",
          submitText: "Add Course",
          fields: [
            { id: "code", label: "Course Code", defaultValue: currentCode },
            {
              id: "title",
              label: "Course Title",
              defaultValue: nodeData.original_title,
            },
            {
              id: "credits",
              label: "Credits",
              defaultValue: nodeData.original_credits,
            },
            {
              id: "category",
              label: "Category",
              type: "select",
              options: ["CORE", "ELECTIVE", "COMPLEMENTARY"],
              defaultValue: currentCategory,
            },
            {
              id: "semesters",
              label: "Semesters Offered",
              type: "semester_builder",
              defaultValue: nodeData.original_semesters_offered,
            },
          ],
          onSubmit: (data) => {
            if (!data.code || !data.title) {
              alert("Course ID and Title are required.");
              return callback(null);
            }
            if (nodes.get(data.code)) {
              alert("A course with this ID already exists!");
              return callback(null);
            }

            const queryParams = new URLSearchParams({
              request: "add node",
              code: data.code,
              title: data.title,
              credits: data.credits,
              semesters_offered: data.semesters,
              x: nodeData.x,
              y: nodeData.y,
            }).toString();

            callback(null); // Close vis-network UI securely

            fetch(`/modify_graph?${queryParams}`, {
              method: "GET",
              headers: { "X-Requested-With": "XMLHttpRequest" },
            }).then((response) => {
              if (response.ok) {
                markGraphDirty();
                window.location.href = response.url; // Refresh to show node
              }
            });
          },
        });
      },

      editNode: function (nodeData, callback) {
        const currentCode = nodeData.id;
        const currentCategory = nodeData.category || "CORE"; // Default to CORE

        openCustomPrompt({
          title: "Edit Course",
          submitText: "Save Changes",
          fields: [
            { id: "code", label: "Course Code", defaultValue: currentCode },
            {
              id: "title",
              label: "Course Title",
              defaultValue: nodeData.original_title,
            },
            {
              id: "credits",
              label: "Credits",
              defaultValue: nodeData.original_credits,
            },
            {
              id: "category",
              label: "Category",
              type: "select",
              options: ["CORE", "ELECTIVE", "COMPLEMENTARY"],
              defaultValue: currentCategory,
            },
            {
              id: "semesters",
              label: "Semesters Offered",
              type: "semester_builder",
              defaultValue: nodeData.original_semesters_offered,
            },
          ],
          onSubmit: (data) => {
            if (!data.title || !data.code) return callback(null);

            const isRename = currentCode !== data.code;
            const finalId = data.code;

            nodeData.original_title = data.title;
            nodeData.original_credits = data.credits;
            nodeData.original_semesters_offered = data.semesters;
            nodeData.category = data.category;

            // Rebuild the label with the new Category Pill
            nodeData.label = `${finalId}\n${data.title}\n(${data.credits} credits)\n${data.semesters}\n\n${data.category}`;
            nodeData.color = parseSemesterToColor(data.semesters);

            if (isRename) {
              // 1. Abort vis-network's default save (it ignores ID changes)
              callback(null);

              // 2. Clone the node with the new ID
              const newNodeData = { ...nodeData, id: finalId };

              // 3. Keep Global Datasets in sync so "Save Graph" doesn't break
              if (detailsData[currentCode]) {
                detailsData[finalId] = detailsData[currentCode];
                delete detailsData[currentCode];
              }
              if (prereqsData[currentCode]) {
                prereqsData[finalId] = prereqsData[currentCode];
                delete prereqsData[currentCode];
              }
              for (let key in prereqsData) {
                const idx = prereqsData[key].indexOf(currentCode);
                if (idx > -1) prereqsData[key][idx] = finalId;
              }

              // 4. Update the Canvas
              nodes.remove(currentCode);
              nodes.add(newNodeData);

              // 5. Rewire edges
              const edgesToUpdate = edges
                .get()
                .filter((e) => e.from === currentCode || e.to === currentCode);
              const rewiredEdges = edgesToUpdate.map((e) => {
                const newEdge = { ...e };
                if (newEdge.from === currentCode) newEdge.from = finalId;
                if (newEdge.to === currentCode) newEdge.to = finalId;
                return newEdge;
              });
              edges.update(rewiredEdges);
            } else {
              callback(nodeData); // Normal update
            }

            // Sync global dataset properties
            if (detailsData[finalId]) {
              detailsData[finalId].title = data.title;
              detailsData[finalId].credits = data.credits;
              detailsData[finalId].semesters_offered = data.semesters;
              detailsData[finalId].category = data.category;
              detailsData[finalId].color = nodeData.color;
            }

            // Tell Python about the edit/rename
            const queryParams = new URLSearchParams({
              request: "edit node",
              old_code: currentCode, // Tells Python if a rename happened
              code: finalId,
              node_title: data.title,
              credits: data.credits,
              category: data.category,
              semesters_offered: data.semesters,
            }).toString();

            fetch(`/modify_graph?${queryParams}`, {
              method: "GET",
              headers: { "X-Requested-With": "XMLHttpRequest" },
            }).then((response) => {
              if (response.ok) markGraphDirty();
            });
          },
        });
      },
      deleteNode: function (dataToDelete, callback) {
        const nodeIdToDelete = dataToDelete.nodes[0];
        if (!nodeIdToDelete || !nodes.get(nodeIdToDelete)) {
          console.warn(
            `Node ${nodeIdToDelete} not found or invalid for deletion.`,
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
        }).then((response) => {
          if (response.ok) {
            markGraphDirty(); // allow graph to update
          } else {
            console.log("failed to delete node");
          }
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
        }).then((response) => {
          if (response.ok) {
            markGraphDirty(); // allow graph to update
          } else {
            console.log("failed to add edge");
          }
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
        }).then((response) => {
          if (response.ok) {
            markGraphDirty(); // allow graph to update
          } else {
            console.log("failed to edit node");
          }
        });
      },
    },
  };
}
