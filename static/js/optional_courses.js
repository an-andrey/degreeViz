import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";
import { openCustomPrompt } from "./ui_handler.js";

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

function parseConstraintHints(constraintText = "") {
  const text = String(constraintText || "").toUpperCase();
  const prefixes = Array.from(new Set((text.match(/\b[A-Z]{4}\b/g) || [])));
  const levelRegex = getConstraintRegex(constraintText);
  const excludedCourses = Array.from(new Set((text.match(/\b[A-Z]{4}\s?\d{3}[A-Z0-9]?\b/g) || []))).map((c) => c.replace(/\s+/, " "));
  return { prefixes, levelRegex, excludedCourses };
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

function normalizedCode(value = "") {
  return String(value).toUpperCase().replace(/\s+/g, " ").trim();
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
    const course = detailsData[courseId] || {};
    const courseCode = normalizedCode(course.code || courseId || "");
    const isScrapedCourse = requirements.buckets.some((bucket) => (bucket.courses || []).includes(courseId));
    if (isScrapedCourse) {
      console.log("[degreeviz][bucket-sync] scraped-course, skip additional assignment", { courseId, courseCode });
      return;
    }
    const coursePrefix = courseCode.split(" ")[0] || "";
    const matchingBuckets = requirements.buckets.filter((bucket) => String(bucket.category || "").toUpperCase() === normalized);
    console.log("[degreeviz][bucket-sync] start", {
      courseId,
      courseCode,
      category: normalized,
      matchingBucketCount: matchingBuckets.length,
    });
    const candidateBuckets = matchingBuckets.map((bucket) => {
      const { prefixes, levelRegex, excludedCourses } = parseConstraintHints(bucket.constraints_text);
      const hasConstraint = !!bucket.constraints_text;
      const excluded = excludedCourses.includes(courseCode);
      const prefixOk = !prefixes.length || prefixes.includes(coursePrefix);
      const levelOk = !levelRegex || levelRegex(courseCode);
      const passes = !excluded && prefixOk && levelOk;
      const score = [hasConstraint ? 1 : 0, prefixes.length ? 1 : 0, levelRegex ? 1 : 0].reduce((a, b) => a + b, 0);
      console.log("[degreeviz][bucket-sync] evaluate", {
        bucketId: bucket.id,
        title: bucket.title,
        prefixes,
        excludedCourses,
        excluded,
        coursePrefix,
        prefixOk,
        hasLevelRule: !!levelRegex,
        levelOk,
        passes,
        score,
        constraint: bucket.constraints_text,
      });
      return { bucket, passes, score, hasConstraint };
    });

    const passing = candidateBuckets.filter((c) => c.passes);
    passing.sort((a, b) => b.score - a.score);
    const targetBucket = (passing[0] && passing[0].bucket)
      || (candidateBuckets.find((c) => !c.hasConstraint) || {}).bucket
      || matchingBuckets[0];
    if (!targetBucket) return;
    targetBucket.additional_courses = targetBucket.additional_courses || [];
    if (!targetBucket.additional_courses.includes(courseId) && !(targetBucket.courses || []).includes(courseId)) {
      targetBucket.additional_courses.push(courseId);
    }
    console.log("[degreeviz][bucket-sync] assigned", {
      courseId,
      targetBucketId: targetBucket.id,
      targetBucketTitle: targetBucket.title,
      additionalCourses: targetBucket.additional_courses,
    });
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

      const programAdditional = [];
      const ruleAssignedAdditional = new Set();
      const scrapedCourseIds = new Set();
      programBuckets.forEach((bucket) => {
        bucket.additional_courses = bucket.additional_courses || [];
        (bucket.courses || []).forEach((id) => scrapedCourseIds.add(id));
        bucket.additional_courses.forEach((id) => {
          if (!programAdditional.includes(id)) programAdditional.push(id);
          if (bucket.constraints_text) ruleAssignedAdditional.add(id);
        });

        const wrapper = document.createElement("details");
        wrapper.className = "optional-bucket";
        wrapper.open = true;

        const actions = document.createElement("div");
        actions.className = "optional-bucket-actions";
        const editBucketBtn = document.createElement("button");
        editBucketBtn.className = "secondary-btn";
        editBucketBtn.title = "Edit bucket";
        editBucketBtn.textContent = "✏️";
        editBucketBtn.onclick = () => {
          openCustomPrompt({
            title: "Edit Bucket",
            submitText: "Save Bucket",
            fields: [
              { id: "title", label: "Bucket Title", defaultValue: bucket.title || "" },
              { id: "min_credits", label: "Min Credits", defaultValue: String(bucket.min_credits ?? 0) },
              { id: "max_credits", label: "Max Credits (optional)", defaultValue: bucket.max_credits == null ? "" : String(bucket.max_credits) },
            ],
            onSubmit: (data) => {
              bucket.title = String(data.title || bucket.title || "").trim();
              bucket.min_credits = Number.isFinite(Number(data.min_credits)) ? Number(data.min_credits) : 0;
              bucket.max_credits = String(data.max_credits || "").trim() === "" ? null : Number(data.max_credits);
              markGraphDirty();
              updateSheetView(detailsData, requirements);
              render();
              return true;
            },
          });
        };
        const addToBucketBtn = document.createElement("button");
        addToBucketBtn.className = "secondary-btn";
        addToBucketBtn.title = "Add course to bucket";
        addToBucketBtn.textContent = "➕";
        addToBucketBtn.onclick = () => {
          openCustomPrompt({
            title: "Add Course to Bucket",
            submitText: "Add Course",
            fields: [
              { id: "code", label: "Course Code", type: "course_search", required: true },
              { id: "title", label: "Course Title (optional)" },
              { id: "credits", label: "Credits", defaultValue: "3" },
            ],
            onSubmit: (data) => {
              const normalized = normalizedCode(data.code || "");
              if (!normalized) return false;
              const existingId = Object.keys(detailsData).find((id) => normalizedCode(detailsData[id]?.code || id) === normalized);
              const courseId = existingId || normalized;
              if (!detailsData[courseId]) {
                detailsData[courseId] = {
                  code: normalized,
                  title: data.title || `${normalized} (User Added)`,
                  credits: data.credits || "3",
                  semesters_offered: "Unknown",
                  category: bucket.category || "COMPLEMENTARY",
                  status: "Unassigned",
                  planned_semester: "Unassigned",
                  include_in_graph: false,
                };
                prereqsData[courseId] = prereqsData[courseId] || [];
              }
              bucket.additional_courses = bucket.additional_courses || [];
              if (!bucket.additional_courses.includes(courseId) && !(bucket.courses || []).includes(courseId)) {
                bucket.additional_courses.push(courseId);
              }
              markGraphDirty();
              updateSheetView(detailsData, requirements);
              render();
              return true;
            },
          });
        };
        const deleteBucketBtn = document.createElement("button");
        deleteBucketBtn.className = "danger-btn";
        deleteBucketBtn.title = "Delete bucket";
        deleteBucketBtn.textContent = "🗑️";
        deleteBucketBtn.onclick = () => {
          openCustomPrompt({
            title: "Delete Bucket",
            submitText: "Delete",
            fields: [
              { id: "confirm", label: `Type DELETE to remove '${bucket.title}'` },
            ],
            onSubmit: (data) => {
              if (String(data.confirm || "").trim().toUpperCase() !== "DELETE") return false;
              const idx = requirements.buckets.findIndex((b) => b.id === bucket.id);
              if (idx >= 0) requirements.buckets.splice(idx, 1);
              markGraphDirty();
              updateSheetView(detailsData, requirements);
              render();
              return true;
            },
          });
        };
        actions.appendChild(editBucketBtn);
        actions.appendChild(addToBucketBtn);
        actions.appendChild(deleteBucketBtn);

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
        if (bucket.constraints_text) {
          console.log("[degreeviz][rule-credits]", {
            bucketId: bucket.id,
            title: bucket.title,
            constraint: bucket.constraints_text,
            additionalCourses: bucket.additional_courses,
            additionalInGraphCredits,
          });
        }
        const totalAddedCredits = inGraphCredits + additionalInGraphCredits;
        const requiredText = (Number(bucket.max_credits || 0) && Number(bucket.max_credits) !== Number(bucket.min_credits)) ? `${bucket.min_credits}-${bucket.max_credits}` : `${bucket.min_credits}`;
        const showRule = false;

        wrapper.innerHTML = `<summary>${bucket.title}</summary><div class="optional-bucket-meta">${bucket.category} • Added ${totalAddedCredits}/${requiredText} credits</div>${showRule ? `<div class="optional-rule-box">Rule: ${bucket.constraints_text}</div>` : ""}`;
        wrapper.appendChild(actions);

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

        (bucket.additional_courses || []).forEach((courseId) => {
          const c = detailsData[courseId];
          if (!c) return;
          const row = document.createElement("div");
          row.className = "optional-course-row";
          const isOnGraph = !!c.include_in_graph;
          row.innerHTML = `<span><strong>${c.code || courseId}</strong> ${c.title} (${c.credits}) <em>(Added)</em></span>`;
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

      const extraBucket = document.createElement("details");
      extraBucket.className = "optional-bucket";
      extraBucket.open = true;
      extraBucket.innerHTML = `<summary>Additional User Courses</summary>`;
      programAdditional
        .filter((courseId) => !scrapedCourseIds.has(courseId) && !ruleAssignedAdditional.has(courseId))
        .forEach((courseId) => {
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
        extraBucket.appendChild(row);
      });
      group.appendChild(extraBucket);



      list.appendChild(group);
    });
  }

  network.on("add", render);
  network.on("remove", render);
  network.on("update", render);
  window.addEventListener("degreeviz:data-updated", render);

  render();
}
