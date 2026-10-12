import React from 'react';
import { PASSWORD_RULES, passwordProblem } from '../services/passwordPolicy';

/** Live checklist under a new-password field. Rules come from services/passwordPolicy.ts. */
export const PasswordChecklist: React.FC<{ password: string; username?: string; id?: string }> = ({ password, username, id }) => {
  const extra = PASSWORD_RULES.every((r) => r.test(password)) ? passwordProblem(password, username) : null;
  return (
    <div id={id} className="flex flex-col gap-1.5">
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1" aria-label="Password requirements">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li
              key={rule.id}
              className={`flex items-center gap-1.5 font-mono-code text-[11px] transition-colors duration-150 ${
                ok ? 'text-mastery-emerald' : 'text-on-surface-variant/80'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                {ok ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>
                {rule.label}
                <span className="sr-only">{ok ? ' (met)' : ' (missing)'}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {extra && <p className="font-mono-code text-[11px] text-error">{extra}</p>}
    </div>
  );
};
