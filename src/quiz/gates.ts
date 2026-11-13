import type { SkillName } from '../core/Save';
import type { Category } from './types';

/**
 * Chapter 2: which Tantangan Pintar category unlocks which skill ("Energi Pintar" powers the costume). Data, so the mapping
 * can change without touching the story script.
 */
export const SKILL_GATES: Readonly<Record<SkillName, Category>> = {
  fly: 'berhitung',
  laser: 'inggris',
  shield: 'mandarin',
};
