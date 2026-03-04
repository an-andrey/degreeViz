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

// State tracking
let currentScheduleId =
  typeof serverScheduleId !== "undefined" ? serverScheduleId : null;
let isGraphDirty = false;

export function markGraphDirty() {
  isGraphDirty = true;
  updateSaveButtonUI();
}

function updateSaveButtonUI() {
  const btn = document.getElementById("saveGraphBtn");
  if (!btn) return;

  if (currentScheduleId) {
    if (isGraphDirty) {
      btn.textContent = "Update Graph";
      btn.disabled = false;
    } else {
      btn.textContent = "Graph up to date";
      btn.disabled = true;
    }
  } else {
    btn.textContent = "Save Graph to Profile";
    btn.disabled = false;
  }
}

export function setupSaveButtonHandler() {
  const saveGraphBtn = document.getElementById("saveGraphBtn");
  if (!saveGraphBtn) return;

  const { supabase_url, supabase_key } = window.SUPABASE_CONFIG;
  const supabaseClient = window.supabase.createClient(
    supabase_url,
    supabase_key,
  );

  // Initial UI Setup
  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session) {
      saveGraphBtn.style.display = "inline-block";
      updateSaveButtonUI();
    }
  });

  saveGraphBtn.addEventListener("click", async () => {
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();

    if (!session || error) {
      alert("You must be logged in to save a graph.");
      return;
    }

    let scheduleName = "My Degree Plan";
    // Only ask for a name if it's a brand new graph
    if (!currentScheduleId) {
      scheduleName = prompt(
        "Enter a name for this degree plan:",
        "My Fall Plan",
      );
      if (!scheduleName) return;
    }

    saveGraphBtn.textContent = "Saving...";
    saveGraphBtn.disabled = true;

    try {
      const response = await fetch("/save_graph_to_db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: session.access_token,
          schedule_name: scheduleName,
        }),
      });

      const result = await response.json();

      if (result.status === "success") {
        currentScheduleId = result.schedule_id; // Capture the ID if it was just created
        isGraphDirty = false; // Reset dirty state
        updateSaveButtonUI(); // Will trigger "Graph up to date"
      } else {
        alert("Error saving graph: " + result.message);
        updateSaveButtonUI(); // Reset UI on fail
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Network error occurred while saving.");
      updateSaveButtonUI(); // Reset UI on fail
    }
  });
}
