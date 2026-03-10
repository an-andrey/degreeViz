export function setupHomeLinkHandler() {
  const homeLink = document.getElementById("homeLink");
  if (homeLink && homeLink.dataset.url) {
    homeLink.onclick = function () {
      window.location.href = homeLink.dataset.url;
    };
  } else if (homeLink) {
    console.warn("Home link URL not found in data-url attribute.");
  }
}

export function setupExportButtonHandler(network, nodes, edges) {
  const exportGraphBtn = document.getElementById("exportGraphBtn");
  if (exportGraphBtn) {
    exportGraphBtn.onclick = function () {
      if (!network) {
        console.error("Network not initialized for export.");
        return;
      }
      network.storePositions();
      const networkDataToExport = {
        nodes: nodes.get({
          fields: [
            "id",
            "label",
            "color",
            "shape",
            "font",
            "title",
            "original_title",
            "original_credits",
            "original_semesters_offered",
            "x",
            "y",
          ],
        }),
        edges: edges.get(),
      };
      const jsonData = JSON.stringify(networkDataToExport, null, 2);
      const blob = new Blob([jsonData], { type: "application/json" });
      const fileUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = "course_graph.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(fileUrl);
      alert("Graph exported as course_graph.json!");
    };
  }
}

export function initialLayoutAdjustment(network, nodesDataSet) {
  let hierarchicalEnabledInitial = true;
  if (nodesDataSet.length > 0) {
    network.once("afterDrawing", function () {
      if (hierarchicalEnabledInitial) {
        network.setOptions({
          layout: { hierarchical: { enabled: false } },
        });
        // network.fit();
        hierarchicalEnabledInitial = false;
      }
    });
  } else {
    console.warn("No nodes to draw. Hierarchical layout adjustment skipped.");
  }
}

// --- STATE TRACKING ---
let currentScheduleId =
  typeof serverScheduleId !== "undefined" ? serverScheduleId : null;
// Use sessionStorage so the "dirty" state survives the page reload during addNode
let isGraphDirty = sessionStorage.getItem("isGraphDirty") === "true";

export function markGraphDirty() {
  isGraphDirty = true;
  sessionStorage.setItem("isGraphDirty", "true");
  updateSaveButtonUI();
}

function updateSaveButtonUI() {
  const btn = document.getElementById("saveGraphBtn");
  if (!btn) return;

  if (currentScheduleId) {
    if (isGraphDirty) {
      btn.textContent = "Save Changes";
      btn.disabled = false;
      btn.classList.add("needs-saving"); // Adds the glowing pulse from your CSS
      btn.style.backgroundColor = ""; // Lets the CSS class take over
    } else {
      btn.textContent = "Up to date";
      btn.disabled = true;
      btn.classList.remove("needs-saving");
      btn.style.backgroundColor = "var(--border-color)"; // Gray when up to date
    }
  } else {
    // Brand new graph
    btn.textContent = "Save to Profile";
    btn.disabled = false;
    btn.style.backgroundColor = "var(--mcgill-red)";
    if (isGraphDirty) {
      btn.classList.add("needs-saving");
    } else {
      btn.classList.remove("needs-saving");
    }
  }
}

// --- SAVE GRAPH BUTTON HANDLER ---
export function setupSaveButtonHandler(network, nodes, edges) {
  const saveGraphBtn = document.getElementById("saveGraphBtn");
  if (!saveGraphBtn) return;

  // 1. Force the button to ALWAYS be visible
  saveGraphBtn.style.display = "inline-block";

  // Use the single instance we set up earlier!
  const supabaseClient = window.supabaseClient;

  // 2. Check if logged in & set initial UI state on page load
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      updateSaveButtonUI();
    } else {
      // Enticing default state for logged-out users
      saveGraphBtn.textContent = "Save to Profile";
      saveGraphBtn.disabled = false;
      saveGraphBtn.style.backgroundColor = "var(--mcgill-red)";
    }
  });

  // 3. Listen for real-time auth changes without page reload
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) {
      updateSaveButtonUI();
    } else if (event === "SIGNED_OUT") {
      saveGraphBtn.textContent = "Save to Profile";
      saveGraphBtn.disabled = false;
      saveGraphBtn.style.backgroundColor = "var(--mcgill-red)";
    }
  });

  saveGraphBtn.addEventListener("click", async () => {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    // If not logged in, pop open the Auth Modal instead of an alert!
    if (!session || error) {
      const authModal = document.getElementById("authModal");
      if (authModal) {
        authModal.style.display = "flex";
      }
      return;
    }

    // Extracted the save execution into a reusable function
    const executeSave = async (scheduleName) => {
      saveGraphBtn.textContent = "Saving...";
      saveGraphBtn.disabled = true;

      // FORCE vis-network to give the final x/y coordinates
      network.storePositions();
      const currentNodes = nodes.get();

      //  Loop through and inject the coordinates into the global detailsData
      currentNodes.forEach((node) => {
        if (detailsData[node.id]) {
          detailsData[node.id].x = node.x;
          detailsData[node.id].y = node.y;
        }
      });

      try {
        const response = await fetch("/save_graph_to_db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            schedule_name: scheduleName,
            details_data: detailsData,
            prereqs_data: prereqsData,

            credit_requirements: {
              core: parseFloat(document.getElementById("req-core")?.value) || 0,
              comp: parseFloat(document.getElementById("req-comp")?.value) || 0,
              elec: parseFloat(document.getElementById("req-elec")?.value) || 0,
            },
          }),
        });

        const result = await response.json();
        if (result.status === "success") {
          if (result.schedule_id) {
            currentScheduleId = result.schedule_id; // Store ID if it was a new graph
          }
          isGraphDirty = false;
          sessionStorage.setItem("isGraphDirty", "false"); // Reset dirty state
          updateSaveButtonUI(); // Will trigger "Graph up to date"
        } else {
          alert("Error saving graph: " + result.message);
          updateSaveButtonUI();
        }
      } catch (err) {
        console.error(err);
        alert("Network error occurred.");
        updateSaveButtonUI();
      }
    };

    // LOGIC: Only show the custom modal if it's a brand new graph
    if (!currentScheduleId) {
      openCustomPrompt({
        title: "Save Degree Plan",
        submitText: "Save to Profile",
        fields: [
          {
            id: "scheduleName",
            label: "Plan Name",
            defaultValue: "My Degree Plan",
            placeholder: "e.g., Fall 2024",
          },
        ],
        onSubmit: (data) => executeSave(data.scheduleName),
      });
    } else {
      // It's an existing graph, just update it silently!
      executeSave(null);
    }
  });
}

// --- DYNAMIC CUSTOM MODAL LOGIC ---
export function openCustomPrompt({ title, submitText, fields, onSubmit }) {
  const modal = document.getElementById("customPromptModal");
  const titleEl = document.getElementById("promptTitle");
  const fieldsContainer = document.getElementById("promptFieldsContainer");
  const submitBtn = document.getElementById("submitPromptBtn");
  const closeBtn = document.getElementById("closePromptModal");
  const form = document.getElementById("customPromptForm");

  if (!modal) return;

  titleEl.textContent = title;
  submitBtn.textContent = submitText || "Submit";
  fieldsContainer.innerHTML = "";

  fields.forEach((field) => {
    const group = document.createElement("div");
    group.className = "input-group";
    group.style.marginBottom = "15px";
    group.style.textAlign = "left";

    const label = document.createElement("label");
    label.textContent = field.label;
    label.style.display = "block";
    label.style.marginBottom = "8px";
    label.style.color = "var(--text-muted)";
    label.style.fontWeight = "500";
    label.style.fontSize = "0.9em";
    group.appendChild(label);

    // 1. SELECT DROPDOWN (For Category)
    if (field.type === "select") {
      const select = document.createElement("select");
      select.id = `prompt_field_${field.id}`;
      select.style.width = "100%";
      select.style.padding = "10px";
      select.style.border = "1px solid var(--border-color)";
      select.style.borderRadius = "4px";

      field.options.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt;
        option.textContent = opt;
        if (opt === field.defaultValue) option.selected = true;
        select.appendChild(option);
      });
      group.appendChild(select);

      // 2. SEMESTER BUILDER (Dynamic Rows)
    } else if (field.type === "semester_builder") {
      const builderContainer = document.createElement("div");
      builderContainer.id = `prompt_field_${field.id}`;

      const rowsContainer = document.createElement("div");

      const addBtn = document.createElement("button");
      addBtn.textContent = "+ Add Semester";
      addBtn.type = "button";
      addBtn.className = "action-button";
      addBtn.style.marginTop = "5px";
      addBtn.style.width = "100%";
      addBtn.style.backgroundColor = "var(--text-muted)";
      addBtn.onclick = () => addSemesterRow(rowsContainer);

      function addSemesterRow(
        container,
        term = "Fall",
        year = new Date().getFullYear(),
      ) {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.gap = "10px";
        row.style.marginBottom = "8px";

        const termSelect = document.createElement("select");
        termSelect.style.flex = "1";
        termSelect.style.padding = "8px";
        ["Fall", "Winter", "Summer"].forEach((t) => {
          const opt = document.createElement("option");
          opt.value = t;
          opt.textContent = t;
          if (t === term) opt.selected = true;
          termSelect.appendChild(opt);
        });

        const yearInput = document.createElement("input");
        yearInput.type = "number";
        yearInput.value = year;
        yearInput.style.width = "80px";
        yearInput.style.padding = "8px";

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "X";
        removeBtn.type = "button";
        removeBtn.style.padding = "8px 12px";
        removeBtn.style.backgroundColor = "var(--error-text)";
        removeBtn.style.color = "white";
        removeBtn.style.border = "none";
        removeBtn.style.borderRadius = "4px";
        removeBtn.style.cursor = "pointer";
        removeBtn.onclick = () => row.remove();

        row.appendChild(termSelect);
        row.appendChild(yearInput);
        row.appendChild(removeBtn);
        container.appendChild(row);
      }

      // Parse existing data (e.g., "Fall 2024, Winter 2025" or just "Fall, Winter")
      if (
        field.defaultValue &&
        field.defaultValue !== "Unknown" &&
        field.defaultValue !== "N/A"
      ) {
        const existing = field.defaultValue.split(", ");
        existing.forEach((entry) => {
          const parts = entry.split(" ");
          if (parts.length === 2)
            addSemesterRow(rowsContainer, parts[0], parts[1]);
          else if (parts.length === 1) addSemesterRow(rowsContainer, parts[0]);
        });
      } else {
        addSemesterRow(rowsContainer); // default empty row
      }

      builderContainer.appendChild(rowsContainer);
      builderContainer.appendChild(addBtn);

      // Custom method to extract the formatted string on submit
      builderContainer.getValue = () => {
        const rows = rowsContainer.children;
        const results = [];
        for (let i = 0; i < rows.length; i++) {
          const term = rows[i].children[0].value;
          const year = rows[i].children[1].value;
          if (term && year) results.push(`${term} ${year}`);
        }
        return results.length > 0 ? results.join(", ") : "Unknown";
      };

      group.appendChild(builderContainer);

      // 3. STANDARD TEXT INPUT
    } else if (field.type === "program_search") {
      // --- AUTO-COMPLETE SEARCH FIELD FOR PROGRAMS ---
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";

      // 1. The Visible Input
      const input = document.createElement("input");
      input.type = "text";
      input.id = `prompt_field_${field.id}_display`;
      input.placeholder = "e.g., Mathematics Minor (Type to search...)";
      input.style.width = "100%";
      input.style.padding = "10px";
      input.style.border = "1px solid var(--border-color)";
      input.style.borderRadius = "4px";
      input.style.boxSizing = "border-box";

      // 2. The Hidden Input (Holds the URL for submission)
      const hiddenInput = document.createElement("input");
      hiddenInput.type = "hidden";
      hiddenInput.id = `prompt_field_${field.id}`;

      // 3. The Dropdown
      const resultsDiv = document.createElement("div");
      resultsDiv.className = "search-results-container";
      resultsDiv.style.display = "none";

      // FIX 1: Change absolute to relative so it naturally expands the modal!
      resultsDiv.style.position = "relative";
      resultsDiv.style.width = "100%";
      resultsDiv.style.marginTop = "4px";
      resultsDiv.style.maxHeight = "180px";
      resultsDiv.style.overflowY = "auto";
      // Remove zIndex and top since it's no longer floating absolutely
      resultsDiv.style.backgroundColor = "var(--surface-color)";
      resultsDiv.style.border = "1px solid var(--border-color)";
      resultsDiv.style.borderRadius = "4px";

      wrapper.appendChild(input);
      wrapper.appendChild(hiddenInput);
      wrapper.appendChild(resultsDiv);
      group.appendChild(wrapper);

      // Fetch the Programs JSON
      fetch("/static/json/programs.json")
        .then((response) => response.json())
        .then((programsData) => {
          let programsList = [];
          if (Array.isArray(programsData)) {
            programsList = programsData.map((p) => ({
              title: p.Title || p.title || p.name || "Unknown Program",
              url: p.url || p.URL || p.link || "",
            }));
          } else {
            programsList = Object.keys(programsData).map((key) => ({
              title: key,
              url: programsData[key],
            }));
          }

          const fuse = new Fuse(programsList, {
            keys: ["title"],
            threshold: 0.3,
          });

          input.addEventListener("input", (e) => {
            const query = e.target.value;
            resultsDiv.innerHTML = "";
            hiddenInput.value = ""; // Clear hidden url if they type manually

            if (query.length < 2) {
              resultsDiv.style.display = "none";
              return;
            }

            const results = fuse.search(query).slice(0, 8);
            if (results.length > 0) {
              resultsDiv.style.display = "block";

              results.forEach((result) => {
                const item = result.item;
                const div = document.createElement("div");
                div.style.padding = "10px";
                div.style.borderBottom = "1px solid var(--border-color)";
                div.style.cursor = "pointer";
                div.innerHTML = `<strong>${item.title}</strong>`;

                div.addEventListener(
                  "mouseenter",
                  () => (div.style.backgroundColor = "#f5f5f5"),
                );
                div.addEventListener(
                  "mouseleave",
                  () => (div.style.backgroundColor = "transparent"),
                );

                div.addEventListener("click", () => {
                  input.value = item.title;
                  hiddenInput.value = item.url; // The URL will definitely exist now!
                  resultsDiv.style.display = "none";
                });

                resultsDiv.appendChild(div);
              });
            } else {
              resultsDiv.style.display = "none";
            }
          });

          document.addEventListener("click", (evt) => {
            if (!wrapper.contains(evt.target))
              resultsDiv.style.display = "none";
          });
        })
        .catch((err) => console.error("Could not load programs JSON:", err));
    } else if (field.type === "course_search") {
      // --- THE NEW AUTO-COMPLETE SEARCH FIELD ---
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";

      const input = document.createElement("input");
      input.type = "text";
      input.id = `prompt_field_${field.id}`;
      input.value = field.defaultValue || "";
      input.placeholder = "e.g., COMP 250 (Type to search...)";
      input.style.width = "100%";
      input.style.padding = "10px";
      input.style.border = "1px solid var(--border-color)";
      input.style.borderRadius = "4px";
      input.style.boxSizing = "border-box";

      const resultsDiv = document.createElement("div");
      resultsDiv.className = "search-results-container";
      resultsDiv.style.display = "none";
      resultsDiv.style.position = "relative";
      resultsDiv.style.left = "0";
      resultsDiv.style.width = "100%";
      resultsDiv.style.maxHeight = "200px";
      resultsDiv.style.overflowY = "auto";
      resultsDiv.style.zIndex = "1000";
      resultsDiv.style.backgroundColor = "var(--surface-color)";
      resultsDiv.style.border = "1px solid var(--border-color)";
      resultsDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)";

      wrapper.appendChild(input);
      wrapper.appendChild(resultsDiv);
      group.appendChild(wrapper);

      // Fetch the JSON and setup Fuse.js
      fetch("/static/json/courses_info.json")
        .then((response) => response.json())
        .then((coursesJson) => {
          const coursesList = Object.keys(coursesJson).map((code) => ({
            code: code,
            ...coursesJson[code],
          }));

          const fuse = new Fuse(coursesList, {
            keys: ["code", "Title"],
            threshold: 0.3,
          });

          input.addEventListener("input", (e) => {
            const query = e.target.value;
            resultsDiv.innerHTML = "";

            if (query.length < 2) {
              resultsDiv.style.display = "none";
              return;
            }

            const results = fuse.search(query).slice(0, 5);
            if (results.length > 0) {
              resultsDiv.style.display = "block";

              results.forEach((result) => {
                const item = result.item;
                const div = document.createElement("div");
                div.style.padding = "10px";
                div.style.borderBottom = "1px solid var(--border-color)";
                div.style.cursor = "pointer";
                div.innerHTML = `<strong>${item.code}</strong> - ${item.Title}`;

                div.addEventListener(
                  "mouseenter",
                  () => (div.style.backgroundColor = "#f5f5f5"),
                );
                div.addEventListener(
                  "mouseleave",
                  () => (div.style.backgroundColor = "transparent"),
                );

                div.addEventListener("click", () => {
                  input.value = item.code;
                  resultsDiv.style.display = "none";

                  const titleInput =
                    document.getElementById("prompt_field_title");
                  if (titleInput) titleInput.value = item.Title;

                  const creditsInput = document.getElementById(
                    "prompt_field_credits",
                  );
                  if (creditsInput) creditsInput.value = item.Credits;
                });

                resultsDiv.appendChild(div);
              });
            } else {
              resultsDiv.style.display = "none";
            }
          });

          document.addEventListener("click", (evt) => {
            if (!wrapper.contains(evt.target))
              resultsDiv.style.display = "none";
          });
        })
        .catch((err) => console.error("Could not load courses JSON:", err));
    } else {
      const input = document.createElement("input");
      input.type = field.type || "text";
      input.id = `prompt_field_${field.id}`;
      input.value = field.defaultValue || "";
      input.placeholder = field.placeholder || "";
      input.required = field.required !== false;
      input.style.width = "100%";
      input.style.padding = "10px";
      input.style.border = "1px solid var(--border-color)";
      input.style.borderRadius = "4px";
      input.style.boxSizing = "border-box";
      group.appendChild(input);
    }

    fieldsContainer.appendChild(group);
  });

  modal.style.display = "flex";

  function cleanup() {
    modal.style.display = "none";
    form.onsubmit = null;
    closeBtn.onclick = null;
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    const results = {};

    fields.forEach((field) => {
      const el = document.getElementById(`prompt_field_${field.id}`);
      if (field.type === "semester_builder") {
        results[field.id] = el.getValue();
      } else {
        results[field.id] = el.value;

        const displayEl = document.getElementById(
          `prompt_field_${field.id}_display`,
        );
        if (displayEl) {
          results[`${field.id}_display`] = displayEl.value;
        }
      }
    });

    // If onSubmit explicitly returns false, DO NOT close the modal
    const success = onSubmit(results);
    if (success !== false) {
      cleanup();
    }
  };

  closeBtn.onclick = cleanup;
}
