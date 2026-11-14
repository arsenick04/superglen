/**
 * CHAPTER 4 "Sosok Misterius" (detective mode): where things stand in the city and the dialog lines (PURE DATA, no three.js).
 * Positions are on streets or open ground (nothing here needs a collider, so the reach checker has nothing new to prove).
 */

export const AARA = {
  /** Aara waits on the school street, east of the gate where Chapter 1 began; she faces the gate (-x). */
  pos: { x: -17, z: -93, yaw: -Math.PI / 2 },
  /** Arriving this close (m) starts the meeting. */
  arriveRadius: 9,
  /** Where Glen stands for the meeting (a few steps from her, facing her) when he was far away. */
  stage: { x: -22.5, z: -93, yaw: Math.PI / 2 },
} as const;

/** Dialog lines of Chapter 4 (text only for now; the ids are stable so the voice can be added later in audio/dialog.json). */
export const BAB4_LINES = {
  ninoMulai: { id: 'bab4_nino_mulai', speaker: 'nino', text: 'Glen, ayo temui Aara di sekolah. Dia pintar mencari petunjuk!' },
} as const;

export type Bab4Line = (typeof BAB4_LINES)[keyof typeof BAB4_LINES];
