import { execSync } from 'node:child_process';

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
 * Build id guard: emits `version.json` ({ "id": "<build id>" }) into dist/ and serves it in dev, so a tab or cached
 * index.html from an older build can notice it is stale (see src/core/VersionGuard.ts).
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
  };
}
