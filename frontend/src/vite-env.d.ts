/// <reference types="vite/client" />

// Public build-time configuration. Only VITE_* variables reach the browser bundle,
// so never define a secret (e.g. the Supabase service-role key) with this prefix.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
