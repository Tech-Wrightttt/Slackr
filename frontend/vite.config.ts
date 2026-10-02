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

export default defineConfig({
  plugins: [serveDiagramFiles(), tailwindcss(), react()],
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
