import { parseSemesterToColor } from "./utils.js";
import { markGraphDirty, openCustomPrompt } from "./ui_handler.js";
import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

export function getVisNetworkOptions(nodes, edges) {
  return {
    locale: "en",
    locales: {
      en: {
        edit: "Edit",
        addNode: "Add Course",
        editNode: "Edit Course",
        addEdge: "Draw Prerequisite",
        editEdge: "Edit Prerequisite",
        del: "Delete Selected",
        back: "Cancel",
        addDescription: "Click in an empty space to place a new course.",
        edgeDescription:
          "Click on a course and drag the line to another course to connect them.",
        editEdgeDescription:
          "Click on the control points and drag them to a course to connect to it.",
        createEdgeError: "Cannot link prerequisites to a cluster.",
        deleteClusterError: "Clusters cannot be deleted.",
        editClusterError: "Clusters cannot be edited.",
      },
    },
    layout: {
      hierarchical: {
        //custom topo sort algo
        enabled: false,
      },
    },
    physics: { enabled: false },
    nodes: {
      shape: "box",
      borderWidth: 2,
      borderWidthSelected: 2,
      font: {
        multi: "html",
        align: "center",
        size: 14, // Base size for normal text, <b>, and <i>
        color: "#000000",
        face: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        mono: {
          // Targets the <code> tag!
          size: 24, // Massive course codes!
          face: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          vadjust: 2, // Slight vertical adjustment to keep it centered
        },
      },
      scaling: { label: { enabled: true, drawThreshold: 0 } },
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
      zoomSpeed: 0.4,
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
            {
              id: "code",
              label: "Course Code",
              type: "course_search",
              required: true,
            },
            { id: "title", label: "Course Title" },
            { id: "credits", label: "Credits", defaultValue: "3" },
            {
              id: "category",
              label: "Category",
              type: "select",
              options: ["CORE", "ELECTIVE", "COMPLEMENTARY"],
              defaultValue: "CORE",
            },
            {
              id: "semesters",
              label: "Semesters Offered",
              type: "semester_builder",
              defaultValue: "Unknown",
            },
          ],
          onSubmit: (data) => {
            if (!data.title || !data.code) {
              callback(null);
              return false; // Keep modal open if empty
            }

            // UNIQUE COURSE CHECK: Safely checks older nodes that might lack a .code property
            const codeExists = Object.entries(detailsData).some(
              ([key, course]) => {
                const existingCode = course.code || key; // Fallback to the dictionary key for older nodes
                return existingCode.toUpperCase() === data.code.toUpperCase();
              },
            );

            if (codeExists) {
              alert(
                `Error: The course ${data.code.toUpperCase()} is already on your graph!`,
              );
              callback(null);
              return false; // Tells ui_handler to KEEP THE MODAL OPEN
            }

            const newLabel = generateNodeLabel(
              data.code,
              data.title,
              data.credits,
              data.semesters,
              data.category,
              data.status,
            );

            const newNode = {
              id: nodeData.id,
              x: nodeData.x,
              y: nodeData.y,
              code: data.code.toUpperCase(),
              original_title: data.title,
              original_credits: data.credits,
              original_semesters_offered: data.semesters,
              category: data.category,
              label: newLabel,
              color: getStatusColor(nodeData.status),
            };

            callback(null);
            nodes.add(newNode);

            detailsData[newNode.id] = {
              code: newNode.code,
              title: data.title,
              credits: data.credits,
              category: data.category,
              semesters_offered: data.semesters,
              status: "Unassigned",
              planned_semester: "Unassigned",
              color: newNode.color,
              x: newNode.x,
              y: newNode.y,
            };
            prereqsData[newNode.id] = [];

            const queryParams = new URLSearchParams({
              request: "add node",
              node_id: newNode.id,
              code: newNode.code,
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

            return true; // Success! Close the modal.
          },
        });
      },

      editNode: function (nodeData, callback) {
        const dData = detailsData[nodeData.id] || {};
        const currentCode = dData.code || nodeData.id;
        const currentCategory = dData.category || "CORE";

        openCustomPrompt({
          title: "Edit Course",
          submitText: "Save Changes",
          fields: [
            { id: "code", label: "Course Code", defaultValue: currentCode },
            {
              id: "title",
              label: "Course Title",
              defaultValue: dData.title || "",
            },
            {
              id: "credits",
              label: "Credits",
              defaultValue: dData.credits || "3",
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
              defaultValue: dData.semesters_offered || "Unknown",
            },
          ],
          onSubmit: (data) => {
            if (!data.title || !data.code) {
              callback(null);
              return false;
            }

            const codeExists = Object.entries(detailsData).some(
              ([key, course]) => {
                if (key === nodeData.id) return false;
                const existingCode = course.code || key;
                return existingCode.toUpperCase() === data.code.toUpperCase();
              },
            );

            if (codeExists) {
              alert(
                `Error: Cannot rename to ${data.code.toUpperCase()} because it already exists!`,
              );
              callback(null);
              return false;
            }

            // Update the single source of truth First!
            if (detailsData[nodeData.id]) {
              detailsData[nodeData.id].code = data.code.toUpperCase();
              detailsData[nodeData.id].title = data.title;
              detailsData[nodeData.id].credits = data.credits;
              detailsData[nodeData.id].semesters_offered = data.semesters;
              detailsData[nodeData.id].category = data.category;
            }

            // Tell Vis-Network to update the visuals
            nodeData.label = generateNodeLabel(
              detailsData[nodeData.id].code,
              data.title,
              data.credits,
              data.semesters,
              data.category,
              detailsData[nodeData.id].planned_semester,
              detailsData[nodeData.id].status,
            );
            nodeData.color = getStatusColor(detailsData[nodeData.id].status); // Use status color!

            callback(nodeData);

            const queryParams = new URLSearchParams({
              request: "edit node",
              node_id: nodeData.id,
              code: detailsData[nodeData.id].code,
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

            return true;
          },
        });
      },
      deleteNode: function (dataToDelete, callback) {
        if (!dataToDelete.nodes || dataToDelete.nodes.length === 0)
          return callback(null);

        // Loop through EVERY node the user selected for deletion
        dataToDelete.nodes.forEach((nodeIdToDelete) => {
          if (!nodes.get(nodeIdToDelete)) return;

          // 1. DELETE FROM LOCAL JAVASCRIPT MEMORY
          if (detailsData[nodeIdToDelete]) {
            delete detailsData[nodeIdToDelete];
          }
          if (prereqsData[nodeIdToDelete]) {
            delete prereqsData[nodeIdToDelete];
          }

          // 2. Scrub this node from any other course's prerequisites list locally
          for (let key in prereqsData) {
            prereqsData[key] = prereqsData[key].filter(
              (id) => id !== nodeIdToDelete,
            );
          }

          // 3. Tell Python about this specific node
          fetch(`/modify_graph?request=delete node&node_id=${nodeIdToDelete}`, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
          }).then((response) => {
            if (response.ok) {
              markGraphDirty();
              updateSheetView(detailsData); // Instantly recalibrates the Sheet View!
            }
          });
        });

        callback(dataToDelete); // Removes all of them from the visual canvas
      },

      addEdge: function (edgeData, callback) {
        if (edgeData.from === edgeData.to) return callback(null);
        if (
          edges.get({
            filter: (e) => e.from === edgeData.from && e.to === edgeData.to,
          }).length > 0
        )
          return callback(null);

        // 1. Add edge to local memory
        if (!prereqsData[edgeData.to]) prereqsData[edgeData.to] = [];
        if (!prereqsData[edgeData.to].includes(edgeData.from)) {
          prereqsData[edgeData.to].push(edgeData.from);
        }

        edgeData.arrows = "to";
        edgeData.smooth = {
          enabled: true,
          type: "cubicBezier",
          forceDirection: "horizontal",
          roundness: 0.4,
        };

        callback(edgeData); // Adds to canvas

        // 2. Tell Python
        fetch(
          `/modify_graph?request=add edge&from_node=${edgeData.from}&to_node=${edgeData.to}`,
          { headers: { "X-Requested-With": "XMLHttpRequest" } },
        ).then((response) => {
          if (response.ok) markGraphDirty();
        });
      },

      deleteEdge: function (dataToDelete, callback) {
        if (!dataToDelete.edges || dataToDelete.edges.length === 0)
          return callback(null);

        // Loop through EVERY edge the user selected for deletion
        dataToDelete.edges.forEach((edgeId) => {
          const edgeObject = edges.get(edgeId);
          if (!edgeObject) return;

          // 1. Remove edge from local memory
          if (prereqsData[edgeObject.to]) {
            prereqsData[edgeObject.to] = prereqsData[edgeObject.to].filter(
              (id) => id !== edgeObject.from,
            );
          }

          // 2. Tell Python about this specific edge
          fetch(
            `/modify_graph?request=delete edge&from_node=${edgeObject.from}&to_node=${edgeObject.to}`,
            { headers: { "X-Requested-With": "XMLHttpRequest" } },
          ).then((response) => {
            if (response.ok) markGraphDirty();
          });
        });

        callback(dataToDelete); // Removes all selected edges from canvas
      },
    },
  };
}
