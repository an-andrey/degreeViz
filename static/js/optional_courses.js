import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

function ensureBucketCourseData(requirements, detailsData) {
  if (!requirements?.buckets) return;
  requirements.buckets.forEach((bucket) => {
    bucket.courses = (bucket.courses || []).filter((id) => detailsData[id]);
  });
}

function renderCourse(network, nodes, edges, detailsData, prereqsData, courseId) {
  if (nodes.get(courseId) || !detailsData[courseId]) return;
  const d = detailsData[courseId];
  nodes.add({
    id: courseId,
    x: d.x ?? 0,
    y: d.y ?? 0,
    label: generateNodeLabel(d.code || courseId, d.title, d.credits, d.semesters_offered, d.category, d.planned_semester, d.status),
    color: getStatusColor(d.status),
  });
  d.include_in_graph = true;

  const newEdges = [];
  (prereqsData[courseId] || []).forEach((fromNode) => {
    if (nodes.get(fromNode)) newEdges.push({ from: fromNode, to: courseId, arrows: "to" });
  });
  Object.entries(prereqsData).forEach(([toNode, reqs]) => {
    if (Array.isArray(reqs) && reqs.includes(courseId) && nodes.get(toNode)) {
      newEdges.push({ from: courseId, to: toNode, arrows: "to" });
    }
  });
  if (newEdges.length) edges.update(newEdges);
}

export function setupOptionalCoursesShelf(network, nodes, edges, detailsData, prereqsData, markGraphDirty) {
  const root = document.getElementById("optionalCourseShelf");
  const list = document.getElementById("optionalBucketList");
  if (!root || !list) return;

  const requirements = window.programRequirements || { buckets: [] };
  ensureBucketCourseData(requirements, detailsData);

  // initial state: keep only required/core courses on graph
  Object.entries(detailsData).forEach(([id, c]) => {
    if (c.include_in_graph === false && nodes.get(id)) nodes.remove(id);
  });

  function render() {
    list.innerHTML = "";
    const buckets = requirements.buckets || [];
    if (!buckets.length) {
      root.style.display = "none";
      return;
    }
    root.style.display = "block";

    buckets.forEach((bucket) => {
      if ((bucket.category || "CORE") === "CORE" && Number(bucket.max_credits || 0) === 0) {
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.className = "optional-bucket";
      const inGraphCredits = (bucket.courses || []).reduce((sum, id) => {
        const c = detailsData[id];
        return c && c.include_in_graph ? sum + (parseFloat(c.credits) || 0) : sum;
      }, 0);
      wrapper.innerHTML = `<h5>${bucket.title}</h5><div class="optional-bucket-meta">${bucket.category} • Added ${inGraphCredits}/${bucket.min_credits}${bucket.max_credits ? `-${bucket.max_credits}` : ""} credits</div>${bucket.constraints_text ? `<div class="optional-rule-box">Rule: ${bucket.constraints_text}</div>` : ""}`;

      (bucket.courses || []).forEach((courseId) => {
        const c = detailsData[courseId];
        if (!c) return;
        const row = document.createElement("div");
        row.className = "optional-course-row";
        const isOnGraph = !!c.include_in_graph;
        row.innerHTML = `<span><strong>${c.code || courseId}</strong> ${c.title} (${c.credits})</span>`;
        const btn = document.createElement("button");
        btn.textContent = isOnGraph ? "Remove" : "Add";
        btn.className = isOnGraph ? "danger-btn" : "secondary-btn";
        btn.onclick = () => {
          if (isOnGraph) {
            c.include_in_graph = false;
            if (nodes.get(courseId)) nodes.remove(courseId);
          } else {
            renderCourse(network, nodes, edges, detailsData, prereqsData, courseId);
          }
          markGraphDirty();
          updateSheetView(detailsData, requirements);
          render();
        };
        row.appendChild(btn);
        wrapper.appendChild(row);
      });

      list.appendChild(wrapper);
    });
  }

  render();
}
