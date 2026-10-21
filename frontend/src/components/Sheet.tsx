import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  title: React.ReactNode;
  /** Small line under the title (item ID, count, ...) */
  subtitle?: React.ReactNode;
  icon?: string;
  onClose: () => void;
  /** Tailwind max width from the sm breakpoint up */
  size?: 'md' | 'lg' | 'xl';
  /** Pinned under the scrolling body (actions) */
  footer?: React.ReactNode;
  /** Extra keys handled while the sheet has focus (arrow navigation, ...) */
  onKeyDown?: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
}

const WIDTH = { md: 'sm:max-w-md', lg: 'sm:max-w-2xl', xl: 'sm:max-w-3xl' } as const;

/**
 * Bottom sheet on phones, centered dialog on tablets and desktops (same look as ReportDialog).
 * Traps focus, locks page scroll, closes on Esc or backdrop, and returns focus to the trigger.
 */
export const Sheet: React.FC<SheetProps> = ({ title, subtitle, icon, onClose, size = 'md', footer, onKeyDown, children }) => {
  const uid = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (dialog?.querySelector<HTMLElement>('[data-autofocus]') ?? dialog?.querySelector<HTMLElement>('button'))?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      trigger?.focus?.();
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Keep keys inside: quiz pages behind listen for letters, digits and Enter
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    onKeyDown?.(e);
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]'
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

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4">
      <div className="sheet-backdrop absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        onKeyDown={handleKeyDown}
        className={`sheet-dialog relative w-full ${WIDTH[size]} max-h-[92dvh] sm:max-h-[88dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-outline-variant/40 bg-surface-container-lowest shadow-2xl`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <span className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-outline-variant/60" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 px-5 pt-3 sm:pt-4 pb-3 border-b border-outline-variant/20">
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && (
              <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={`${uid}-title`} className="text-sm font-semibold text-on-surface truncate">
                {title}
              </h2>
              {subtitle && <p className="font-mono-code text-[11px] text-on-surface-variant truncate">{subtitle}</p>}
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="border-t border-outline-variant/20 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body
  );
};
