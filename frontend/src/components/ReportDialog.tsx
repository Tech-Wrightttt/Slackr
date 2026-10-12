import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReportKind } from '../db/schema';
import { REPORT_CATEGORIES, REPORT_MESSAGE_MAX, ReportService } from '../services/reportService';
import { useStore } from '../store/useStore';

interface ReportDialogProps {
  kind: ReportKind;
  questionId?: string;
  onClose: () => void;
}

const COPY: Record<ReportKind, { title: string; icon: string; placeholder: string }> = {
  question: {
    title: 'Report a problem with this question',
    icon: 'bug_report',
    placeholder: 'e.g. The answer key says B, but the official answer is C.',
  },
  explanation: {
    title: 'Report a problem with this explanation',
    icon: 'bug_report',
    placeholder: 'e.g. Step 2 uses the wrong formula for the subnet size.',
  },
  general: {
    title: 'Report a bug',
    icon: 'bug_report',
    placeholder: 'What happened, and what did you expect? Steps to repeat it help a lot.',
  },
};

// General reports need words to be useful; flags already say a lot through the category
const MIN_GENERAL_MESSAGE = 10;

/**
 * Bottom sheet on phones, centered dialog on tablets and desktops. Works offline: the report is
 * saved on the device and sent when a connection (and the reporting backend) is available.
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({ kind, questionId, onClose }) => {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<'sent' | 'queued' | 'error' | null>(null);

  const copy = COPY[kind];
  const categories = REPORT_CATEGORIES[kind];
  const needsMessage = kind === 'general' || category === 'other';
  const trimmed = message.trim();
  const messageOk = !needsMessage || trimmed.length >= MIN_GENERAL_MESSAGE;
  const canSubmit = !!category && messageOk && !saving;

  // Focus into the dialog, lock page scroll, and hand focus back to the trigger on close
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (dialog?.querySelector<HTMLElement>('input') ?? dialog?.querySelector<HTMLElement>('button'))?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      trigger?.focus?.();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !category) return;
    setSaving(true);
    try {
      const { sent } = await ReportService.submit({ kind, questionId, category, message: trimmed });
      setResult(sent ? 'sent' : 'queued');
    } catch {
      setResult('error');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keep typing and Enter/Space inside the dialog: the quiz behind it listens for A-F, 1-4 and Enter
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const accountsEnabled = useStore((s) => s.accountsEnabled);
  const queuedNote = !navigator.onLine
    ? "You're offline. It's saved on this device and sends automatically when you reconnect."
    : accountsEnabled
    ? "Couldn't reach the server. It's saved on this device and will retry automatically."
    : 'Saved on this device. It sends automatically once online reporting is available.';

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="sheet-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onKeyDown={handleKeyDown}
        className="sheet-dialog relative w-full sm:max-w-md max-h-[92dvh] sm:max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Grab handle: signals a bottom sheet on phones */}
        <span className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant/60" aria-hidden="true" />

        <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:pt-4 pb-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-error" aria-hidden="true">
              {copy.icon}
            </span>
            <div className="min-w-0">
              <h2 id={`${uid}-title`} className="text-sm font-semibold text-on-surface">
                {copy.title}
              </h2>
              {questionId && (
                <p className="font-mono-code text-[11px] text-on-surface-variant truncate">{questionId}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press-scale w-11 h-11 -mr-2 shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
          </button>
        </div>

        {result ? (
          <div className="px-5 py-8 flex flex-col items-center text-center gap-3" role="status">
            <span
              className={`material-symbols-outlined text-[40px] ${
                result === 'error' ? 'text-error' : result === 'sent' ? 'text-mastery-emerald' : 'text-confidence-amber'
              }`}
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              {result === 'error' ? 'error' : result === 'sent' ? 'check_circle' : 'schedule_send'}
            </span>
            <p className="text-sm font-semibold text-on-surface">
              {result === 'error' ? "Couldn't save the report" : 'Thanks for the report'}
            </p>
            <p className="text-xs text-on-surface-variant max-w-xs">
              {result === 'error'
                ? 'Your browser storage may be full or blocked. Please try again.'
                : result === 'sent'
                ? 'It reached us. Fixes show up in News when they ship.'
                : queuedNote}
            </p>
            <button
              type="button"
              // The form that held focus is gone; keep focus in the dialog so Esc and Tab still work
              autoFocus
              onClick={result === 'error' ? () => setResult(null) : onClose}
              className="press-scale mt-2 min-h-[44px] px-6 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container cursor-pointer"
            >
              {result === 'error' ? 'Try again' : 'Done'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
            <div className="overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-xs font-semibold text-on-surface">What's wrong?</legend>
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                  {categories.map((c) => {
                    const checked = category === c.id;
                    return (
                      <label
                        key={c.id}
                        className={`report-choice flex items-center gap-2.5 min-h-[44px] px-3 rounded-xl border cursor-pointer text-sm ${
                          checked
                            ? 'border-primary bg-primary/10 text-on-surface font-semibold'
                            : 'border-outline-variant/40 bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${uid}-category`}
                          value={c.id}
                          checked={checked}
                          onChange={() => setCategory(c.id)}
                          className="w-4 h-4 shrink-0 accent-[var(--color-primary)]"
                        />
                        <span>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${uid}-message`} className="text-xs font-semibold text-on-surface">
                  Details{' '}
                  <span className="font-normal text-on-surface-variant">{needsMessage ? '(required)' : '(optional)'}</span>
                </label>
                <textarea
                  id={`${uid}-message`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, REPORT_MESSAGE_MAX))}
                  rows={4}
                  maxLength={REPORT_MESSAGE_MAX}
                  placeholder={copy.placeholder}
                  aria-describedby={`${uid}-hint`}
                  aria-invalid={needsMessage && trimmed.length > 0 && !messageOk}
                  className="w-full resize-y min-h-[96px] rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                />
                <div id={`${uid}-hint`} className="flex items-start justify-between gap-3 text-[11px] text-on-surface-variant">
                  <span className={needsMessage && trimmed.length > 0 && !messageOk ? 'text-error' : ''}>
                    {needsMessage
                      ? `At least ${MIN_GENERAL_MESSAGE} characters.`
                      : 'Sent with the app version, page and device type. No account details.'}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {message.length}/{REPORT_MESSAGE_MAX}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-outline-variant/20">
              <button
                type="button"
                onClick={onClose}
                className="press-scale min-h-[44px] px-4 rounded-xl text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="press-scale min-h-[44px] px-5 rounded-xl bg-primary text-on-primary text-sm font-semibold hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {saving ? 'progress_activity' : 'send'}
                </span>
                {saving ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
};
