import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from '../config/env';

/**
 * The only place SLACKR talks to Supabase.
 *
 * Two modes:
 * - Offline / local: returns null. Callers fall back to IndexedDB and the local
 *   account in AuthService. No Supabase request is ever made, and the SDK is not loaded.
 * - Online: lazily loads the SDK (kept out of the main bundle) and returns one shared client.
 *
 * Only the public anon key is used here. The service-role key belongs to the
 * server (FastAPI env) and must never be referenced from frontend code.
 */
let clientPromise: Promise<SupabaseClient> | null = null;

export const isOnlineMode = () =>
  isSupabaseConfigured && (typeof navigator === 'undefined' || navigator.onLine);

export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!isOnlineMode()) return null;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // SPA with client-side routing: let the SDK pick up magic-link / OAuth tokens from the URL
        detectSessionInUrl: true,
      },
    })
  );
  return clientPromise;
}
