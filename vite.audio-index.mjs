import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Availability manifest of the voice / sound files: `audio/index.json`, a plain array of ids.
 * It lists every `public/audio/<id>.mp3` as "<id>" and every mp3 / m4a / ogg below `public/audio/music/` as "music/<file>"
 * (plus "music/tracks.json" when present). The game reads it once at startup so it never asks for a file that is not
 * there (a 404 would show up as a console error). Nothing is written to `public/`: the file is served by the dev server
 * and emitted into `dist/` by the build, always from what is on disk at that moment.
 */
export function audioIndexPlugin() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'public/audio');
  const AUDIO = /\.(mp3|m4a|ogg)$/i;
  const scan = () => {
    const ids = [];
    try {
      for (const f of fs.readdirSync(dir)) {
        if (/\.mp3$/i.test(f)) ids.push(f.replace(/\.mp3$/i, ''));
      }
    } catch {
      // no public/audio yet
    }
    try {
      for (const f of fs.readdirSync(path.join(dir, 'music'))) {
        if (AUDIO.test(f) || f === 'tracks.json') ids.push(`music/${f}`);
      }
    } catch {
      // no music folder yet
    }
    return ids.sort();
  };
  return {
    name: 'superglen-audio-index',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (!url.endsWith('/audio/index.json')) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(scan()));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'audio/index.json', source: JSON.stringify(scan()) });
    },
  };
}

