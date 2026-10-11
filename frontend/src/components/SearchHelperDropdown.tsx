import React, { useEffect, useId, useRef, useState } from 'react';
import type { ParsedQuery } from '../services/searchEngine';

type HintId = 'exact' | 'paste';

const HINTS: { id: HintId; title: string; subtitle: string; badge: React.ReactNode }[] = [
  {
    id: 'exact',
    title: 'Exact phrases',
    subtitle: 'Wrap words in "quotes"',
    badge: <span className="font-mono-code text-base font-bold leading-none translate-y-[3px]">""</span>,
  },
  {
    id: 'paste',
    title: 'Paste a whole question',
    subtitle: 'We find it and highlight the match',
    badge: <span className="material-symbols-outlined text-[18px]">content_paste</span>,
  },
];

const PASTE_FALLBACK = 'Clipboard access was blocked. Press Ctrl+V (⌘V on Mac) to paste into the search box.';

interface SearchHelperDropdownProps {
  id: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (hint: HintId) => void;
}

/** Floating listbox of search tips. Keyboard handling lives on the owning combobox input. */
export const SearchHelperDropdown: React.FC<SearchHelperDropdownProps> = ({
  id,
  activeIndex,
  onActiveIndexChange,
  onSelect,
}) => (
  <div className="search-popover absolute left-0 top-full z-30 mt-2 w-full sm:w-[22rem] rounded-2xl border border-outline-variant/30 bg-surface-container-low p-1.5 shadow-2xl">
    <div className="px-3 pt-1.5 pb-1 font-label-caps text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant">
      Search tips
    </div>
    <ul id={id} role="listbox" aria-label="Search tips" className="flex flex-col gap-0.5">
      {HINTS.map((hint, i) => (
        <li
          key={hint.id}
          id={`${id}-${hint.id}`}
          role="option"
          aria-selected={i === activeIndex}
          // Keep focus in the input so the popover doesn't close before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(i)}
          onClick={() => onSelect(hint.id)}
          className={`search-hint flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${
            i === activeIndex ? 'bg-surface-container-high' : ''
          }`}
        >
          <span className="search-hint-badge flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border">
            {hint.badge}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-bold text-on-surface">{hint.title}</span>
            <span className="search-hint-subtitle truncate font-mono-code text-xs">{hint.subtitle}</span>
          </span>
        </li>
      ))}
    </ul>
    <div className="mt-1 hidden items-center gap-3 border-t border-outline-variant/20 px-3 pt-2 pb-1 font-mono-code text-[10px] text-on-surface-variant/70 sm:flex">
      <span>↑↓ navigate</span>
      <span>↵ select</span>
      <span>esc close</span>
    </div>
  </div>
);

interface AdvancedSearchInputProps {
  value: string;
  onChange: (value: string, opts?: { immediate?: boolean }) => void;
  parsed: ParsedQuery;
  /** When the current query has results, the tips get out of the way. */
  hasResults: boolean;
  placeholder?: string;
}

/** Search box (ARIA combobox) with the tips popover, exact-phrase insertion and clipboard paste. */
export const AdvancedSearchInput: React.FC<AdvancedSearchInputProps> = ({
  value,
  onChange,
  parsed,
  hasResults,
  placeholder = 'Search questions, IDs, or paste a whole question…',
}) => {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const pastedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  // null = automatic (open while empty or nothing matches); otherwise the user's explicit choice.
  const [override, setOverride] = useState<'open' | 'closed' | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [notice, setNotice] = useState<string | null>(null);

  const autoOpen = value.trim() === '' || !hasResults;
  const open = focused && (override ? override === 'open' : autoOpen);

  useEffect(() => {
    if (!open) setActiveIndex(-1);
  }, [open]);

  const focusAt = (caret: number) => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    });
  };

  const insertQuotes = () => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    onChange(`${before}${pad}"${selected}"${value.slice(end)}`);
    focusAt(before.length + pad.length + 1 + selected.length);
  };

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.readText) {
      setNotice(PASTE_FALLBACK);
      inputRef.current?.focus();
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).replace(/\s+/g, ' ').trim();
      if (!text) {
        setNotice('Your clipboard is empty. Copy a question first, then try again.');
        return;
      }
      setNotice(null);
      onChange(text, { immediate: true });
      focusAt(text.length);
    } catch {
      setNotice(PASTE_FALLBACK);
      inputRef.current?.focus();
    }
  };

  const runHint = (hint: HintId) => {
    setOverride(null);
    if (hint === 'exact') insertQuotes();
    else void pasteFromClipboard();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      if (!open) {
        setOverride('open');
        setActiveIndex(step === 1 ? 0 : HINTS.length - 1);
      } else {
        setActiveIndex((i) => (i + step + HINTS.length) % HINTS.length);
      }
    } else if (e.key === 'Enter' && open && HINTS[activeIndex]) {
      e.preventDefault();
      runHint(HINTS[activeIndex].id);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOverride('closed');
    }
  };

  const modeChip = parsed.isPastedQuestion
    ? 'Paste match'
    : parsed.exactPhrases.length > 0
      ? `Exact ×${parsed.exactPhrases.length}`
      : null;

  return (
    <div className="relative">
      <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
        search
      </span>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open && HINTS[activeIndex] ? `${listboxId}-${HINTS[activeIndex].id}` : undefined}
        aria-describedby={notice ? `${listboxId}-notice` : undefined}
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          setFocused(true);
          setOverride(null);
        }}
        onBlur={() => setFocused(false)}
        onPaste={() => {
          pastedRef.current = true;
          setNotice(null);
        }}
        onChange={(e) => {
          onChange(e.target.value, { immediate: pastedRef.current });
          pastedRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low py-2 pl-9 pr-32 text-xs font-mono-code text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none"
      />

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
        {modeChip && (
          <span className="rounded-md border border-interactive-sky/30 bg-interactive-sky/10 px-1.5 py-0.5 font-label-caps text-[10px] font-bold uppercase tracking-wider search-hint-subtitle">
            {modeChip}
          </span>
        )}
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onChange('');
              setNotice(null);
              inputRef.current?.focus();
            }}
            className="press-scale flex h-6 w-6 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        )}
      </div>

      {open && (
        <SearchHelperDropdown
          id={listboxId}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
          onSelect={runHint}
        />
      )}

      <p
        id={`${listboxId}-notice`}
        role="status"
        aria-live="polite"
        className={notice ? 'mt-2 flex items-center gap-1.5 search-notice font-mono-code text-[11px]' : 'sr-only'}
      >
        {notice && <span className="material-symbols-outlined text-[14px]">info</span>}
        {notice}
      </p>
    </div>
  );
};
