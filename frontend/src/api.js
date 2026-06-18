function getHeaders(isJson = false) {
  const headers = {};
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }
  const token = localStorage.getItem("token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export async function getHealth() {
  const r = await fetch("/calstud/api/health", { headers: getHeaders() });
  if (!r.ok) throw new Error("Backend offline");
  return r.json();
}

export async function getPageCount(file) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch("/calstud/api/pagecount", { 
    method: "POST", 
    body: form,
    headers: getHeaders()
  });
  if (!r.ok) return 1;
  const d = await r.json();
  return d.page_count ?? 1;
}

export async function previewFile(file, page = 0) {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`/calstud/api/preview?page=${page}`, { 
    method: "POST", 
    body: form,
    headers: getHeaders()
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || "Preview failed");
  }
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

export async function extractFile(file, page = null) {
  const form = new FormData();
  form.append("file", file);
  const url = page !== null ? `/calstud/api/extract?page=${page}` : "/calstud/api/extract";
  const r = await fetch(url, { 
    method: "POST", 
    body: form,
    headers: getHeaders()
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || "Extraction failed");
  }
  return r.json();
}

// --- Authentication Operations ---

export async function login(username, password) {
  const r = await fetch("/calstud/api/auth/login", {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Login failed" }));
    throw new Error(err.detail || "Login failed");
  }
  const data = await r.json();
  localStorage.setItem("token", data.token);
  return data.user;
}

export async function register(username, password) {
  const r = await fetch("/calstud/api/auth/register", {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Registration failed" }));
    throw new Error(err.detail || "Registration failed");
  }
  return r.json();
}

export async function logout() {
  try {
    await fetch("/calstud/api/auth/logout", {
      method: "POST",
      headers: getHeaders()
    });
  } catch (e) {
    // Ignore error on logout
  }
  localStorage.removeItem("token");
}

export async function getCurrentUser() {
  const token = localStorage.getItem("token");
  if (!token) return null;
  const r = await fetch("/calstud/api/auth/me", { headers: getHeaders() });
  if (!r.ok) {
    localStorage.removeItem("token");
    return null;
  }
  return r.json();
}

// --- History Operations ---

export async function getHistory() {
  const r = await fetch("/calstud/api/history", { headers: getHeaders() });
  if (!r.ok) {
    throw new Error("Failed to load history");
  }
  return r.json();
}

export async function getHistoryItem(id) {
  const r = await fetch(`/calstud/api/history/${id}`, { headers: getHeaders() });
  if (!r.ok) {
    throw new Error("Failed to load history item");
  }
  return r.json();
}

export async function deleteHistoryItem(id) {
  const r = await fetch(`/calstud/api/history/${id}`, { 
    method: "DELETE",
    headers: getHeaders() 
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Failed to delete item" }));
    throw new Error(err.detail || "Failed to delete item");
  }
  return r.json();
}

// --- User Management Operations ---

export async function getUsers() {
  const r = await fetch("/calstud/api/users", { headers: getHeaders() });
  if (!r.ok) {
    throw new Error("Failed to load user list");
  }
  return r.json();
}

export async function createUser(username, password, role) {
  const r = await fetch("/calstud/api/users", {
    method: "POST",
    headers: getHeaders(true),
    body: JSON.stringify({ username, password, role })
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Failed to create user" }));
    throw new Error(err.detail || "Failed to create user");
  }
  return r.json();
}

export async function deleteUser(id) {
  const r = await fetch(`/calstud/api/users/${id}`, {
    method: "DELETE",
    headers: getHeaders()
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Failed to delete user" }));
    throw new Error(err.detail || "Failed to delete user");
  }
  return r.json();
}

export async function updateUser(id, password, role) {
  const payload = {};
  if (password) payload.password = password;
  if (role) payload.role = role;

  const r = await fetch(`/calstud/api/users/${id}`, {
    method: "PUT",
    headers: getHeaders(true),
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: "Failed to update user" }));
    throw new Error(err.detail || "Failed to update user");
  }
  return r.json();
}
