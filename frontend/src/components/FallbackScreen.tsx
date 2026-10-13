import React from 'react';
import { Mascot, type MascotPose } from './Mascot';

export interface FallbackAction {
  label: string;
  icon: string;
  href?: string; // plain link, so it works even when the router itself has failed
  onClick?: () => void;
  primary?: boolean;
}

// Full-height recovery screen shared by the 404 page and the crash boundary
export const FallbackScreen: React.FC<{
  pose: MascotPose;
  code: string;
  title: string;
  message: string;
  actions: FallbackAction[];
  children?: React.ReactNode;
}> = ({ pose, code, title, message, actions, children }) => (
  <div className="min-h-[70vh] w-full flex items-center justify-center px-4 py-12">
    <div className="w-full max-w-md flex flex-col items-center text-center gap-5 enter-rise">
      <Mascot pose={pose} className="h-36 w-36 sm:h-44 sm:w-44" />
      <div className="flex flex-col gap-2">
        <p className="font-mono-code text-sm font-semibold text-primary tabular-nums">{code}</p>
        <h1 className="font-display-lg text-2xl sm:text-3xl font-bold tracking-tight text-on-surface text-balance">
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-on-surface-variant text-pretty">{message}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {actions.map((a) => {
          const cls = `press-scale min-h-[44px] inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold cursor-pointer ${
            a.primary
              ? 'bg-primary text-on-primary hover:bg-primary-container'
              : 'border border-outline-variant/40 bg-surface-container text-on-surface hover:bg-surface-container-high'
          }`;
          const inner = (
            <>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                {a.icon}
              </span>
              {a.label}
            </>
          );
          return a.href ? (
            <a key={a.label} href={a.href} className={cls}>
              {inner}
            </a>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={cls}>
              {inner}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  </div>
);
