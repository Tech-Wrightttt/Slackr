import { db } from '../db';
import type { ReportKind, ReportRecord } from '../db/schema';
import { getSupabase } from './supabaseClient';

/**
 * Bug reports and content flags.
 *
 * Every report is saved to IndexedDB first, so reporting works offline and nothing is lost if
 * sending fails. `flush()` then sends queued reports to the Supabase `bug_reports` table
 * (insert-only for the public anon key; only the admin can read them). In local/offline mode,
 * or before Supabase is configured, reports simply wait on the device.
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

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

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
    const supabase = await getSupabase();
    if (!supabase) return 0;
    const queued = await db.reports.where('status').equals('queued').toArray();
    let sent = 0;
    for (const r of queued) {
      const { error } = await supabase.from('bug_reports').insert({
        client_id: r.clientId,
        kind: r.kind,
        question_id: r.questionId ?? null,
        category: r.category,
        message: r.message,
        context: r.context,
        created_at: r.createdAt,
      });
      // 23505 = already on the server from an earlier attempt whose response was lost
      if (error && error.code !== '23505') break;
      await db.reports.update(r.id!, { status: 'sent', sentAt: new Date().toISOString() });
      sent++;
    }
    return sent;
  }

  static async list(): Promise<ReportRecord[]> {
    return db.reports.orderBy('createdAt').reverse().toArray();
  }
}
