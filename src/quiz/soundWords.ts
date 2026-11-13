/**
 * The word for each animal's sound, shown in a speech bubble next to the speaker icon of a "sound" question when the sound
 * file is missing (or the sound is off), so a child who cannot read yet still has a clue. Keyed by the item key.
 */
const WORDS: Record<string, string> = {
  kucing: 'Meong!',
  anjing: 'Guk guk!',
  sapi: 'Moo!',
  ayam: 'Kukuruyuk!',
  bebek: 'Kwek kwek!',
  kuda: 'Hiiik!',
  singa: 'Auum!',
};

/** The sound word of an animal item ('' when unknown). */
export function soundWord(item: string): string {
  return WORDS[item] ?? '';
}
