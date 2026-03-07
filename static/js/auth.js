const supabaseClient = window.supabaseClient;

document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements: Auth Modal ---
  const loginBtn = document.getElementById("loginBtn");
  const authModal = document.getElementById("authModal");
  const closeModal = document.getElementById("closeModal");
  const authMessage = document.getElementById("authMessage");
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");

  // --- DOM Elements: Toggle Mode ---
  const authTitle = document.getElementById("authTitle");
  const primaryAuthBtn = document.getElementById("primaryAuthBtn");
  const authSwitchText = document.getElementById("authSwitchText");
  const authSwitchLink = document.getElementById("authSwitchLink");

  // --- DOM Elements: Profile Menu ---
  const loggedInMenu = document.getElementById("loggedInMenu");
  const profileBtn = document.getElementById("profileBtn");
  const logoutActionBtn = document.getElementById("logoutActionBtn");

  let isLoginMode = true; // State variable for the form

  // 1. Toggle UI between Log In and Sign Up
  authSwitchLink.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    authMessage.textContent = "";

    if (isLoginMode) {
      authTitle.textContent = "Log In";
      primaryAuthBtn.textContent = "Log In";
      authSwitchText.textContent = "Don't have an account?";
      authSwitchLink.textContent = "Sign Up";
      if (forgotPasswordBtn) forgotPasswordBtn.style.display = "inline-block"; // Show Forgot
    } else {
      authTitle.textContent = "Sign Up";
      primaryAuthBtn.textContent = "Create Account";
      authSwitchText.textContent = "Already have an account?";
      authSwitchLink.textContent = "Log In";
      if (forgotPasswordBtn) forgotPasswordBtn.style.display = "none"; // Hide Forgot
    }
  });

  // 2. Open / Close Modal
  loginBtn.addEventListener("click", () => {
    authModal.style.display = "flex";
    authMessage.textContent = "";
  });

  closeModal.addEventListener("click", () => {
    authModal.style.display = "none";
  });

  // 3. Profile Dropdown Logic
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Prevent window click from immediately closing it
    loggedInMenu.classList.toggle("active");
  });

  window.addEventListener("click", (e) => {
    // Close dropdown if clicking outside
    if (loggedInMenu && !loggedInMenu.contains(e.target)) {
      loggedInMenu.classList.remove("active");
    }
    // Close modal if clicking outside
    if (e.target === authModal) {
      authModal.style.display = "none";
    }
  });

  // 4. Google Login
  document
    .getElementById("googleLoginBtn")
    .addEventListener("click", async () => {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.href },
      });
      if (error) authMessage.textContent = error.message;
    });

  // Handle Forgot Password
  if (forgotPasswordBtn) {
    forgotPasswordBtn.addEventListener("click", async () => {
      const email = emailInput.value.trim();

      if (!email) {
        authMessage.style.color = "var(--error-text)";
        authMessage.textContent =
          "Please enter your email above to receive a reset link.";
        return;
      }

      authMessage.style.color = "var(--text-main)";
      authMessage.textContent = "Sending reset link...";

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + "/reset_password",
      });

      if (error) {
        authMessage.style.color = "var(--error-text)";
        authMessage.textContent = error.message;
      } else {
        authMessage.style.color = "#28a745"; // Success green
        authMessage.textContent =
          "Check your email for the password reset link!";
      }
    });
  }

  // 5. Handle Main Email Auth Button
  primaryAuthBtn.addEventListener("click", async (e) => {
    e.preventDefault(); // no page refresh to not remove the graph

    const email = emailInput.value;
    const password = passwordInput.value;
    if (!email || !password)
      return (authMessage.textContent =
        "Please enter both email and password.");

    authMessage.style.color = "var(--error-text)"; // reset to error color
    primaryAuthBtn.disabled = true;

    if (isLoginMode) {
      authMessage.textContent = "Logging in...";
      const { error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        authMessage.textContent = "Invalid login credentials.";
      } else {
        authMessage.style.color = "#28a745"; // success green
        authMessage.textContent = "Success! You are now logged in.";
        setTimeout(() => {
          authModal.style.display = "none";
          emailInput.value = ""; // Clear inputs for security
          passwordInput.value = "";
        }, 1000);
      }
    } else {
      authMessage.textContent = "Creating account...";
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        authMessage.textContent = error.message;
      } else {
        authMessage.style.color = "#28a745"; // success green
        authMessage.textContent = "Success! You are now logged in.";
        setTimeout(() => {
          authModal.style.display = "none";

          emailInput.value = ""; // Clear inputs for security
          passwordInput.value = "";
        }, 1500);
      }
    }

    primaryAuthBtn.disabled = false;
  });

  // 6. Handle Log Out Action
  logoutActionBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();

    // Smart Redirect: If looking at a graph, kick to home
    const currentPath = window.location.pathname;
    if (currentPath.includes("graph") || currentPath.includes("saved_graphs")) {
      window.location.href = "/";
    }
  });
});

// 7. Global Auth State Listener (With Flask Syncing)
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  const loginBtn = document.getElementById("loginBtn");
  const loggedInMenu = document.getElementById("loggedInMenu");
  const userEmailDisplay = document.getElementById("userEmailDisplay");
  const authModal = document.getElementById("authModal");

  if (session) {
    // UI Updates
    if (loginBtn) loginBtn.style.display = "none";
    if (loggedInMenu) {
      loggedInMenu.style.display = "inline-block";
      if (userEmailDisplay) userEmailDisplay.textContent = session.user.email;
    }
    if (authModal) authModal.style.display = "none";

    // --- SYNC WITH FLASK ---
    // If they just signed in, send the token to Flask securely
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
      await fetch("/sync_auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: session.access_token }),
      });
    }
  } else {
    // UI Updates
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (loggedInMenu) {
      loggedInMenu.style.display = "none";
      loggedInMenu.classList.remove("active");
    }

    // --- CLEAR FLASK SESSION ---
    if (event === "SIGNED_OUT") {
      await fetch("/clear_auth", { method: "POST" });
    }
  }
});
