/**
 * Simple drawn PlayStation-style face button glyphs (cross, circle, square, triangle): a round dark badge with a coloured
 * shape. Plain geometry only, no logos.
 */
export type GlyphName = 'cross' | 'circle' | 'square' | 'triangle';

const SHAPES: Readonly<Record<GlyphName, string>> = {
  cross: '<path d="M20 20 L44 44 M44 20 L20 44" fill="none" stroke="#6fb1ff" stroke-width="7" stroke-linecap="round"/>',
  circle: '<circle cx="32" cy="32" r="13" fill="none" stroke="#ff6f7d" stroke-width="7"/>',
  square: '<rect x="19" y="19" width="26" height="26" rx="2" fill="none" stroke="#ff9ad5" stroke-width="7" stroke-linejoin="round"/>',
  triangle: '<path d="M32 17 L47 43 H17 Z" fill="none" stroke="#5fd9a0" stroke-width="6.5" stroke-linejoin="round"/>',
};

export function padGlyph(name: GlyphName): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" class="pad-glyph" data-glyph="${name}"><circle cx="32" cy="32" r="29" fill="#2b3550" stroke="#fff" stroke-width="3"/>${SHAPES[name]}</svg>`;
}
