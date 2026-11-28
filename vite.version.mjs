import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Build id: git short hash + timestamp (unique per build). */
export function makeBuildId() {
  let hash = 'nogit';
  try {
    hash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || hash;
  } catch {
    // not a git checkout
  }
  const t = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return `${hash}-${t}`;
}

/**
 * Build id guard: emits `version.json` ({ "id": "<build id>" }) into dist/, stamps `dist/sw.js` so PWA caches
 * invalidate automatically on every deploy, and serves `version.json` in dev (see src/core/VersionGuard.ts).
 */
export function versionPlugin(id) {
  const body = JSON.stringify({ id });
  return {
    name: 'superglen-version',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.endsWith('/version.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body });
    },
    writeBundle(opts) {
      const sw = path.join(opts.dir ?? 'dist', 'sw.js');
      if (fs.existsSync(sw)) {
        fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replaceAll('__BUILD_ID__', id));
      }
    },
  };
}
