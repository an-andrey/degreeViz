/*
 * optional_courses.js
 * Renders the course pool / requirement group sidebar.
 *
 * `programRequirements.buckets` describes required and complementary groups.
 * This module keeps group rows in sync with the visible graph, lets users add
 * or remove optional courses from the canvas, and maintains
 * `bucket.additional_courses` for courses users manually place in a bucket.
 *
 * Important: this file intentionally does NOT auto-detect flexible rules like
 * "COMP 500 level or above". For now, buckets are static unless the user edits
 * them or manually adds courses. That leaves room for a future pro/agentic
 * dynamic-group feature without quietly guessing today.
 */
import { openCustomPrompt } from "./ui_handler.js";

const ICONS = {
  edit: "/static/icons/pen.png",
  add: "/static/icons/add.png",
  delete: "/static/icons/delete.png",
};

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

function normalizedCode(value = "") {
  return String(value).toUpperCase().replace(/\s+/g, " ").trim();
}

function iconButton(kind, label, className = "icon-tool-btn") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<img src="${ICONS[kind]}" alt="" aria-hidden="true" />`;
  button.addEventListener("click", (event) => event.stopPropagation());
  return button;
}

function requiredCreditsText(bucket) {
  return String(bucket.min_credits ?? 0);
}

function bucketCredits(bucket, detailsData) {
  const courseIds = [...(bucket.courses || []), ...(bucket.additional_courses || [])];
  return courseIds.reduce((sum, id) => {
    const course = detailsData[id];
    return course && course.include_in_graph ? sum + (parseFloat(course.credits) || 0) : sum;
  }, 0);
}

function createCourseRow(courseId, detailsData, toggleCourseOnGraph, removableFromBucket) {
  const course = detailsData[courseId];
  if (!course) return null;
  const row = document.createElement("div");
  row.className = "optional-course-row";
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  row.setAttribute("aria-label", `Open ${course.code || courseId} details`);
  row.addEventListener("click", () => {
    if (typeof window.openCourseInspector === "function") {
      window.openCourseInspector(courseId);
    }
  });
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (typeof window.openCourseInspector === "function") {
        window.openCourseInspector(courseId);
      }
    }
  });
  const isOnGraph = !!course.include_in_graph;
  row.innerHTML = `<span><strong>${course.code || courseId}</strong> ${course.title} (${course.credits})${removableFromBucket ? " <em>(Added)</em>" : ""}</span>`;
  const button = document.createElement("button");
  button.textContent = isOnGraph ? "Remove" : "Add";
  button.className = isOnGraph ? "danger-btn" : "secondary-btn";
  button.onclick = (event) => {
    event.stopPropagation();
    toggleCourseOnGraph(courseId, isOnGraph);
  };
  row.appendChild(button);
  return row;
}

export function setupOptionalCoursesShelf(network, nodes, edges, graphState) {
  const detailsData = graphState.details;
  const requirements = graphState.requirements;
  const root = document.getElementById("optionalCourseShelf");
  const list = document.getElementById("optionalBucketList");
  if (!root || !list) return;

  ensureBucketCourseData(requirements, detailsData);

  window.syncCourseBucketAssignment = () => {};

  function syncFlagsFromGraph() {
    graphState.syncFlagsFromGraph();
  }

  function toggleCourseOnGraph(courseId, isOnGraph) {
    graphState.setCourseVisibility(courseId, !isOnGraph);
    graphState.notify();
    render();
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

      const programToolbar = document.createElement("div");
      programToolbar.className = "optional-program-toolbar";
      const newBucketBtn = document.createElement("button");
      newBucketBtn.type = "button";
      newBucketBtn.className = "secondary-btn bucket-create-btn";
      newBucketBtn.innerHTML = `<img src="${ICONS.add}" alt="" aria-hidden="true" /> New Group`;
      newBucketBtn.onclick = (event) => {
        event.stopPropagation();
        openCustomPrompt({
          title: "Create Custom Group",
          submitText: "Create Group",
          fields: [
            { id: "title", label: "Group Name", defaultValue: "Custom Requirement" },
            {
              id: "category",
              label: "Requirement Type",
              type: "select",
              options: ["COMPLEMENTARY", "CORE", "ELECTIVE"],
              defaultValue: "COMPLEMENTARY",
            },
            { id: "min_credits", label: "Required Credits", defaultValue: "0" },
          ],
          onSubmit: (data) => {
            const title = String(data.title || "Custom Requirement").trim();
            const bucketId = `custom-${Date.now()}`;
            requirements.buckets.push({
              id: bucketId,
              title,
              category: String(data.category || "COMPLEMENTARY").toUpperCase(),
              min_credits: Number.isFinite(Number(data.min_credits)) ? Number(data.min_credits) : 0,
              max_credits: null,
              courses: [],
              additional_courses: [],
              program_name: program,
              user_created: true,
            });
            graphState.notify();
            render();
            return true;
          },
        });
      };
      programToolbar.appendChild(newBucketBtn);

      const programSummary = document.createElement("summary");
      const programTitle = document.createElement("span");
      programTitle.className = "program-title";
      programTitle.textContent = program;
      programSummary.appendChild(programTitle);
      programSummary.appendChild(programToolbar);
      group.appendChild(programSummary);

      const programAdditional = [];
      const scrapedCourseIds = new Set();
      programBuckets.forEach((bucket) => {
        bucket.additional_courses = bucket.additional_courses || [];
        (bucket.courses || []).forEach((id) => scrapedCourseIds.add(id));
        bucket.additional_courses.forEach((id) => {
          if (!programAdditional.includes(id)) programAdditional.push(id);
        });

        const wrapper = document.createElement("details");
        wrapper.className = "optional-bucket";
        wrapper.open = true;

        const actions = document.createElement("div");
        actions.className = "optional-bucket-actions";
        const editButton = iconButton("edit", "Edit group");
        editButton.onclick = () => {
          openCustomPrompt({
            title: "Edit Group",
            submitText: "Save Group",
            fields: [
              { id: "title", label: "Group Title", defaultValue: bucket.title || "" },
              { id: "min_credits", label: "Required Credits", defaultValue: String(bucket.min_credits ?? 0) },
            ],
            onSubmit: (data) => {
              bucket.title = String(data.title || bucket.title || "").trim();
              bucket.min_credits = Number.isFinite(Number(data.min_credits)) ? Number(data.min_credits) : 0;
              bucket.max_credits = null;
              graphState.notify();
              render();
              return true;
            },
          });
        };
        const addToBucketBtn = iconButton("add", "Add course to group");
        addToBucketBtn.onclick = () => {
          openCustomPrompt({
            title: "Add Course to Group",
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
                graphState.addCourse(courseId, {
                  code: normalized,
                  title: data.title || `${normalized} (User Added)`,
                  credits: data.credits || "3",
                  semesters_offered: "Unknown",
                  category: bucket.category || "COMPLEMENTARY",
                  status: "Unassigned",
                  planned_semester: "Unassigned",
                  include_in_graph: false,
                }, { includeInGraph: false });
              }
              bucket.additional_courses = bucket.additional_courses || [];
              if (!bucket.additional_courses.includes(courseId) && !(bucket.courses || []).includes(courseId)) {
                bucket.additional_courses.push(courseId);
              }
              graphState.notify();
              render();
              return true;
            },
          });
        };
        const deleteBucketBtn = iconButton("delete", "Delete group", "icon-tool-btn danger-icon-tool-btn");
        deleteBucketBtn.onclick = () => {
          openCustomPrompt({
            title: "Delete Group",
            submitText: "Delete",
            fields: [
              { id: "confirm", label: `Type DELETE to remove '${bucket.title}'` },
            ],
            onSubmit: (data) => {
              if (String(data.confirm || "").trim().toUpperCase() !== "DELETE") return false;
              const idx = requirements.buckets.findIndex((b) => b.id === bucket.id);
              if (idx >= 0) requirements.buckets.splice(idx, 1);
              graphState.notify();
              render();
              return true;
            },
          });
        };
        actions.appendChild(editButton);
        actions.appendChild(addToBucketBtn);
        actions.appendChild(deleteBucketBtn);

        const totalAddedCredits = bucketCredits(bucket, detailsData);
        const requiredText = requiredCreditsText(bucket);

        const summary = document.createElement("summary");
        const title = document.createElement("span");
        title.className = "bucket-title";
        title.textContent = bucket.title;
        summary.appendChild(title);
        summary.appendChild(actions);

        const meta = document.createElement("div");
        meta.className = "optional-bucket-meta";
        meta.textContent = `${bucket.category} • Added ${totalAddedCredits}/${requiredText} credits`;

        wrapper.appendChild(summary);
        wrapper.appendChild(meta);

        (bucket.courses || []).forEach((courseId) => {
          const row = createCourseRow(courseId, detailsData, toggleCourseOnGraph, false);
          if (row) wrapper.appendChild(row);
        });

        (bucket.additional_courses || []).forEach((courseId) => {
          const row = createCourseRow(courseId, detailsData, toggleCourseOnGraph, true);
          if (row) wrapper.appendChild(row);
        });

        group.appendChild(wrapper);
      });

      const extraBucket = document.createElement("details");
      extraBucket.className = "optional-bucket";
      extraBucket.open = true;
      extraBucket.innerHTML = `<summary>Additional User Courses</summary>`;
      let extraCourseCount = 0;
      programAdditional
        .filter((courseId) => !scrapedCourseIds.has(courseId))
        .forEach((courseId) => {
        const row = createCourseRow(courseId, detailsData, toggleCourseOnGraph, false);
        if (row) {
          extraBucket.appendChild(row);
          extraCourseCount += 1;
        }
      });
      if (extraCourseCount) group.appendChild(extraBucket);



      list.appendChild(group);
    });
  }

  network.on("add", render);
  network.on("remove", render);
  network.on("update", render);
  window.addEventListener("degreeviz:data-updated", render);

  render();
}
