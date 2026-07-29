/*
 * node_utils.js
 * Small presentation helpers shared by graph modules.
 *
 * `getStatusColor` centralizes vis-network color objects for course status.
 * `getCategoryShape` centralizes text-safe node shapes for requirement types.
 * `getCategoryShapeProperties` adds small visual differences without changing
 * node geometry enough to make labels spill outside the node.
 * `generateNodeLabel` centralizes the compact label shown inside each node.
 */
// Maps status to high-contrast pastel colors with crisp borders
export function getStatusColor(status) {
  const s = status ? status.toUpperCase() : "UNASSIGNED";
  switch (s) {
    case "DONE":
      return {
        background: "#d4edda",
        border: "#28a745",
        highlight: { background: "#c3e6cb", border: "#28a745" },
      }; // Green
    case "TAKING":
      return {
        background: "#fff3cd",
        border: "#ffc107",
        highlight: { background: "#ffeeba", border: "#ffc107" },
      }; // Yellow
    case "TO TAKE":
      return {
        background: "#f8d7da",
        border: "#dc3545",
        highlight: { background: "#f5c6cb", border: "#dc3545" },
      }; // Light Red
    case "UNASSIGNED":
    default:
      return {
        background: "#e2e3e5",
        border: "#6c757d",
        highlight: { background: "#dae0e5", border: "#6c757d" },
      }; // Gray
  }
}

export function getCategoryShape(category) {
  const normalizedCategory = String(category || "").toUpperCase();
  if (normalizedCategory === "COMPLEMENTARY") return "ellipse";
  return "box";
}

export function getCategoryShapeProperties(category) {
  const normalizedCategory = String(category || "").toUpperCase();
  if (normalizedCategory === "ELECTIVE") return { borderDashes: [6, 4] };
  return { borderDashes: false };
}

// Generates a compact label; progress is shown by color, requirement type by shape.
export function generateNodeLabel(
  code,
  title,
  credits,
  plannedSemester = "Unassigned",
) {
  const termText = plannedSemester && plannedSemester !== "Unassigned" ? `\n${plannedSemester}` : "";
  return `<b><code>${code}</code></b>\n${title}\n(${credits} credits)${termText}\n`;
}
