import { parseSemesterToColor } from "./utils.js";

export function initializeNodes(detailsData) {
  const nodes = new vis.DataSet();
  if (Object.keys(detailsData).length === 0) {
    console.warn(
      "detailsData is empty. The graph might not display any nodes."
    );
  }
  for (const courseId in detailsData) {
    if (detailsData.hasOwnProperty(courseId)) {
      const detail = detailsData[courseId];
      nodes.add({
        id: courseId,
        label: `${courseId}\n${detail.title || "Unknown Title"}\n(${
          detail.credits || "N/A"
        } credits)\n${detail.semesters_offered || "Unknown"}`,
        color: detail.color || parseSemesterToColor(detail.semesters_offered),
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
        x: detail.x,
        y: detail.y,
      });
    }
  }
  return nodes;
}

export function initializeEdges(prereqsData, nodes) {
  const edges = new vis.DataSet();
  for (const courseId in prereqsData) {
    if (prereqsData.hasOwnProperty(courseId)) {
      const prerequisites = prereqsData[courseId];
      if (Array.isArray(prerequisites)) {
        prerequisites.forEach((prereqId) => {
          if (nodes.get(prereqId) && nodes.get(courseId)) {
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
  return edges;
}
