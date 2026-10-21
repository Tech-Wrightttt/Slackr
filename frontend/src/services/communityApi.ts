import { call } from './accountApi';

/**
 * Shared playlists, the "online now" count and the admin console. Everything goes through
 * SLACKR's FastAPI (`/api/playlists`, `/api/presence`, `/api/admin`), which talks to Supabase.
 * Private playlists never use this: they are the Custom Builder's presets on this device.
 */

export type PlaylistVisibility = 'public' | 'unlisted';

export interface PlaylistSummary {
  code: string;
  title: string;
  description: string;
  question_count: number;
  featured: boolean;
  owner_name: string | null;
  created_at: string;
}

export interface Playlist {
  code: string;
  title: string;
  description: string;
  question_ids: string[];
  visibility: PlaylistVisibility;
  featured: boolean;
  owner_name: string | null;
  created_at: string;
}

export interface MyPlaylist {
  code: string;
  title: string;
  question_count: number;
  visibility: PlaylistVisibility;
  created_at: string;
}

export interface OnlineNow {
  total: number;
  guests: number;
  users: Array<{ username: string; last_seen: string }>;
}

/** Most questions one shared playlist can hold (also enforced by the backend and database) */
export const MAX_PLAYLIST_QUESTIONS = 500;

/** Codes are 6 letters/digits; people paste them with spaces, dashes or in lowercase */
export const normalizeCode = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
export const isPlaylistCode = (raw: string) => /^[A-Z0-9]{6}$/.test(normalizeCode(raw));

export const PlaylistApi = {
  listPublic: () => call<{ playlists: PlaylistSummary[] }>('GET', '/api/playlists').then((r) => r.playlists),

  mine: () => call<{ playlists: MyPlaylist[] }>('GET', '/api/playlists/mine').then((r) => r.playlists),

  byCode: (code: string) =>
    call<{ playlist: Playlist }>('GET', `/api/playlists/${encodeURIComponent(normalizeCode(code))}`).then((r) => r.playlist),

  share: (body: { title: string; description: string; question_ids: string[]; visibility: PlaylistVisibility }) =>
    call<{ code: string }>('POST', '/api/playlists', body).then((r) => r.code),

  remove: (code: string) => call<{ ok: boolean }>('DELETE', `/api/playlists/${encodeURIComponent(code)}`),
};

export const AdminApi = {
  me: () => call<{ admin: boolean; configured: boolean; supabase: boolean }>('GET', '/api/admin/me'),
  login: (username: string, password: string) => call<{ admin: boolean }>('POST', '/api/admin/login', { username, password }),
  logout: () => call<{ admin: boolean }>('POST', '/api/admin/logout'),
  online: () => call<OnlineNow>('GET', '/api/admin/online'),
  playlists: () => call<{ playlists: Playlist[] }>('GET', '/api/admin/playlists').then((r) => r.playlists),
  savePlaylist: (body: {
    code?: string;
    title: string;
    description: string;
    question_ids: string[];
    visibility: PlaylistVisibility;
    featured: boolean;
  }) => call<{ code: string }>('POST', '/api/admin/playlists', body).then((r) => r.code),
  deletePlaylist: (code: string) => call<{ ok: boolean }>('DELETE', `/api/admin/playlists/${encodeURIComponent(code)}`),
};
