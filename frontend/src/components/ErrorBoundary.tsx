import React from 'react';
import { FallbackScreen } from './FallbackScreen';

// A lazy page chunk that failed to download (offline, or a redeploy replaced it) rather than a code bug
const isChunkError = (e: Error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i.test(e.message);

interface State {
  error: Error | null;
}

// Last line of defense: any render crash shows a recovery screen instead of a blank page
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[SLACKR] Unhandled render error', error, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkError(error);
    return (
      <div className="min-h-screen bg-surface-container-lowest text-on-surface font-body-base">
        <FallbackScreen
          pose={chunk ? 'loading' : 'bug'}
          code={chunk ? 'Offline or updated' : 'Something broke'}
          title={chunk ? 'Couldn’t load this part of SLACKR' : 'SLACKR hit an unexpected error'}
          message={
            chunk
              ? 'You may be offline, or a new version was just released. Reload to get the latest files. Your progress is stored on this device and is not lost.'
              : 'This screen crashed. Your answers and progress are stored on this device and are not lost. Reload to try again, or head back to the dashboard.'
          }
          actions={[
            { label: 'Reload', icon: 'refresh', onClick: () => window.location.reload(), primary: true },
            { label: 'Dashboard', icon: 'home', href: '/' },
          ]}
        >
          <details className="w-full text-left rounded-xl bg-surface-container-low border border-outline-variant/30 px-4 py-3 text-xs">
            <summary className="cursor-pointer font-semibold text-on-surface-variant">Technical details</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono-code text-on-surface-variant">
              {error.message}
            </pre>
          </details>
        </FallbackScreen>
      </div>
    );
  }
}
