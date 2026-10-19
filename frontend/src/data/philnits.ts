/**
 * Facts about PhilNITS and the FE exam shown on the About PhilNITS page and the dashboard.
 * Source: philnits.org (home page and FAQ), checked 2026-10-19. Update EXAM_DATES when PhilNITS posts new ones.
 */

import { PHILNITS_URL } from './legal';

export { PHILNITS_URL };
export const PHILNITS_FAQ = `${PHILNITS_URL}faq`;
export const ITPEC_SITE = 'https://itpec.org';

/** Upcoming IP and FE exam days as listed on philnits.org (YYYY-MM-DD, Sundays) */
export const EXAM_DATES = ['2026-10-25', '2027-04-25', '2027-10-17'];

export const FE_FEE = '₱2,500';

/** The next listed exam day on or after today, with whole days to go; null once the list runs out */
export const nextExam = (now = new Date()): { date: Date; iso: string; daysLeft: number } | null => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const iso of EXAM_DATES) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y!, m! - 1, d!);
    if (date >= today) return { date, iso, daysLeft: Math.round((date.getTime() - today.getTime()) / 86_400_000) };
  }
  return null;
};

export const formatExamDate = (date: Date) =>
  date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

export const daysLeftLabel = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`);
