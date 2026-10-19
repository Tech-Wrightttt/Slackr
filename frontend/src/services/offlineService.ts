import { useStore, OFFLINE_STATE_KEY, type OfflinePhase } from '../store/useStore';

// Must stay in sync with public/sw.js
export const OFFLINE_CACHES = {
  app: 'slackr-app-v7',
  data: 'slackr-data-v3',
  images: 'slackr-images-v2',
  fonts: 'slackr-fonts-v1',
} as const;

const LEGACY_IMAGE_CACHES = ['slackr-images-v1'];

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/brand/logo-light.png',
  '/brand/logo-dark.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-48.png',
  '/image-list.json',
];

const DATA_ASSETS = [
  '/data/questions_index.json',
  '/data/metadata_summary.json',
  '/data/learning_resources.json',
  '/data/analytical_breakdowns.json',
];

const CONCURRENCY = 8;

interface Task {
  url: string;
  cache: string;
  phase: OfflinePhase;
  /** Re-download even if already cached (unhashed files that can change between deploys) */
  refresh?: boolean;
  init?: RequestInit;
}

let runningDownload: Promise<void> | null = null;

const isOk = (res: Response) => res.ok || res.type === 'opaque';

async function readAssetManifest(): Promise<{ version: string | null; assets: string[] }> {
  try {
    const res = await fetch('/asset-manifest.json', { cache: 'no-store' });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type.includes('json')) {
      const json = await res.json();
      return { version: json.version ?? null, assets: (json.assets || []).filter((a: string) => a !== '/asset-manifest.json') };
    }
  } catch (_) {}
  // Dev server has no build manifest; cache whatever scripts/styles the page has loaded
  const loaded = performance
    .getEntriesByType('resource')
    .map((e) => new URL(e.name))
    .filter((u) => u.origin === location.origin && /\.(js|css|woff2?|ttf)$/.test(u.pathname))
    .map((u) => u.pathname);
  return { version: null, assets: Array.from(new Set(loaded)) };
}

async function readDiagramList(): Promise<string[]> {
  try {
    const res = await fetch('/image-list.json', { cache: 'no-store' });
    if (res.ok) return (await res.json()).images || [];
  } catch (_) {}
  return [];
}

async function collectFontTasks(): Promise<Task[]> {
  const links = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href*="fonts.googleapis.com"]')
  );
  const cache = await caches.open(OFFLINE_CACHES.fonts);
  const tasks: Task[] = [];
  for (const link of links) {
    try {
      // CORS fetch so we can read the CSS and discover the font files it points to
      const res = await fetch(link.href, { mode: 'cors' });
      if (!res.ok) continue;
      const css = await res.text();
      await cache.put(link.href, new Response(css, { headers: { 'Content-Type': 'text/css' } }));
      for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)'"]+)\)/g)) {
        tasks.push({ url: m[1], cache: OFFLINE_CACHES.fonts, phase: 'fonts', init: { mode: 'cors' } });
      }
    } catch (_) {}
  }
  return tasks;
}

async function runPool(tasks: Task[], onDone: (task: Task, ok: boolean) => void) {
  const openCaches = new Map<string, Cache>();
  const getCache = async (name: string) => {
    if (!openCaches.has(name)) openCaches.set(name, await caches.open(name));
    return openCaches.get(name)!;
  };

  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      let ok = false;
      try {
        const cache = await getCache(task.cache);
        if (!task.refresh && (await cache.match(task.url))) {
          ok = true;
        } else {
          const res = await fetch(task.url, { cache: task.refresh ? 'reload' : 'default', ...task.init });
          if (isOk(res)) {
            await cache.put(task.url, res);
            ok = true;
          }
        }
      } catch (_) {}
      onDone(task, ok);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

const PHASE_LABEL: Record<OfflinePhase, string> = {
  app: 'Saving app files',
  fonts: 'Saving fonts & icons',
  data: 'Saving question bank',
  diagrams: 'Saving exam diagrams',
};

export class OfflineService {
  static isSupported(): boolean {
    return typeof window !== 'undefined' && 'caches' in window;
  }

  static isServiceWorkerActive(): boolean {
    return !!navigator.serviceWorker?.controller;
  }

  /**
   * Download everything the app needs to run with no connection:
   * build assets, fonts/icon font, the question bank JSON and every exam diagram.
   * Safe to call repeatedly — concurrent calls share one run, cached diagrams are skipped.
   */
  static downloadEverything(): Promise<void> {
    if (runningDownload) return runningDownload;
    runningDownload = this.run().finally(() => {
      runningDownload = null;
    });
    return runningDownload;
  }

  private static async run(): Promise<void> {
    const set = useStore.getState().setOfflineDownload;

    if (!this.isSupported()) {
      set({ status: 'error', message: 'This browser does not support offline storage.' });
      return;
    }
    if (!navigator.onLine) {
      set({ status: 'error', message: 'You are offline. Connect to the internet to download.' });
      return;
    }

    set({ status: 'downloading', phase: 'app', done: 0, total: 0, failed: 0, message: 'Preparing download…' });

    try {
      // Ask the browser not to evict our caches under storage pressure
      await navigator.storage?.persist?.().catch(() => false);

      const [manifest, diagrams, fontTasks] = await Promise.all([
        readAssetManifest(),
        readDiagramList(),
        collectFontTasks(),
      ]);

      const tasks: Task[] = [
        ...SHELL_ASSETS.map((url) => ({ url, cache: OFFLINE_CACHES.app, phase: 'app' as const, refresh: true })),
        ...manifest.assets.map((url) => ({ url, cache: OFFLINE_CACHES.app, phase: 'app' as const })),
        ...fontTasks,
        ...DATA_ASSETS.map((url) => ({ url, cache: OFFLINE_CACHES.data, phase: 'data' as const, refresh: true })),
        ...diagrams.map((url) => ({ url, cache: OFFLINE_CACHES.images, phase: 'diagrams' as const })),
      ];

      let done = 0;
      let failed = 0;
      let failedCore = 0;
      let lastPaint = 0;
      set({ total: tasks.length, message: PHASE_LABEL.app });

      await runPool(tasks, (task, ok) => {
        done++;
        if (!ok) {
          failed++;
          if (task.phase !== 'diagrams' && task.phase !== 'fonts') failedCore++;
        }
        // Throttle store updates so 2,400+ completions don't re-render the UI thousands of times
        const now = performance.now();
        if (now - lastPaint > 120 || done === tasks.length) {
          lastPaint = now;
          set({ done, failed, phase: task.phase, message: PHASE_LABEL[task.phase] });
        }
      });

      if (failedCore > 0) {
        set({
          status: 'error',
          message: `${failedCore} core app files could not be saved. Check your connection and try again.`,
        });
        return;
      }

      const completedAt = new Date().toISOString();
      localStorage.setItem(
        OFFLINE_STATE_KEY,
        JSON.stringify({ completedAt, version: manifest.version, failed })
      );

      const devNote = import.meta.env.DEV ? ' Offline mode runs in the built app (bun run build && bun run preview).' : '';
      set({
        status: 'ready',
        phase: null,
        completedAt,
        failed,
        message:
          (failed > 0
            ? `Ready offline. ${failed} diagram${failed === 1 ? '' : 's'} could not be saved.`
            : 'Everything is saved. SLACKR now works fully offline.') + devNote,
      });
    } catch (err: any) {
      set({ status: 'error', message: `Download failed: ${err?.message || 'unknown error'}` });
    }
  }

  /**
   * After a redeploy the hashed JS/CSS filenames change. If the user previously went offline-ready,
   * quietly re-cache the new build so the next offline launch still works.
   */
  static async refreshAppShellIfStale(): Promise<void> {
    if (!this.isSupported() || !navigator.onLine) return;
    let saved: { completedAt?: string; version?: string | null } | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(OFFLINE_STATE_KEY) || 'null');
    } catch (_) {}
    if (!saved?.completedAt) return;

    const manifest = await readAssetManifest();
    if (!manifest.version || manifest.version === saved.version) return;

    const tasks: Task[] = [
      ...SHELL_ASSETS.map((url) => ({ url, cache: OFFLINE_CACHES.app, phase: 'app' as const, refresh: true })),
      ...manifest.assets.map((url) => ({ url, cache: OFFLINE_CACHES.app, phase: 'app' as const })),
      ...DATA_ASSETS.map((url) => ({ url, cache: OFFLINE_CACHES.data, phase: 'data' as const, refresh: true })),
    ];
    let failed = 0;
    await runPool(tasks, (_t, ok) => { if (!ok) failed++; });
    if (failed === 0) {
      localStorage.setItem(OFFLINE_STATE_KEY, JSON.stringify({ ...saved, version: manifest.version }));
    }
  }

  static async countCachedDiagrams(): Promise<number> {
    if (!this.isSupported()) return 0;
    const cache = await caches.open(OFFLINE_CACHES.images);
    return (await cache.keys()).length;
  }

  static async clearDiagrams(): Promise<void> {
    await Promise.all([OFFLINE_CACHES.images, ...LEGACY_IMAGE_CACHES].map((n) => caches.delete(n)));
    localStorage.removeItem(OFFLINE_STATE_KEY);
    useStore.getState().setOfflineDownload({
      status: 'idle', phase: null, done: 0, total: 0, failed: 0, completedAt: null,
      message: 'Diagram cache cleared. Download again to study diagrams offline.',
    });
  }
}
