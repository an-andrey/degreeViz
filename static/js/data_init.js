/*
 * data_init.js
 * Converts Flask's JSON graph data into vis-network DataSets.
 *
 * `applySmartLayout` computes initial x/y coordinates from prerequisite
 * depth when a course does not already have saved coordinates. It mutates
 * `detailsData` directly so later saves can persist the generated layout.
 * `initializeNodes` skips courses marked `include_in_graph === false`, while
 * `initializeEdges` draws only prerequisite edges whose endpoints are visible.
 */
import {
  generateNodeLabel,
  getCategoryShape,
  getCategoryShapeProperties,
  getStatusColor,
} from "./node_utils.js";

function applySmartLayout(detailsData, prereqsData) {
  const levels = {};
  const adjList = {};

  // 1. Initialize data structures
  Object.keys(detailsData).forEach((nodeId) => {
    levels[nodeId] = 0;
    adjList[nodeId] = [];
  });

  // 2. Build Adjacency List (From Prerequisite -> To Course)
  if (prereqsData) {
    Object.keys(prereqsData).forEach((toNode) => {
      const reqs = prereqsData[toNode];
      if (Array.isArray(reqs)) {
        reqs.forEach((fromNode) => {
          if (detailsData[fromNode] && detailsData[toNode]) {
            adjList[fromNode].push(toNode);
          }
        });
      }
    });
  }

  // 3. Calculate "Depth" (Courses with no prereqs = Level 0)
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 100) {
    changed = false;
    iterations++;
    Object.keys(adjList).forEach((u) => {
      adjList[u].forEach((v) => {
        if (levels[v] < levels[u] + 1) {
          levels[v] = levels[u] + 1;
          changed = true;
        }
      });
    });
  }

  // 4. Group courses by their Level
  const levelGroups = {};
  let maxLevel = 0;
  Object.keys(detailsData).forEach((nodeId) => {
    const lvl = levels[nodeId];
    if (!levelGroups[lvl]) levelGroups[lvl] = [];
    levelGroups[lvl].push(nodeId);
    if (lvl > maxLevel) maxLevel = lvl;
  });

  // 5. Assign Coordinates and force wrapping!
  const X_SPACING = 220; // Horizontal distance between prerequisite levels
  const Y_SPACING = 95; // Vertical distance between courses in the same level
  const MAX_PER_COLUMN = 8; // Wrap only when a level is genuinely crowded

  let currentX = 0;

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const nodesInLevel = levelGroups[lvl] || [];
    if (nodesInLevel.length === 0) continue;

    // Calculate how many sub-columns this level needs
    const numSubColumns = Math.ceil(nodesInLevel.length / MAX_PER_COLUMN);

    for (let i = 0; i < nodesInLevel.length; i++) {
      const nodeId = nodesInLevel[i];
      const course = detailsData[nodeId];

      const subColumnIndex = Math.floor(i / MAX_PER_COLUMN);
      const positionInColumn = i % MAX_PER_COLUMN;

      const xOffset = currentX + subColumnIndex * X_SPACING;

      // Center the column vertically
      const totalInThisColumn = Math.min(
        MAX_PER_COLUMN,
        nodesInLevel.length - subColumnIndex * MAX_PER_COLUMN,
      );
      const startY = -((totalInThisColumn - 1) * Y_SPACING) / 2;

      // Only assign coordinates if they don't already exist from the database
      if (course.x === undefined || course.x === null) {
        course.x = xOffset;
        course.y = startY + positionInColumn * Y_SPACING;
      }
    }

    // Move the X coordinate over so the next level doesn't overlap
    currentX += numSubColumns * X_SPACING;
  }
}

// --- UPDATED initializeNodes function ---
export function initializeNodes(detailsData, prereqsData) {
  const nodesArray = [];

  // 1. Run our smart layout before doing anything else!
  if (prereqsData) {
    applySmartLayout(detailsData, prereqsData);
  }

  // 2. Build the nodes using the newly calculated X and Y coordinates
  Object.keys(detailsData).forEach((nodeId) => {
    const course = detailsData[nodeId];
    if (course.include_in_graph === false) return;

    nodesArray.push({
      id: nodeId,
      x: course.x, // Inject our custom X
      y: course.y, // Inject our custom Y
      label: generateNodeLabel(
        course.code || nodeId,
        course.title,
        course.credits,
        course.planned_semester,
      ),
      color: getStatusColor(course.status),
      shape: getCategoryShape(course.category),
      shapeProperties: getCategoryShapeProperties(course.category),
      title: `${course.code || nodeId}
${course.title}
Requirement type: ${course.category || "CORE"}
Progress: ${course.status || "Unassigned"}
Planned term: ${course.planned_semester || "Unassigned"}
Offered: ${course.semesters_offered || "Unknown"}`,
    });
  });

  return new vis.DataSet(nodesArray);
}

export function initializeEdges(prereqsData, nodes) {
  const edgesArray = [];
  Object.keys(prereqsData).forEach((toNode) => {
    const reqs = prereqsData[toNode];
    if (Array.isArray(reqs)) {
      reqs.forEach((fromNode) => {
        // Only draw the edge if both nodes actually exist on the canvas
          if (nodes.get(fromNode) && nodes.get(toNode)) {
            edgesArray.push({
              id: `${fromNode}->${toNode}`,
              from: fromNode,
              to: toNode,
            arrows: "to",
            smooth: {
              enabled: true,
              type: "cubicBezier",
              forceDirection: "horizontal",
              roundness: 0.4,
            },
          });
        }
      });
    }
  });
  return new vis.DataSet(edgesArray);
}
