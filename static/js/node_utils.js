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

// Generates a highly readable label using bold and italic HTML tags
export function generateNodeLabel(
  code,
  title,
  credits,
  semesters,
  category,
  plannedSemester = "Unassigned",
  status = "TO TAKE",
) {
  return `<b><code>${code}</code></b>\n${title}\n(${credits} credits)\nStatus: <b>${status}</b>\nTerm Planned: <b>${plannedSemester}</b>\n<b>[${category}]</b>\n`;
}
