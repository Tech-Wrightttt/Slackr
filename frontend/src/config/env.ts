// Single source for public runtime configuration (see .env.example).

/** Companion FastAPI origin. Empty = same origin (`/api/*`), which is the Vercel and Vite-proxy setup. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

// Online accounts, sync and bug reports go through the FastAPI backend (/api/account, /api/reports).
// No Supabase URL or key is ever bundled into the browser app.
