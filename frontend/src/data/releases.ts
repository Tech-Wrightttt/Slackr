/**
 * Release notes shown on the News page, newest first.
 * When you ship a version: bump `version` in package.json, then add an entry at the top here.
 */
export interface Release {
  version: string; // e.g. '1.1.0'
  date: string; // YYYY-MM-DD
  title: string;
  changes: { type: 'new' | 'improved' | 'fixed'; text: string }[];
}

export const RELEASES: Release[] = [];
