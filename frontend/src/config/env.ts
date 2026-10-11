// Single source for public runtime configuration (see .env.example).

/** Companion FastAPI origin. Empty = same origin (`/api/*`), which is the Vercel and Vite-proxy setup. */
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
/** Public anon key: safe in the browser because row-level security guards every table. */
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '';
