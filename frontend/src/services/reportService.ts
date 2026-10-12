import { db } from '../db';
import type { ReportKind, ReportRecord } from '../db/schema';
import { AccountApi, AccountApiError } from './accountApi';

/**
 * Bug reports and content flags.
 *
 * Every report is saved to IndexedDB first, so reporting works offline and nothing is lost if
 * sending fails. `flush()` then sends queued reports to the backend (`POST /api/reports`), which
 * stores them in the Supabase `bug_reports` table (insert-only; only the admin can read them).
 * Offline, or while the server can't store them, reports simply wait on the device.
 */

export const REPORT_MESSAGE_MAX = 1000;

export const REPORT_CATEGORIES: Record<ReportKind, { id: string; label: string }[]> = {
  question: [
    { id: 'wrong_answer', label: 'Wrong answer key' },
    { id: 'choices', label: 'Choices wrong or missing' },
    { id: 'image', label: 'Missing or broken image' },
    { id: 'typo', label: 'Typo or formatting' },
    { id: 'other', label: 'Something else' },
  ],
  explanation: [
    { id: 'incorrect', label: 'Explanation is wrong' },
    { id: 'unclear', label: 'Hard to follow' },
    { id: 'math', label: 'Broken math or image' },
    { id: 'typo', label: 'Typo or formatting' },
    { id: 'other', label: 'Something else' },
  ],
  general: [
    { id: 'bug', label: 'Something broke' },
    { id: 'layout', label: 'Layout or display' },
    { id: 'offline', label: 'Offline or install' },
    { id: 'idea', label: 'Suggestion' },
    { id: 'other', label: 'Something else' },
  ],
};

export interface NewReport {
  kind: ReportKind;
  questionId?: string;
  category: string;
  message: string;
}

// randomUUID needs a secure context; plain-http LAN testing on a phone falls back to a v4-shaped id
const newClientId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

let flushing: Promise<number> | null = null;

export class ReportService {
  /** Saves the report on the device, then tries to send it. Resolves to whether it was sent now. */
  static async submit(report: NewReport): Promise<{ sent: boolean }> {
    const record: ReportRecord = {
      clientId: newClientId(),
      kind: report.kind,
      questionId: report.questionId,
      category: report.category,
      message: report.message.trim().slice(0, REPORT_MESSAGE_MAX),
      context: {
        appVersion: __APP_VERSION__,
        path: window.location.pathname,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        displayMode: isStandalone() ? 'standalone' : 'browser',
        userAgent: navigator.userAgent,
        online: navigator.onLine,
      },
      createdAt: new Date().toISOString(),
      status: 'queued',
    };
    const id = await db.reports.add(record);
    await ReportService.flush();
    return { sent: (await db.reports.get(id))?.status === 'sent' };
  }

  /** Sends every queued report. Safe to call often: concurrent calls share one run. */
  static flush(): Promise<number> {
    flushing ??= ReportService.sendQueued().finally(() => {
      flushing = null;
    });
    return flushing;
  }

  private static async sendQueued(): Promise<number> {
    if (!navigator.onLine) return 0;
    const queued = await db.reports.where('status').equals('queued').toArray();
    let sent = 0;
    for (const r of queued) {
      try {
        await AccountApi.submitReport({
          client_id: r.clientId,
          kind: r.kind,
          question_id: r.questionId ?? null,
          category: r.category,
          message: r.message,
          context: r.context,
          created_at: r.createdAt,
        });
      } catch (err) {
        // An id from an older app version the server rejects: give it a valid one and retry next flush
        if (err instanceof AccountApiError && err.status === 422) {
          await db.reports.update(r.id!, { clientId: newClientId() });
          continue;
        }
        break; // offline, backend down or not configured: keep the rest queued
      }
      await db.reports.update(r.id!, { status: 'sent', sentAt: new Date().toISOString() });
      sent++;
    }
    return sent;
  }

  static async list(): Promise<ReportRecord[]> {
    return db.reports.orderBy('createdAt').reverse().toArray();
  }
}
