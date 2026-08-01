/*
 * graph_state.js
 * Central browser-side graph state controller.
 *
 * After `graph.html` loads, this object is the main source of truth for the
 * editable plan. UI modules call actions here instead of each manually
 * mutating globals, refreshing derived views, marking dirty, and syncing
 * Flask session state.
 */
import { updateGpaTracker } from "./gpa_tracker.js";
import {
  generateNodeLabel,
  getCategoryShape,
  getCategoryShapeProperties,
  getStatusColor,
} from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

const SESSION_SYNC_DELAY_MS = 600;

function normalizedCode(value = "") {
  return String(value).toUpperCase().replace(/\s+/g, " ").trim();
}

function readCreditRequirements() {
  return {
    core: parseFloat(document.getElementById("req-core")?.value) || 0,
    comp: parseFloat(document.getElementById("req-comp")?.value) || 0,
    elec: parseFloat(document.getElementById("req-elec")?.value) || 0,
  };
}

function buildNode(courseId, course, x, y) {
  return {
    id: courseId,
    x,
    y,
    label: generateNodeLabel(
      course.code || courseId,
      course.title,
      course.credits,
      course.planned_semester,
    ),
    color: getStatusColor(course.status || "Unassigned"),
    shape: getCategoryShape(course.category),
    shapeProperties: getCategoryShapeProperties(course.category),
    title: `${course.code || courseId}
${course.title}
Requirement type: ${course.category || "CORE"}
Progress: ${course.status || "Unassigned"}
Planned term: ${course.planned_semester || "Unassigned"}
Offered: ${course.semesters_offered || "Unknown"}`,
  };
}

function buildEdge(from, to) {
  return {
    id: `${from}->${to}`,
    from,
    to,
    arrows: "to",
    smooth: {
      enabled: true,
      type: "cubicBezier",
      forceDirection: "horizontal",
      roundness: 0.4,
    },
  };
}

export function createGraphState({
  details,
  prereqs,
  requirements,
  markDirty,
}) {
  let network = null;
  let nodes = null;
  let edges = null;
  let performWithoutHistory = (action) => action();
  let sessionSyncTimer = null;

  const state = {
    details,
    prereqs,
    requirements: requirements || { buckets: [] },
  };

  function setNetworkContext(context) {
    network = context.network;
    nodes = context.nodes;
    edges = context.edges;
    performWithoutHistory = context.performWithoutHistory || performWithoutHistory;
  }

  function notify({ dirty = true, views = true, sync = true } = {}) {
    if (dirty && typeof markDirty === "function") markDirty();
    if (views) {
      updateSheetView(state.details, state.requirements);
      updateGpaTracker(state.details);
      window.dispatchEvent(new Event("degreeviz:data-updated"));
    }
    if (sync) scheduleSessionSync();
  }

  function scheduleSessionSync() {
    if (sessionSyncTimer) clearTimeout(sessionSyncTimer);
    sessionSyncTimer = setTimeout(syncSessionNow, SESSION_SYNC_DELAY_MS);
  }

  async function syncSessionNow() {
    sessionSyncTimer = null;
    try {
      await fetch("/sync_graph_session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          details_data: state.details,
          prereqs_data: state.prereqs,
          program_requirements: state.requirements,
          credit_requirements: readCreditRequirements(),
        }),
      });
    } catch (error) {
      console.error("Graph session sync failed:", error);
    }
  }

  function updateNodeVisual(courseId) {
    if (!nodes || !nodes.get(courseId) || !state.details[courseId]) return;
    const course = state.details[courseId];
    performWithoutHistory(() => {
      nodes.update({
        id: courseId,
        label: generateNodeLabel(
          course.code || courseId,
          course.title,
          course.credits,
          course.planned_semester,
        ),
        color: getStatusColor(course.status || "Unassigned"),
        shape: getCategoryShape(course.category),
        shapeProperties: getCategoryShapeProperties(course.category),
        title: `${course.code || courseId}
${course.title}
Requirement type: ${course.category || "CORE"}
Progress: ${course.status || "Unassigned"}
Planned term: ${course.planned_semester || "Unassigned"}
Offered: ${course.semesters_offered || "Unknown"}`,
      });
    });
  }

  function addNodeFromDetails(courseId, fallbackX = 0, fallbackY = 0, forceFallbackPosition = false) {
    if (!nodes || nodes.get(courseId) || !state.details[courseId]) return;
    const course = state.details[courseId];
    const x = forceFallbackPosition ? fallbackX : (course.x ?? fallbackX);
    const y = forceFallbackPosition ? fallbackY : (course.y ?? fallbackY);
    course.x = x;
    course.y = y;
    course.include_in_graph = true;
    nodes.add(buildNode(courseId, course, x, y));
  }

  function connectCourseEdges(courseId) {
    if (!nodes || !edges) return;
    const newEdges = [];
    (state.prereqs[courseId] || []).forEach((fromNode) => {
      if (nodes.get(fromNode)) newEdges.push(buildEdge(fromNode, courseId));
    });
    Object.entries(state.prereqs).forEach(([toNode, reqs]) => {
      if (Array.isArray(reqs) && reqs.includes(courseId) && nodes.get(toNode)) {
        newEdges.push(buildEdge(courseId, toNode));
      }
    });
    if (newEdges.length) edges.update(newEdges);
  }

  function ensurePrereqNodes(courseId, originX = 0, originY = 0) {
    const coursePrereqs = Array.isArray(state.prereqs[courseId]) ? state.prereqs[courseId] : [];
    coursePrereqs.forEach((prereqId, index) => {
      if (state.details[prereqId] && !nodes.get(prereqId)) {
        addNodeFromDetails(prereqId, originX - 220, originY + index * 120);
      }
    });
  }

  function addCourse(courseId, detail, { x = 0, y = 0, includeInGraph = true } = {}) {
    state.details[courseId] = {
      status: "Unassigned",
      planned_semester: "Unassigned",
      include_in_graph: includeInGraph,
      ...detail,
      x,
      y,
    };
    if (!Array.isArray(state.prereqs[courseId])) state.prereqs[courseId] = [];
    if (includeInGraph) addNodeFromDetails(courseId, x, y, true);
  }

  function restoreExistingCourse(courseId, { x = 0, y = 0, category } = {}) {
    const course = state.details[courseId];
    if (!course) return;
    if (category) course.category = category;
    addCourseToAdditionalBucket(courseId, course.category);
    addNodeFromDetails(courseId, x, y, true);
    ensurePrereqNodes(courseId, x, y);
    connectCourseEdges(courseId);
  }

  function updateCourse(courseId, patch, options = {}) {
    if (!state.details[courseId]) return;
    const previousCategory = state.details[courseId].category;
    Object.assign(state.details[courseId], patch);
    if (patch.category && patch.category !== previousCategory && options.syncBucket !== false) {
      addCourseToAdditionalBucket(courseId, patch.category);
    }
    updateNodeVisual(courseId);
    notify(options.notify);
  }

  function removeCourse(courseId) {
    delete state.details[courseId];
    delete state.prereqs[courseId];
    Object.keys(state.prereqs).forEach((toNode) => {
      state.prereqs[toNode] = (state.prereqs[toNode] || []).filter((fromNode) => fromNode !== courseId);
    });
    if (nodes?.get(courseId)) nodes.remove(courseId);
  }

  function addPrereq(fromNode, toNode) {
    if (!state.prereqs[toNode]) state.prereqs[toNode] = [];
    if (!state.prereqs[toNode].includes(fromNode)) state.prereqs[toNode].push(fromNode);
  }

  function removePrereq(fromNode, toNode) {
    if (!state.prereqs[toNode]) return;
    state.prereqs[toNode] = state.prereqs[toNode].filter((id) => id !== fromNode);
  }

  function setCourseVisibility(courseId, visible, position = {}) {
    const course = state.details[courseId];
    if (!course) return;
    course.include_in_graph = visible;
    if (visible && course.category === "CORE" && (!course.status || course.status === "Unassigned")) {
      course.status = "TO TAKE";
    }
    if (visible) {
      addNodeFromDetails(courseId, position.x ?? course.x ?? 0, position.y ?? course.y ?? 0, !!position.force);
      connectCourseEdges(courseId);
    } else if (nodes?.get(courseId)) {
      nodes.remove(courseId);
    }
  }

  function syncFlagsFromGraph() {
    if (!nodes) return;
    const visibleIds = new Set(nodes.getIds());
    Object.keys(state.details).forEach((id) => {
      state.details[id].include_in_graph = visibleIds.has(id);
    });
  }

  function storeVisiblePositions() {
    if (!network || !nodes) return;
    network.storePositions();
    nodes.get().forEach((node) => {
      if (state.details[node.id]) {
        state.details[node.id].x = node.x;
        state.details[node.id].y = node.y;
      }
    });
  }

  function findCourseByCode(code) {
    const requestedCode = normalizedCode(code);
    return Object.entries(state.details).find(([key, course]) => {
      const existingCode = normalizedCode(course.code || key);
      return existingCode === requestedCode;
    });
  }

  function addCourseToAdditionalBucket(courseId, category) {
    if (typeof window.syncCourseBucketAssignment === "function") {
      window.syncCourseBucketAssignment(courseId, category);
    }
  }

  function mergeProgramData(newDetails = {}, newPrereqs = {}, newRequirements = {}) {
    Object.entries(newDetails).forEach(([code, detail]) => {
      if (!state.details[code]) state.details[code] = detail;
    });
    Object.entries(newPrereqs).forEach(([code, prereqList]) => {
      if (!Array.isArray(state.prereqs[code])) state.prereqs[code] = [];
      (prereqList || []).forEach((prereqId) => {
        if (!state.prereqs[code].includes(prereqId)) state.prereqs[code].push(prereqId);
      });
    });
    if (newRequirements?.buckets) {
      state.requirements.buckets = state.requirements.buckets || [];
      const existingBucketIds = new Set(state.requirements.buckets.map((bucket) => bucket.id));
      newRequirements.buckets.forEach((bucket) => {
        if (!existingBucketIds.has(bucket.id)) {
          state.requirements.buckets.push(bucket);
          existingBucketIds.add(bucket.id);
        }
      });
    }
    window.programRequirements = state.requirements;
  }

  return {
    details: state.details,
    prereqs: state.prereqs,
    requirements: state.requirements,
    addCourse,
    addNodeFromDetails,
    addPrereq,
    buildEdge,
    connectCourseEdges,
    ensurePrereqNodes,
    findCourseByCode,
    mergeProgramData,
    notify,
    normalizedCode,
    readCreditRequirements,
    removeCourse,
    removePrereq,
    restoreExistingCourse,
    setCourseVisibility,
    setNetworkContext,
    storeVisiblePositions,
    syncFlagsFromGraph,
    syncSessionNow,
    updateCourse,
  };
}
