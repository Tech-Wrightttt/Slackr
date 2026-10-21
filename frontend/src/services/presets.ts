import { CUSTOM_SETS_KEY, CUSTOM_SET_CODES_KEY } from '../db';

/**
 * Playlists saved on this device (the Custom Builder's presets): name -> question IDs, plus the
 * share code of each one this user shared online. Private until shared; copies saved from
 * someone else's code are private copies with no code.
 */

const read = <T,>(key: string): Record<string, T> => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the change lasts until the page closes
  }
};

/** Planning estimate shown next to a set's size */
export const MINUTES_PER_QUESTION = 1.5;

export interface LocalPlaylist {
  name: string;
  ids: string[];
  code?: string;
}

export const Presets = {
  list(): LocalPlaylist[] {
    const sets = read<string[]>(CUSTOM_SETS_KEY);
    const codes = read<string>(CUSTOM_SET_CODES_KEY);
    return Object.entries(sets).map(([name, ids]) => ({ name, ids, code: codes[name] }));
  },

  has: (name: string) => name in read<string[]>(CUSTOM_SETS_KEY),

  /** A name not taken yet: "Name", then "Name (2)", "Name (3)", ... */
  freeName(base: string): string {
    const sets = read<string[]>(CUSTOM_SETS_KEY);
    const name = base.trim() || 'Playlist';
    if (!(name in sets)) return name;
    let n = 2;
    while (`${name} (${n})` in sets) n++;
    return `${name} (${n})`;
  },

  /** Saving over an existing name keeps its share code (the shared copy stays as it was). */
  save(name: string, ids: string[]) {
    write(CUSTOM_SETS_KEY, { ...read<string[]>(CUSTOM_SETS_KEY), [name]: ids });
  },

  remove(name: string) {
    const sets = read<string[]>(CUSTOM_SETS_KEY);
    delete sets[name];
    write(CUSTOM_SETS_KEY, sets);
    this.setCode(name, null);
  },

  setCode(name: string, code: string | null) {
    const codes = read<string>(CUSTOM_SET_CODES_KEY);
    if (code) codes[name] = code;
    else delete codes[name];
    write(CUSTOM_SET_CODES_KEY, codes);
  },
};
