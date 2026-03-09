import { generateNodeLabel, getStatusColor } from "./node_utils.js";

export function initializeNodes(detailsData) {
  const nodesArray = [];

  Object.keys(detailsData).forEach((nodeId) => {
    const course = detailsData[nodeId];

    if (!course.code) course.code = nodeId; // Fallback to ID for default courses
    if (!course.category || course.category === "undefined")
      course.category = "CORE";
    if (!course.status || course.status === "undefined")
      course.status = "Unassigned";
    if (!course.planned_semester || course.planned_semester === "undefined")
      course.planned_semester = "Unassigned";
    if (!course.credits) course.credits = "3";

    // 2. BUILD THE NODE USING THE SINGLE SOURCE OF TRUTH
    nodesArray.push({
      id: nodeId,
      x: course.x,
      y: course.y,
      label: generateNodeLabel(
        course.code,
        course.title,
        course.credits,
        course.semesters_offered,
        course.category,
        course.planned_semester,
      ),
      color: getStatusColor(course.status), // Overrides Python's hardcoded colors!
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
