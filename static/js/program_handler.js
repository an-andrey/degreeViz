import { openCustomPrompt } from "./ui_handler.js";
import { generateNodeLabel, getStatusColor } from "./node_utils.js";
import { updateSheetView } from "./sheet_view.js";

export function setupAddProgramButton(
  network,
  nodes,
  edges,
  detailsData,
  prereqsData,
  saveGraphState,
  markGraphDirty,
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
              Object.assign(detailsData, result.new_details);
              Object.assign(prereqsData, result.new_prereqs);

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
              const coordsPayload = {}; // Stores the coordinates to send to Python
              let currentX = maxX + 300;
              let currentY = startY;

              Object.keys(result.new_details).forEach((code, index) => {
                if (!nodes.get(code)) {
                  const d = result.new_details[code];
                  const xOffset = currentX + Math.floor(index / 5) * 200;
                  const yOffset = currentY + (index % 5) * 150;

                  // Add to nodes array
                  newNodesArray.push({
                    id: code,
                    x: xOffset,
                    y: yOffset,
                    label: generateNodeLabel(
                      code,
                      d.title,
                      d.credits,
                      d.semesters_offered,
                      d.category || "CORE",
                      d.planned_semester || "Unassigned",
                      d.status || "Unassigned",
                    ),
                    color: getStatusColor(d.status || "Unassigned"),
                  });

                  // Package coordinates for backend sync AND local memory
                  coordsPayload[code] = { x: xOffset, y: yOffset };
                  detailsData[code].x = xOffset;
                  detailsData[code].y = yOffset;
                }
              });

              nodes.add(newNodesArray);

              // --- FIXED: Sync Coordinates to Flask Session ---
              fetch("/update_session_coords", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(coordsPayload),
              }).catch((err) => console.error("Coordinate sync failed:", err));

              // 4. Draw Edges
              const newEdgesArray = [];
              Object.keys(result.new_prereqs).forEach((toNode) => {
                const reqs = result.new_prereqs[toNode];
                if (Array.isArray(reqs)) {
                  reqs.forEach((fromNode) => {
                    if (nodes.get(fromNode) && nodes.get(toNode)) {
                      newEdgesArray.push({
                        from: fromNode,
                        to: toNode,
                        arrows: "to",
                        smooth: {
                          enabled: true,
                          type: "cubicBezier",
                          forceDirection: "horizontal",
                          roundness: 0.4,
                        },
                      });
                    }
                  });
                }
              });

              edges.add(newEdgesArray);

              // 5. UI Cleanup
              const modal = document.getElementById("customPromptModal");
              if (modal) modal.style.display = "none";

              if (submitBtn) {
                submitBtn.textContent = "Import Program";
                submitBtn.style.backgroundColor = "";
                submitBtn.style.cursor = "pointer";
                submitBtn.disabled = false;
              }

              markGraphDirty();
              updateSheetView(detailsData);
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
