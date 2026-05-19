import { generateNodeLabel, getStatusColor } from "./node_utils.js";

function isOptionalCourse(course) {
  const cat = (course.category || "").toUpperCase();
  const title = (course.requirement_bucket_title || "").toLowerCase();
  const min = Number(course.requirement_min_credits || 0);
  const max = Number(course.requirement_max_credits || 0);

  if (cat === "COMPLEMENTARY" || cat === "ELECTIVE") return true;
  if (max > min && min > 0) return true;
  return title.includes("choose") || title.includes("selected") || title.includes("complementary") || title.includes("elective");
}

export function setupOptionalCoursesShelf(network, nodes, edges, detailsData, prereqsData, markGraphDirty) {
  const listEl = document.getElementById("optionalCourseList");
  const countEl = document.getElementById("optionalCount");
  if (!listEl || !countEl) return;

  const hiddenOptionalIds = new Set();

  function syncCount() {
    countEl.textContent = `${hiddenOptionalIds.size} optional courses hidden`;
  }

  function restoreEdgesForCourse(courseId) {
    const edgeUpdates = [];
    const reqs = prereqsData[courseId] || [];
    reqs.forEach((fromNode) => {
      if (nodes.get(fromNode) && nodes.get(courseId)) {
        edgeUpdates.push({ from: fromNode, to: courseId, arrows: "to" });
      }
    });

    Object.keys(prereqsData).forEach((toNode) => {
      const toReqs = prereqsData[toNode] || [];
      if (toReqs.includes(courseId) && nodes.get(toNode) && nodes.get(courseId)) {
        edgeUpdates.push({ from: courseId, to: toNode, arrows: "to" });
      }
    });

    if (edgeUpdates.length) edges.update(edgeUpdates);
  }

  function renderOptionalList() {
    listEl.innerHTML = "";
    [...hiddenOptionalIds].sort().forEach((courseId) => {
      const course = detailsData[courseId];
      if (!course) return;

      const item = document.createElement("div");
      item.className = "optional-course-item";
      item.innerHTML = `<div><strong>${course.code || courseId}</strong><br><small>${course.title || "Untitled"}</small></div>`;

      const addBtn = document.createElement("button");
      addBtn.textContent = "Add";
      addBtn.onclick = () => {
        const d = detailsData[courseId];
        nodes.add({
          id: courseId,
          x: d.x ?? 0,
          y: d.y ?? 0,
          label: generateNodeLabel(
            d.code || courseId,
            d.title,
            d.credits,
            d.semesters_offered,
            d.category,
            d.planned_semester,
            d.status,
          ),
          color: getStatusColor(d.status),
        });
        restoreEdgesForCourse(courseId);
        hiddenOptionalIds.delete(courseId);
        renderOptionalList();
        markGraphDirty();
      };

      item.appendChild(addBtn);
      listEl.appendChild(item);
    });

    syncCount();
  }

  Object.keys(detailsData).forEach((courseId) => {
    const course = detailsData[courseId];
    if (!course || !isOptionalCourse(course)) return;
    if (!nodes.get(courseId)) return;

    hiddenOptionalIds.add(courseId);
    nodes.remove(courseId);
  });

  renderOptionalList();

  const hideBtn = document.getElementById("hideSelectedOptionalBtn");
  if (hideBtn) {
    hideBtn.onclick = () => {
      const selected = network.getSelectedNodes();
      selected.forEach((courseId) => {
        const course = detailsData[courseId];
        if (course && isOptionalCourse(course)) {
          hiddenOptionalIds.add(courseId);
          nodes.remove(courseId);
        }
      });
      renderOptionalList();
      markGraphDirty();
    };
  }
}
