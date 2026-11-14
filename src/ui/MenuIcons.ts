/** Icons of the settings panel (white on a coloured button; the child recognises them, the parent reads the short label). */
const svg = (inner: string): string => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
const S = 'fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"';

export const MenuIcons = {
  music: svg(`<path d="M24 46 V14 L50 8 V40" ${S}/><circle cx="18" cy="48" r="8" fill="#fff"/><circle cx="44" cy="42" r="8" fill="#fff"/>`),
  speaker: svg(`<path d="M8 24 H20 L34 12 V52 L20 40 H8 Z" fill="#fff"/><path d="M43 22 Q51 32 43 42 M50 14 Q64 32 50 50" ${S} stroke-width="5"/>`),
  map: svg(`<path d="M6 14 L22 8 L42 14 L58 8 V50 L42 56 L22 50 L6 56 Z" fill="#fff" fill-opacity="0.25" ${S} stroke-width="4"/><path d="M22 8 V50 M42 14 V56" ${S} stroke-width="4"/>`),
  home: svg(`<path d="M8 32 L32 10 L56 32" ${S}/><path d="M16 30 V54 H48 V30" ${S}/><path d="M27 54 V38 H37 V54" ${S} stroke-width="4"/>`),
  safe: svg(`<path d="M32 6 L54 14 V32 Q54 48 32 58 Q10 48 10 32 V14 Z" fill="#fff" fill-opacity="0.25" ${S} stroke-width="5"/><path d="M21 32 L29 40 L44 24" ${S} stroke-width="6"/>`),
  save: svg(`<path d="M8 16 Q8 8 16 8 H44 L56 20 V48 Q56 56 48 56 H16 Q8 56 8 48 Z" fill="#fff" fill-opacity="0.25" ${S} stroke-width="4"/><rect x="18" y="8" width="20" height="14" rx="2" fill="#fff"/><rect x="16" y="34" width="32" height="22" rx="3" fill="#fff"/>`),
  load: svg(`<path d="M32 8 V40 M18 28 L32 42 L46 28" ${S}/><path d="M10 44 V54 H54 V44" ${S}/>`),
  restart: svg(`<path d="M50 32 A18 18 0 1 1 42 17" ${S}/><path d="M36 8 L46 18 L34 24" ${S} stroke-width="5"/>`),
  close: svg(`<path d="M16 16 L48 48 M48 16 L16 48" ${S} stroke-width="9"/>`),
  yes: svg(`<path d="M13 34 L27 48 L52 18" ${S} stroke-width="10"/>`),
  no: svg(`<path d="M16 16 L48 48 M48 16 L16 48" ${S} stroke-width="9"/>`),
};
