/*
 * program_handler.js
 * Handles "Add Another Program" from the graph page.
 *
 * It opens a program-search modal, asks Flask to scrape/process the selected
 * program via `/add_program_to_graph`, merges the returned courses and
 * prerequisites into `graphState`, and places visible new nodes to the right
 * of the current graph.
 */
import { openCustomPrompt } from "./ui_handler.js";

export function setupAddProgramButton(
  network,
  nodes,
  edges,
  graphState,
  saveGraphState,
) {
  const addProgramBtn = document.getElementById("addProgramToGraphBtn");
  if (!addProgramBtn) return;

  addProgramBtn.addEventListener("click", (e) => {
    e.preventDefault();

    openCustomPrompt({
      title: "Add Another Program",
      submitText: "Import Program",
      fields: [
        {
          id: "url",
          label: "Search for a Program:",
          type: "program_search",
          required: true,
        },
      ],
      onSubmit: (data) => {
        if (!data.url) {
          alert("Please select a valid program from the dropdown.");
          return false;
        }

        const buttons = Array.from(
          document.querySelectorAll("#customPromptModal button"),
        );
        const submitBtn = buttons.find((b) => b.textContent.includes("Import"));

        if (submitBtn) {
          submitBtn.textContent = "Scraping McGill... Please wait.";
          submitBtn.style.backgroundColor = "var(--text-muted)";
          submitBtn.style.cursor = "wait";
          submitBtn.disabled = true;
        }

        // Fetch the new program data dynamically
        fetch(
          `/add_program_to_graph?url=${encodeURIComponent(data.url)}&programName=${encodeURIComponent(data.url_display || "")}`,
          {
            headers: { "X-Requested-With": "XMLHttpRequest" },
          },
        )
          .then((response) => response.json())
          .then((result) => {
            if (result.status === "success") {
              // 1. Save state for UNDO
              if (typeof saveGraphState === "function") saveGraphState();

              // 2. Update local memory
              if (result.new_requirements?.buckets) {
                const inferredProgramName = data.url_display || data.url || "Program";
                result.new_requirements.buckets.forEach((bucket) => {
                  if (!bucket.program_name) bucket.program_name = inferredProgramName;
                });
              }
              graphState.mergeProgramData(
                result.new_details || {},
                result.new_prereqs || {},
                result.new_requirements || {},
              );

              // 3. Grid Placement Algorithm
              let maxX = -Infinity;
              let startY = 0;
              const existingIds = nodes.getIds();
              if (existingIds.length > 0) {
                existingIds.forEach((id) => {
                  const pos = network.getPositions([id])[id];
                  if (pos && pos.x > maxX) maxX = pos.x;
                  if (pos && pos.y < startY) startY = pos.y;
                });
              } else {
                maxX = 0;
              }

              const newNodesArray = [];
              let currentX = maxX + 300;
              let currentY = startY;

              Object.keys(result.new_details || {}).forEach((code, index) => {
                const d = graphState.details[code];
                if (!nodes.get(code) && (d.include_in_graph !== false)) {
                  const xOffset = currentX + Math.floor(index / 5) * 200;
                  const yOffset = currentY + (index % 5) * 150;

                  d.x = xOffset;
                  d.y = yOffset;
                  newNodesArray.push(code);
                }
              });

              newNodesArray.forEach((code) => {
                const d = graphState.details[code];
                graphState.addNodeFromDetails(code, d.x, d.y, true);
              });

              // 4. Draw Edges
              Object.keys(result.new_prereqs || {}).forEach((toNode) => {
                graphState.connectCourseEdges(toNode);
              });

              // 5. UI Cleanup
              const modal = document.getElementById("customPromptModal");
              if (modal) modal.style.display = "none";

              if (submitBtn) {
                submitBtn.textContent = "Import Program";
                submitBtn.style.backgroundColor = "";
                submitBtn.style.cursor = "pointer";
                submitBtn.disabled = false;
              }

              graphState.notify();
              network.fit();
            } else {
              alert("Error importing program: " + result.message);
              if (submitBtn) {
                submitBtn.textContent = "Import Program";
                submitBtn.style.backgroundColor = "";
                submitBtn.style.cursor = "pointer";
                submitBtn.disabled = false;
              }
            }
          })
          .catch((err) => {
            console.error("Fetch error:", err);
            alert("A network error occurred while reaching the server.");
            if (submitBtn) {
              submitBtn.textContent = "Import Program";
              submitBtn.style.backgroundColor = "";
              submitBtn.style.cursor = "pointer";
              submitBtn.disabled = false;
            }
          });

        return false;
      },
    });
  });
}
