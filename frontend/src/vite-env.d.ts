/// <reference types="vite/client" />

// Public build-time configuration. Only VITE_* variables reach the browser bundle,
// so never define a secret (e.g. the Supabase service-role key) with this prefix.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** `version` from package.json, injected at build time by vite.config.ts */
declare const __APP_VERSION__: string;
