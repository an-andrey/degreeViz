import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

function ensureBucketCourseData(requirements, detailsData) {
  if (!requirements?.buckets) return;
  requirements.buckets.forEach((bucket) => {
    bucket.courses = (bucket.courses || []).filter((id) => detailsData[id]);
  });
}

function parseProgramName(bucket = {}, index = 0) {
  const explicitName = bucket.program_name || bucket.program || bucket.major_name;
  if (explicitName) return String(explicitName);
  const bucketId = String(bucket.id || "");
  const normalized = bucketId
    .replace(/-(required|complementary|elective|program-prerequisites|core|courses).*$/i, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (normalized) {
    return normalized.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return `Program ${index + 1}`;
}

function getConstraintRegex(constraintText = "") {
  const text = String(constraintText).toLowerCase();
  const m = text.match(/(\d{3})\s*level\s*or\s*above/);
  if (!m) return null;
  const minLevel = Number(m[1]);
  return (courseCode = "") => {
    const codeMatch = String(courseCode).match(/(\d{3})/);
    return codeMatch ? Number(codeMatch[1]) >= minLevel : false;
  };
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

  window.syncCourseBucketAssignment = (courseId, category) => {
    if (!requirements?.buckets?.length || !courseId || !category) return;
    const normalized = String(category).toUpperCase();
    requirements.buckets.forEach((bucket) => {
      bucket.additional_courses = (bucket.additional_courses || []).filter((id) => id !== courseId);
    });
    const targetBucket = requirements.buckets.find((bucket) => String(bucket.category || "").toUpperCase() === normalized);
    if (!targetBucket) return;
    targetBucket.additional_courses = targetBucket.additional_courses || [];
    if (!targetBucket.additional_courses.includes(courseId) && !(targetBucket.courses || []).includes(courseId)) {
      targetBucket.additional_courses.push(courseId);
    }
  };

  function syncFlagsFromGraph() {
    const onGraph = new Set(nodes.getIds());
    Object.keys(detailsData).forEach((id) => {
      detailsData[id].include_in_graph = onGraph.has(id);
    });
  }

  function render() {
    syncFlagsFromGraph();
    list.innerHTML = "";
    const buckets = requirements.buckets || [];
    if (!buckets.length) {
      root.style.display = "none";
      return;
    }
    root.style.display = "block";

    const byProgram = {};
    buckets.forEach((b, idx) => {
      const program = parseProgramName(b, idx);
      byProgram[program] = byProgram[program] || [];
      byProgram[program].push(b);
    });

    Object.entries(byProgram).forEach(([program, programBuckets]) => {
      const group = document.createElement("details");
      group.className = "optional-program-group";
      group.open = true;
      group.innerHTML = `<summary>${program}</summary>`;

      programBuckets.forEach((bucket) => {
        bucket.additional_courses = bucket.additional_courses || [];

        const wrapper = document.createElement("details");
        wrapper.className = "optional-bucket";
        wrapper.open = true;

        const inGraphCredits = (bucket.courses || []).reduce((sum, id) => {
          const c = detailsData[id];
          return c && c.include_in_graph ? sum + (parseFloat(c.credits) || 0) : sum;
        }, 0);
        const levelCheck = getConstraintRegex(bucket.constraints_text);
        const additionalInGraphCredits = (bucket.additional_courses || []).reduce((sum, id) => {
          const c = detailsData[id];
          if (!c || !c.include_in_graph) return sum;
          if (levelCheck && !levelCheck(c.code || id)) return sum;
          return sum + (parseFloat(c.credits) || 0);
        }, 0);
        const requiredText = (Number(bucket.max_credits || 0) && Number(bucket.max_credits) !== Number(bucket.min_credits)) ? `${bucket.min_credits}-${bucket.max_credits}` : `${bucket.min_credits}`;

        wrapper.innerHTML = `<summary>${bucket.title}</summary><div class="optional-bucket-meta">${bucket.category} • Added ${inGraphCredits}/${requiredText} credits${additionalInGraphCredits ? ` • Additional counted: ${additionalInGraphCredits}` : ""}</div>${bucket.constraints_text ? `<div class="optional-rule-box">Rule: ${bucket.constraints_text}</div>` : ""}`;

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

        if ((bucket.additional_courses || []).length) {
          const extraHeader = document.createElement("div");
          extraHeader.className = "optional-bucket-meta";
          extraHeader.textContent = "Additional courses";
          wrapper.appendChild(extraHeader);
        }

        (bucket.additional_courses || []).forEach((courseId) => {
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

        group.appendChild(wrapper);
      });

      list.appendChild(group);
    });
  }

  network.on("add", render);
  network.on("remove", render);
  network.on("update", render);
  window.addEventListener("degreeviz:data-updated", render);

  render();
}
