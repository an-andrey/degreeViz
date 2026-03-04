/*
 * search_form.js
 * This script handles the "Fuse.js" fuzzy search functionality for both
 * the Home page (Create Plan) and the Add Program page.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. GRAB HTML ELEMENTS
  // We look for the IDs defined in your HTML forms.
  const programSearchInput = document.getElementById("programSearch");
  const searchResultsContainer = document.getElementById("searchResults");
  const urlInput = document.getElementById("url");

  // If this page doesn't have a search bar (like the graph page), stop the script here.
  if (!programSearchInput) return;

  // We detect which submit button exists depending on what page we are on.
  const scrapeButton = document.getElementById("scrapeButton");
  const addProgramButton = document.getElementById("addProgramButton");
  const submitButton = scrapeButton || addProgramButton; // Uses whichever one it finds

  const demoButton = document.getElementById("demoButton");

  // 2. SET UP VARIABLES
  let programsList = []; // Will hold the data from programs.json
  let fuse; // Will hold the Fuse.js search engine instance
  let selectedResultIndex = -1; // Tracks which dropdown item is highlighted via keyboard

  // Disable the submit button initially so users can't submit an empty search
  if (submitButton) submitButton.disabled = true;

  // Optional: If you ever add the Demo button back, this allows submitting without a URL
  if (demoButton) {
    demoButton.addEventListener("click", () => {
      urlInput.required = false;
    });
  }

  // 3. FETCH DATA FUNCTION
  // This loads your programs.json file so we have something to search through.
  async function fetchPrograms() {
    try {
      // Fetching from the standard Flask static route
      const response = await fetch("/static/json/programs.json");
      if (!response.ok)
        throw new Error(`HTTP error! status: ${response.status}`);

      const programsData = await response.json();

      // Transform the JSON object into an Array that Fuse.js can easily search
      programsList = Object.keys(programsData).map((name) => ({
        name: name,
        url: programsData[name],
      }));

      // Initialize the Fuse search engine with rules
      fuse = new Fuse(programsList, {
        keys: ["name"], // Search only the 'name' field
        includeScore: true, // Give results a match score
        threshold: 0.4, // How strict the match needs to be (0.0 is perfect, 1.0 is anything)
        ignoreLocation: true,
        distance: 100,
        minCharLength: 3, // Wait until 3 characters are typed before searching
      });
    } catch (error) {
      console.error("Could not fetch or parse programs.json:", error);
      if (submitButton) submitButton.disabled = true;
    }
  }

  // 4. DISPLAY RESULTS FUNCTION
  // This takes the results from Fuse.js and builds the HTML dropdown menu
  function displayResults(results) {
    searchResultsContainer.innerHTML = ""; // Clear old results
    selectedResultIndex = -1;

    // If no results are found, tell the user and hide the dropdown
    if (results.length === 0) {
      if (programSearchInput.value) {
        searchResultsContainer.innerHTML = "<div>No programs found.</div>";
        searchResultsContainer.style.display = "block";
      } else {
        searchResultsContainer.style.display = "none";
      }
      if (submitButton) submitButton.disabled = true;
      urlInput.value = "";
      return;
    }

    // Loop through the search results and create a <div> for each one
    results.forEach((result, index) => {
      const program = result.item;
      const div = document.createElement("div");
      div.textContent = program.name;
      div.setAttribute("data-index", index);

      // When a user CLICKS a result in the dropdown:
      div.addEventListener("click", () => {
        programSearchInput.value = program.name; // Fill the search bar with the name
        urlInput.value = program.url; // Secretly fill the hidden URL input
        searchResultsContainer.innerHTML = ""; // Clear the dropdown
        searchResultsContainer.style.display = "none"; // Hide the dropdown
        if (submitButton) submitButton.disabled = false; // Enable the "Visualize" button!
      });

      searchResultsContainer.appendChild(div);
    });

    searchResultsContainer.style.display = "block"; // Show the dropdown
  }

  // 5. EVENT LISTENERS

  // When the user TYPES in the search bar
  programSearchInput.addEventListener("input", async () => {
    if (submitButton) submitButton.disabled = true;
    urlInput.value = "";

    // If the data hasn't loaded yet, load it now
    if (!fuse) {
      await fetchPrograms();
      if (!fuse) return;
    }

    const query = programSearchInput.value.trim();
    if (!query) {
      searchResultsContainer.innerHTML = "";
      searchResultsContainer.style.display = "none";
      return;
    }

    // Run the search and display the results
    const fuseResults = fuse.search(query);
    displayResults(fuseResults);
  });

  // When the user uses KEYBOARD ARROWS in the search bar
  programSearchInput.addEventListener("keydown", function (event) {
    const resultItems =
      searchResultsContainer.querySelectorAll("div[data-index]");
    if (
      searchResultsContainer.style.display !== "block" ||
      resultItems.length === 0
    ) {
      if (event.key === "Enter" && submitButton && submitButton.disabled) {
        event.preventDefault(); // Stop form from submitting if nothing is selected
      }
      return;
    }

    let newSelectedFound = false;

    // Arrow Down
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (selectedResultIndex < resultItems.length - 1) selectedResultIndex++;
      else selectedResultIndex = 0; // Loop back to top
      newSelectedFound = true;
    }
    // Arrow Up
    else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (selectedResultIndex > 0) selectedResultIndex--;
      else selectedResultIndex = resultItems.length - 1; // Loop back to bottom
      newSelectedFound = true;
    }
    // Enter Key
    else if (event.key === "Enter") {
      event.preventDefault();
      if (selectedResultIndex !== -1 && resultItems[selectedResultIndex]) {
        resultItems[selectedResultIndex].click(); // Simulate clicking the selected item
      }
    }
    // Escape Key
    else if (event.key === "Escape") {
      event.preventDefault();
      searchResultsContainer.style.display = "none";
    }

    // Highlight the currently selected item
    if (newSelectedFound) {
      resultItems.forEach((item) => item.classList.remove("selected"));
      if (resultItems[selectedResultIndex]) {
        resultItems[selectedResultIndex].classList.add("selected");
        resultItems[selectedResultIndex].scrollIntoView({ block: "nearest" });
      }
    }
  });

  // Hide dropdown if the user clicks anywhere else on the page
  document.addEventListener("click", function (event) {
    if (
      !programSearchInput.contains(event.target) &&
      !searchResultsContainer.contains(event.target)
    ) {
      searchResultsContainer.style.display = "none";
    }
  });

  // 6. INITIALIZATION
  // Load the program data as soon as the page loads
  fetchPrograms();
});
