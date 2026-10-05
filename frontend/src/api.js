// Uses the existing FastAPI routes and demo identity headers.
// Set VITE_API_BASE_URL in your existing .env / Azure build configuration.

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();

const API_BASE = (
  configuredBase ||
  (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')
).replace(/\/+$/, '');

const AUDITOR = {
  'X-Role': 'Auditor',
  'X-User-ID': 'AUD-001',
};

const TEAM_LEADER = {
  'X-Role': 'Team Leader',
  'X-User-ID': 'TL-001',
};

function errorMessage(detail, fallback) {
  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => item.msg || 'Invalid request')
      .join('; ');
  }

  return fallback;
}

async function request(path, options = {}) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();

    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        'The API returned an unexpected response. Check VITE_API_BASE_URL.'
      );
    }

    if (!response.ok) {
      throw new Error(
        errorMessage(
          data?.detail,
          `Request failed (${response.status}). Please retry.`
        )
      );
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(
        'The API took too long to respond. Please retry.'
      );
    }

    if (error instanceof TypeError) {
      throw new Error(
        'Cannot reach the API. Check your connection and API configuration.'
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export const getCases = (params = '?limit=500') =>
  request(`/cases${params}`);

export const getAlerts = (params = '?limit=500') =>
  request(`/alerts${params}`);

export const getAudit = () =>
  request('/audit?limit=200', {
    headers: AUDITOR,
  });

export const getSummary = () =>
  request('/summary');

export const getPermissions = () =>
  request('/permissions');

export const getHealth = () =>
  request('/health');

export const getLiveEvents = () =>
  request('/live-events?limit=100');

export const getCase = (id) =>
  request(`/cases/${encodeURIComponent(id)}`);

export const assignCase = (
  id,
  workerId,
  reason
) =>
  request(`/cases/${encodeURIComponent(id)}/assign`, {
    method: 'POST',
    headers: {
      ...TEAM_LEADER,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      worker_id: workerId,
      reason,
    }),
  });

export const resolveCaseAlert = (
  id,
  reason
) =>
  request(
    `/alerts/${encodeURIComponent(id)}/resolve`,
    {
      method: 'PATCH',
      headers: {
        ...TEAM_LEADER,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        resolution: 'Reviewed by Team Leader',
        reason,
      }),
    }
  );