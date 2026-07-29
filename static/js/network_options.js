/*
 * network_options.js
 * Defines vis-network behavior and the graph manipulation callbacks.
 *
 * This file now delegates data changes to `graphState`, keeping vis-network
 * callbacks focused on user interaction instead of session sync, dirty state,
 * and derived view refreshes.
 */
import { openCustomPrompt } from "./ui_handler.js";

export function getVisNetworkOptions(nodes, edges, graphState) {
  window.coursePoolStore = window.coursePoolStore || {};
  Object.keys(graphState.details || {}).forEach((id) => {
    const d = graphState.details[id] || {};
    if (d.include_in_graph === false) {
      window.coursePoolStore[id] = {
        detail: d,
        prereqs: Array.isArray(graphState.prereqs[id]) ? [...graphState.prereqs[id]] : [],
      };
    }
  });
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
              label: "Requirement Type",
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
            if (!data.code) {
              callback(null);
              return false; // Keep modal open if empty
            }
            if (!data.title || !String(data.title).trim()) {
              data.title = `${data.code.toUpperCase()} (Custom Course)`;
            }
            const requestedCode = graphState.normalizedCode(data.code);
            const existingEntry = graphState.findCourseByCode(requestedCode);

            if (existingEntry) {
              const [existingId, existingCourse] = existingEntry;
              if (existingCourse.include_in_graph === false) {
                graphState.restoreExistingCourse(existingId, {
                  x: nodeData.x,
                  y: nodeData.y,
                  category: data.category || existingCourse.category,
                });
                graphState.notify();
                callback(null);
                return true;
              }

              alert(
                `Error: The course ${requestedCode} is already on your graph!`,
              );
              callback(null);
              return false; // Tells ui_handler to KEEP THE MODAL OPEN
            }

            const canonicalId = requestedCode;
            callback(null);
            graphState.addCourse(canonicalId, {
              code: canonicalId,
              title: data.title,
              credits: data.credits,
              category: data.category,
              semesters_offered: data.semesters,
              status: "Unassigned",
              planned_semester: "Unassigned",
              include_in_graph: true,
            }, { x: nodeData.x, y: nodeData.y, includeInGraph: true });
            graphState.ensurePrereqNodes(canonicalId, nodeData.x, nodeData.y);
            graphState.connectCourseEdges(canonicalId);
            graphState.updateCourse(canonicalId, { category: data.category }, { notify: { dirty: false, views: false, sync: false } });
            window.coursePoolStore[canonicalId] = {
              detail: graphState.details[canonicalId],
              prereqs: [...graphState.prereqs[canonicalId]],
            };
            graphState.notify();

            return true; // Success! Close the modal.
          },
        });
      },

      editNode: function (nodeData, callback) {
        const dData = graphState.details[nodeData.id] || {};
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
              label: "Requirement Type",
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

            const codeExists = Object.entries(graphState.details).some(
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
            graphState.updateCourse(nodeData.id, {
              code: data.code.toUpperCase(),
              title: data.title,
              credits: data.credits,
              semesters_offered: data.semesters,
              category: data.category,
            });
            callback(null);

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

          graphState.removeCourse(nodeIdToDelete);
        });

        callback(null);
        graphState.notify();
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
        graphState.addPrereq(edgeData.from, edgeData.to);

        edgeData.id = `${edgeData.from}->${edgeData.to}`;
        edgeData.arrows = "to";
        edgeData.smooth = {
          enabled: true,
          type: "cubicBezier",
          forceDirection: "horizontal",
          roundness: 0.4,
        };

        callback(edgeData); // Adds to canvas

        graphState.notify();
      },

      deleteEdge: function (dataToDelete, callback) {
        if (!dataToDelete.edges || dataToDelete.edges.length === 0)
          return callback(null);

        // Loop through EVERY edge the user selected for deletion
        dataToDelete.edges.forEach((edgeId) => {
          const edgeObject = edges.get(edgeId);
          if (!edgeObject) return;

          // 1. Remove edge from local memory
          graphState.removePrereq(edgeObject.from, edgeObject.to);
        });

        callback(dataToDelete); // Removes all selected edges from canvas
        graphState.notify();
      },
    },
  };
}
