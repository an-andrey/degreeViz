export function updateSheetView(detailsData, requirementsData = window.programRequirements || {}) {
  let stats = {
    CORE: { taken: 0 },
    COMPLEMENTARY: { taken: 0 },
    ELECTIVE: { taken: 0 },
    TOTAL: { taken: 0 },
  };
  let semesterLoads = {};

  Object.values(detailsData).forEach((course) => {
    const credits = parseFloat(course.credits) || 0;
    const status = course.status || "Unassigned";
    const term = course.planned_semester || "Unassigned";
    let cat = course.category ? course.category.toUpperCase() : "CORE";
    if (cat.includes("COMPL")) cat = "COMPLEMENTARY";

    if (status === "DONE" || status === "TAKING") {
      if (stats[cat]) stats[cat].taken += credits;
      stats.TOTAL.taken += credits;
    }

    if (term !== "Unassigned") {
      if (!semesterLoads[term]) semesterLoads[term] = 0;
      semesterLoads[term] += credits;
    }
  });

  const reqCoreInput = document.getElementById("req-core");
  if (!reqCoreInput) return; // Guard against running before HTML is loaded

  const reqs = {
    core: parseFloat(reqCoreInput.value) || 0,
    comp: parseFloat(document.getElementById("req-comp").value) || 0,
    elec: parseFloat(document.getElementById("req-elec").value) || 0,
  };
  reqs.total = reqs.core + reqs.comp + reqs.elec;
  document.getElementById("req-total").value = reqs.total;

  ["core", "comp", "elec", "total"].forEach((type) => {
    let catKey = type.toUpperCase();
    if (type === "comp") catKey = "COMPLEMENTARY";
    if (type === "elec") catKey = "ELECTIVE";
    const taken = stats[catKey].taken;
    document.getElementById(`taken-${type}`).textContent = taken;
    document.getElementById(`rem-${type}`).textContent = Math.max(
      0,
      reqs[type] - taken,
    );
  });

  const tbody = document.getElementById("semesterTableBody");
  tbody.innerHTML = "";
  const sortedTerms = Object.keys(semesterLoads).sort((a, b) => {
    const seasonWeight = { Winter: 1, Summer: 2, Fall: 3 };
    const [seasonA, yearA] = a.split(" ");
    const [seasonB, yearB] = b.split(" ");
    return yearA !== yearB
      ? yearA - yearB
      : seasonWeight[seasonA] - seasonWeight[seasonB];
  });

  sortedTerms.forEach((term) => {
    const load = semesterLoads[term];
    const row = document.createElement("tr");
    row.innerHTML = `<td><strong>${term}</strong></td><td style="${load >= 18 ? "color: var(--error-text); font-weight: bold;" : ""}">${load}</td>`;
    tbody.appendChild(row);
  });

  updateRequirementBuckets(detailsData, requirementsData);
}

function formatCreditRange(bucket) {
  const minCredits = Number(bucket.min_credits) || 0;
  const maxCredits = Number(bucket.max_credits);

  if (Number.isFinite(maxCredits) && maxCredits !== minCredits) {
    return `${minCredits}-${maxCredits}`;
  }

  return `${minCredits}`;
}

function updateRequirementBuckets(detailsData, requirementsData) {
  const card = document.getElementById("requirementBucketsCard");
  const tbody = document.getElementById("requirementBucketTableBody");
  if (!card || !tbody) return;

  const buckets = Array.isArray(requirementsData?.buckets)
    ? requirementsData.buckets
    : [];

  if (buckets.length === 0) {
    card.style.display = "none";
    tbody.innerHTML = "";
    return;
  }

  card.style.display = "block";
  tbody.innerHTML = "";

  buckets.forEach((bucket) => {
    const taken = Object.entries(detailsData).reduce((sum, [code, course]) => {
      const belongsToBucket =
        course.requirement_bucket === bucket.id || bucket.courses?.includes(code);
      const countsTowardProgress = ["DONE", "TAKING"].includes(course.status);
      return belongsToBucket && countsTowardProgress
        ? sum + (parseFloat(course.credits) || 0)
        : sum;
    }, 0);

    const minCredits = Number(bucket.min_credits) || 0;
    const remaining = Math.max(0, minCredits - taken);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${bucket.title || bucket.id}</strong><br><small>${bucket.category || "CORE"}</small></td>
      <td>${formatCreditRange(bucket)}</td>
      <td>${taken}</td>
      <td class="${remaining > 0 ? "bold-red" : ""}">${remaining}</td>
    `;
    tbody.appendChild(row);
  });
}

export function setupSheetViewListeners(detailsData, updateCb, markDirtyCb) {
  document.querySelectorAll(".req-input:not([disabled])").forEach((input) => {
    input.addEventListener("input", () => {
      updateCb(detailsData);
      if (markDirtyCb) markDirtyCb();
    });
  });
}
