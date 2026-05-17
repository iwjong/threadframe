const form = document.getElementById("login-form");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("login-error");
const params = new URLSearchParams(window.location.search);
const returnTo = params.get("return") || "/";

function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

async function checkAlreadyAuthorized() {
  try {
    const res = await fetch("/api/status", { credentials: "same-origin" });
    const data = await res.json();
    if (data.viewerAuthorized || !data.viewerRequired) {
      window.location.replace(returnTo);
    }
  } catch {
    // ignore
  }
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError("");
  const password = passwordInput?.value || "";
  try {
    const res = await fetch("/api/viewer-login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.error || "Sign in failed.");
      return;
    }
    window.location.replace(returnTo);
  } catch {
    showError("Network error. Try again.");
  }
});

checkAlreadyAuthorized();
