document.addEventListener("DOMContentLoaded", () => {
  // Select all the delete forms
  const deleteForms = document.querySelectorAll(".delete-form");

  deleteForms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); // Stop the standard form submission (page reload)

      const submitBtn = form.querySelector(".btn-delete");
      const scheduleId = form.querySelector('input[name="schedule_id"]').value;
      const card = form.closest(".graph-card");

      // Instantly update UI to show action is happening
      submitBtn.textContent = "Deleting...";
      submitBtn.disabled = true;

      try {
        // Send the request to Flask
        const response = await fetch("/delete_graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ schedule_id: scheduleId }),
        });

        const result = await response.json();

        if (result.status === "success") {
          // Smoothly fade out and remove the card
          card.style.transition = "opacity 0.3s ease";
          card.style.opacity = "0";
          setTimeout(() => {
            card.remove();
            // If the grid is now empty, refresh to show the "empty state" message
            const grid = document.querySelector(".graphs-grid");
            if (grid && grid.children.length === 0) {
              location.reload();
            }
          }, 300);
        } else {
          alert("Error deleting graph: " + result.message);
          submitBtn.textContent = "Delete";
          submitBtn.disabled = false;
        }
      } catch (err) {
        alert("Network error occurred.");
        submitBtn.textContent = "Delete";
        submitBtn.disabled = false;
      }
    });
  });
});
