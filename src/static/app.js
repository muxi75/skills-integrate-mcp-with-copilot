document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");
  const authStatus = document.getElementById("auth-status");
  const authButton = document.getElementById("auth-button");
  const logoutButton = document.getElementById("logout-button");
  const authNote = document.getElementById("auth-note");
  const formTitle = document.getElementById("form-title");
  const emailInput = document.getElementById("email");
  const activityInput = document.getElementById("activity");
  const submitButton = document.getElementById("submit-button");
  const loginDialog = document.getElementById("login-dialog");
  const loginForm = document.getElementById("login-form");
  const loginError = document.getElementById("login-error");
  const loginCloseButton = document.getElementById("login-close");

  const authState = {
    authenticated: false,
    user: null,
  };

  function setMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.className = type;
    messageDiv.classList.remove("hidden");

    window.clearTimeout(setMessage.hideTimer);
    setMessage.hideTimer = window.setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  function setLoginError(text) {
    loginError.textContent = text;
    loginError.classList.toggle("hidden", !text);
  }

  function openLoginDialog() {
    setLoginError("");
    loginForm.reset();
    loginDialog.setAttribute("aria-hidden", "false");
    loginDialog.classList.remove("hidden");
  }

  function closeLoginDialog() {
    loginDialog.setAttribute("aria-hidden", "true");
    loginDialog.classList.add("hidden");
  }

  function applyAuthState() {
    const isAuthenticated = authState.authenticated;
    authStatus.textContent = isAuthenticated
      ? `Logged in as ${authState.user.username} (${authState.user.role})`
      : "Read-only mode";
    authButton.textContent = isAuthenticated ? "Teacher Menu" : "Teacher Login";
    logoutButton.classList.toggle("hidden", !isAuthenticated);
    authNote.textContent = isAuthenticated
      ? "You can now register or remove students from activities."
      : "Teacher login is required to register or remove students.";
    formTitle.textContent = isAuthenticated
      ? "Register a Student"
      : "Teacher Access Required";
    emailInput.disabled = !isAuthenticated;
    activityInput.disabled = !isAuthenticated;
    submitButton.disabled = !isAuthenticated;
    signupForm.classList.toggle("locked", !isAuthenticated);
    signupForm.setAttribute(
      "aria-disabled",
      isAuthenticated ? "false" : "true"
    );
  }

  async function fetchAuth() {
    try {
      const response = await fetch("/auth/me");
      const result = await response.json();

      authState.authenticated = Boolean(result.authenticated);
      authState.user = result.user;
      applyAuthState();
    } catch (error) {
      authState.authenticated = false;
      authState.user = null;
      applyAuthState();
      console.error("Error fetching auth status:", error);
    }
  }

  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;
        const canManage = authState.authenticated;

        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${canManage ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">Remove</button>` : ""}</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <div class="activity-card-header">
            <div>
              <h4>${name}</h4>
              <p>${details.description}</p>
            </div>
            <span class="availability-pill">${spotsLeft} spots left</span>
          </div>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/unregister?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message, "success");
        fetchActivities();
      } else {
        setMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setMessage("Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!authState.authenticated) {
      setMessage("Teacher login is required before registering students.", "error");
      openLoginDialog();
      return;
    }

    const email = emailInput.value.trim();
    const activity = activityInput.value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        { method: "POST" }
      );

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message, "success");
        signupForm.reset();
        fetchActivities();
      } else {
        setMessage(result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setMessage("Failed to register student. Please try again.", "error");
      console.error("Error signing up:", error);
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok) {
        closeLoginDialog();
        setMessage(result.message, "success");
        await fetchAuth();
        await fetchActivities();
      } else {
        setLoginError(result.detail || "Login failed");
      }
    } catch (error) {
      setLoginError("Unable to reach the server. Please try again.");
      console.error("Error logging in:", error);
    }
  });

  authButton.addEventListener("click", () => {
    if (authState.authenticated) {
      setMessage("You are already logged in as teacher/admin.", "info");
    } else {
      openLoginDialog();
    }
  });

  logoutButton.addEventListener("click", async () => {
    try {
      const response = await fetch("/auth/logout", { method: "POST" });
      const result = await response.json();
      setMessage(result.message, "info");
      authState.authenticated = false;
      authState.user = null;
      applyAuthState();
      await fetchActivities();
    } catch (error) {
      setMessage("Unable to log out. Please try again.", "error");
      console.error("Error logging out:", error);
    }
  });

  loginCloseButton.addEventListener("click", closeLoginDialog);
  loginDialog.addEventListener("click", (event) => {
    if (event.target === loginDialog) {
      closeLoginDialog();
    }
  });

  fetchAuth().then(fetchActivities);
});
