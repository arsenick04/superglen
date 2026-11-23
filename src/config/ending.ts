/** The ending after the last fire: credit roll over the final frame of the sky cinematic (numbers and texts in one place). */
export const Ending = {
  /** Cinematic id (public/cinematics/cin_ending.mp4; a sky gradient replaces it when the file is missing). */
  cinematic: 'ending',
  /** The roll: one centred line at a time that rises slowly; the voice-over id is played when the line starts (if the clip exists). */
  lines: [
    { id: 'credit_daddy_1', text: 'Dari Daddy, untuk Glen.', kind: 'head' },
    { id: 'credit_daddy_2', text: 'Glen, bermimpilah dan berimajinasilah sepuas kamu.', kind: 'text' },
    { id: 'credit_daddy_3', text: 'Superglen telah membuktikan bahwa mimpi dan imajinasi kamu menjadi superhero bisa kita wujudkan.', kind: 'text' },
  ] as readonly { id: string; text: string; kind: 'head' | 'text' }[],
  /** Title card before the first line and the closing card after the last (no voice). */
  titleText: 'SUPERGLEN',
  titleSeconds: 4.6,
  endText: 'Tamat',
  endSeconds: 4.2,
  /** Credit music: public/audio/music/credits.mp3 (scene 'kredit'; missing file = silence). Fade in at the start, fade out at the end (s). */
  musicFadeIn: 3,
  musicFadeOut: 3.5,
  /** Shortest time a line stays visible (s): about 4 to 5 s so a parent can read it comfortably. */
  minLineSeconds: 4.6,
  /** Time a line stays when there is no voice clip (s); longer lines get more through `secondsPerChar`. */
  fallbackLineSeconds: 5.4,
  secondsPerChar: 0.045,
  /** With a clip: the line stays until the clip ends plus this (s). */
  voiceTailSeconds: 1.2,
  /** Fade in / fade out of one line (s). */
  fadeSeconds: 1.1,
  /** Pause between two lines (s) and after the last one before the room changes. */
  gapSeconds: 0.7,
  endHoldSeconds: 2.6,
  /** How far a line rises while it is visible, as a fraction of the screen height (starts below the centre, ends above it). */
  riseFraction: 0.16,
} as const;
