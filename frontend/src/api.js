const API_BASE = "http://127.0.0.1:8000";

export async function getCases(params = "") {
  const response = await fetch(`${API_BASE}/cases${params}`);

  if (!response.ok) {
    throw new Error("Failed to load cases");
  }

  return response.json();
}

export async function getAlerts(params = "") {
  const response = await fetch(`${API_BASE}/alerts${params}`);

  if (!response.ok) {
    throw new Error("Failed to load alerts");
  }

  return response.json();
}

export async function getAudit() {
  const response = await fetch(`${API_BASE}/audit?limit=20`, {
    headers: {
      "X-Role": "Auditor",
      "X-User-ID": "AUD-001",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to load audit log");
  }

  return response.json();
}