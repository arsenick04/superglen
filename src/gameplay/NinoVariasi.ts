/**
 * Varied praise / retry / cheer lines for Nino (content/nino_variasi.json, voiced as nino_pujian_*, nino_coba_*,
 * nino_semangat_*). `ninoLine(kind)` picks one at random and never the same one twice in a row for that kind.
 */
import data from '../../content/nino_variasi.json';

export type VariasiKind = 'pujian' | 'pujian_kuis' | 'coba_lagi' | 'semangat';

export interface VariasiLine {
  id: string;
  speaker: 'nino';
  text: string;
}

const praise = data.pujian.map((l) => ({ id: l.id, speaker: 'nino' as const, text: l.text }));
const cheers = data.semangat.map((l) => ({ id: l.id, speaker: 'nino' as const, text: l.text }));
const pools: Record<VariasiKind, VariasiLine[]> = {
  // Pure praise only (never mix pre-success encouragement like "hampir sampai" / "pelan-pelan" into right answers).
  pujian: [...praise],
  pujian_kuis: praise.filter((l) => !/sasaran/i.test(l.text)),
  coba_lagi: data.coba_lagi.map((l) => ({ id: l.id, speaker: 'nino' as const, text: l.text })),
  semangat: [...cheers],
};
const last: Partial<Record<VariasiKind, string>> = {};

/** A random line of this kind, different from the previous pick of the same kind. */
export function ninoLine(kind: VariasiKind, rnd: () => number = Math.random): VariasiLine {
  const pool = pools[kind];
  const choices = pool.length > 1 ? pool.filter((l) => l.id !== last[kind]) : pool;
  const pick = choices[Math.min(choices.length - 1, Math.floor(rnd() * choices.length))];
  last[kind] = pick.id;
  return pick;
}

/** Every clip id (to preload the voices). */
export function ninoVariasiIds(): string[] {
  return [...new Set([...pools.pujian, ...pools.coba_lagi, ...pools.semangat].map((l) => l.id))];
}
