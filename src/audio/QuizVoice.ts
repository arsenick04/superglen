import type { QuizEngine } from '../quiz/QuizEngine';
import type { AudioManager } from './AudioManager';

/** Pause between the spoken prompt and the foreign word / animal sound that follows it (ms). */
const GAP_MS = 250;

/**
 * Connects the quiz to the voice files. The question flow: Nino reads the prompt, then (for `speak` questions) the foreign
 * word, or (for `sound` questions) the animal sound plays once the prompt is over. The repeat button asks for the same
 * sequence again. A newer prompt or a Nino feedback line cuts everything that is still queued. Missing files are skipped
 * (the audio manager logs them once); the panel shows the text anyway.
 */
export function wireQuizVoice(quiz: QuizEngine, audio: AudioManager): void {
  let gen = 0;
  let chain: Promise<void> = Promise.resolve();
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  quiz.onSpeak((id, _text, kind) => {
    if (kind === 'prompt' || kind === 'nino') {
      const g = ++gen;
      // Nino's feedback must not wait behind anything; a prompt starts the chain the words hang on.
      chain = audio.playVoice(id).then((r) => (g === gen ? r.ended : undefined));
      return;
    }
    const g = gen;
    chain = chain.then(async () => {
      if (g !== gen) return;
      await wait(GAP_MS);
      if (g !== gen) return;
      const r = kind === 'sound' ? await audio.playSfx(id) : await audio.playVoice(id);
      if (g === gen) await r.ended;
    });
  });
}
