const TOKEN_KEY = "ca_access";
const REFRESH_KEY = "ca_refresh";

export const storeTokens = (tokens) => {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
};

export const clearTokens = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let refreshing = null;

async function doFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 401 && !options._retry && getRefreshToken()) {
    if (!refreshing) {
      refreshing = (async () => {
        const r = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: getRefreshToken() }),
        });
        if (r.ok) {
          const j = await r.json();
          storeTokens(j.data.tokens);
        } else {
          clearTokens();
        }
      })().finally(() => (refreshing = null));
    }
    await refreshing;
    if (getToken()) return doFetch(path, { ...options, _retry: true });
  }

  if (res.status === 401) {
    clearTokens();
  }

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error || json?.detail || json?.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json?.success !== undefined ? json.data ?? json : json;
}

export function api(path, options) {
  return doFetch(`/api${path}`, options);
}

export function formPost(path, formData) {
  return doFetch(`/api${path}`, { method: "POST", body: formData });
}

export function fmtDate(iso, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) + (withTime ? ` ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : "");
}
