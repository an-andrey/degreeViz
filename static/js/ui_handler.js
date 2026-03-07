// filepath: c:\Users\anamb\OneDrive\Desktop\Code\python\degreeViz\static\js\graphUiHandlers.js
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
      btn.textContent = "Update Graph";
      btn.disabled = false;
      btn.style.backgroundColor = "#28a745"; // Green when ready to update
    } else {
      btn.textContent = "Graph up to date";
      btn.disabled = true;
      btn.style.backgroundColor = "var(--border-color)"; // Gray when up to date
    }
  } else {
    btn.textContent = "Save Graph to Profile";
    btn.disabled = false;
    btn.style.backgroundColor = "#28a745";
  }
}

// --- SAVE GRAPH BUTTON HANDLER ---
export function setupSaveButtonHandler() {
  const saveGraphBtn = document.getElementById("saveGraphBtn");
  if (!saveGraphBtn) return;

  // 1. Force the button to ALWAYS be visible
  saveGraphBtn.style.display = "inline-block";

  // Use the single instance we set up earlier!
  const supabaseClient = window.supabaseClient;

  // 2. Check if logged in & set initial UI state
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

  saveGraphBtn.addEventListener("click", async () => {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    // 3. THE MAGIC: If not logged in, pop open the Auth Modal instead of an alert!
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

      try {
        const response = await fetch("/save_graph_to_db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: session.access_token,
            schedule_name: scheduleName, // Backend ignores this if it's an update
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
  const cancelBtn = document.getElementById("cancelPromptBtn");
  const closeBtn = document.getElementById("closePromptModal");
  const form = document.getElementById("customPromptForm");

  if (!modal) return;

  // Set titles
  titleEl.textContent = title;
  submitBtn.textContent = submitText || "Submit";
  fieldsContainer.innerHTML = ""; // Clear previous fields

  // Generate the fields dynamically
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

    const input = document.createElement("input");
    input.type = field.type || "text";
    input.id = `prompt_field_${field.id}`;
    input.value = field.defaultValue || "";
    input.placeholder = field.placeholder || "";
    input.required = field.required !== false;
    input.style.width = "100%";
    input.style.padding = "12px";
    input.style.border = "1px solid var(--border-color)";
    input.style.borderRadius = "4px";
    input.style.boxSizing = "border-box";
    input.style.backgroundColor = "var(--bg-color)";

    group.appendChild(label);
    group.appendChild(input);
    fieldsContainer.appendChild(group);
  });

  modal.style.display = "flex";

  // Clean up function to prevent duplicate event listeners
  function cleanup() {
    modal.style.display = "none";
    form.onsubmit = null;
    cancelBtn.onclick = null;
    closeBtn.onclick = null;
  }

  // Handle the submit
  form.onsubmit = (e) => {
    e.preventDefault();
    const results = {};
    fields.forEach((field) => {
      results[field.id] = document.getElementById(
        `prompt_field_${field.id}`,
      ).value;
    });

    // Pass the data back to whatever called the prompt
    onSubmit(results);
    cleanup();
  };

  cancelBtn.onclick = cleanup;
  closeBtn.onclick = cleanup;
}
