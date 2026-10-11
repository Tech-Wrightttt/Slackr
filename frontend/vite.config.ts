import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Direct static server for PelNETS exam diagrams:
 * Serves /files/* directly from backend/data/pelnets/Files with zero latency,
 * whether the Python backend is running or not.
 */
function serveDiagramFiles(): Plugin {
  const filesDir = path.resolve(__dirname, '../backend/data/pelnets/Files');
  return {
    name: 'serve-diagram-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/files/')) {
          const rawName = req.url.slice('/files/'.length).split('?')[0];
          const fileName = decodeURIComponent(rawName);
          const fullPath = path.join(filesDir, fileName);

          if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
            const ext = path.extname(fullPath).toLowerCase();
            const mime =
              ext === '.png'
                ? 'image/png'
                : ext === '.jpg' || ext === '.jpeg'
                ? 'image/jpeg'
                : ext === '.svg'
                ? 'image/svg+xml'
                : ext === '.gif'
                ? 'image/gif'
                : 'application/octet-stream';
            res.setHeader('Content-Type', mime);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            fs.createReadStream(fullPath).pipe(res);
            return;
          }
        }
        next();
      });
    },
  };
}

function serveLearningResources(): Plugin {
  const jsonPath = path.resolve(__dirname, 'public/data/learning_resources.json');
  const backendJsonPath = path.resolve(__dirname, '../backend/data/learning_resources.json');

  return {
    name: 'serve-learning-resources',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/learning-resources')) {
          if (req.method === 'GET') {
            if (fs.existsSync(jsonPath)) {
              res.setHeader('Content-Type', 'application/json');
              fs.createReadStream(jsonPath).pipe(res);
              return;
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ topics: {}, questions: {} }));
              return;
            }
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
                if (fs.existsSync(path.dirname(backendJsonPath))) {
                  fs.writeFileSync(backendJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'success', message: 'Saved to learning_resources.json' }));
              } catch (e: any) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

function serveAnalyticalBreakdowns(): Plugin {
  const jsonPath = path.resolve(__dirname, 'public/data/analytical_breakdowns.json');
  const backendJsonPath = path.resolve(__dirname, '../backend/data/analytical_breakdowns.json');

  return {
    name: 'serve-analytical-breakdowns',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/api/analytical-breakdowns')) {
          if (req.method === 'GET') {
            if (fs.existsSync(jsonPath)) {
              res.setHeader('Content-Type', 'application/json');
              fs.createReadStream(jsonPath).pipe(res);
              return;
            } else {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ questions: {} }));
              return;
            }
          }
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const parsed = JSON.parse(body);
                fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
                if (fs.existsSync(path.dirname(backendJsonPath))) {
                  fs.writeFileSync(backendJsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
                }
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ status: 'success', message: 'Saved to analytical_breakdowns.json' }));
              } catch (e: any) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: e.message }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

/**
 * Emits dist/asset-manifest.json listing every built file (hashed JS/CSS/fonts),
 * so the service worker and the "Download offline" action can cache the full app.
 */
function emitAssetManifest(): Plugin {
  return {
    name: 'emit-asset-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => `/${f}`);
      this.emitFile({
        type: 'asset',
        fileName: 'asset-manifest.json',
        source: JSON.stringify({ version: Date.now().toString(36), assets }, null, 2),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    serveDiagramFiles(),
    serveLearningResources(),
    serveAnalyticalBreakdowns(),
    emitAssetManifest(),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
