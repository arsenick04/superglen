import type { QuizEngine } from '../quiz/QuizEngine';
import type { AudioManager } from './AudioManager';

/** Pause between the spoken prompt and the foreign word / animal sound that follows it (ms). */
const GAP_MS = 250;

/**
 * Connects the quiz to the voice files. The question flow: the selected quiz host reads the prompt, then (for `speak` questions) the foreign
 * word, or (for `sound` questions) the animal sound plays once the prompt is over. The repeat button asks for the same
 * sequence again. A newer prompt or a Nino feedback line cuts everything that is still queued. Missing files are skipped
 * (the audio manager logs them once); the panel shows the text anyway.
 */
export function wireQuizVoice(quiz: QuizEngine, audio: AudioManager): void {
  let gen = 0;
  let chain: Promise<void> = Promise.resolve();
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
  const deviceAara = (text: string, generation: number): Promise<void> => new Promise((resolve) => {
    if (audio.silent || document.hidden || !('speechSynthesis' in window)) return resolve();
    window.speechSynthesis.cancel();
    const spoken = new SpeechSynthesisUtterance(text);
    spoken.lang = 'id-ID';
    // Aara is deliberately brighter and younger than the neutral/Nino device fallback.
    spoken.rate = 1.05;
    spoken.pitch = 1.38;
    const indonesianVoices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('id'));
    const indonesian = indonesianVoices.find((voice) => /female|woman|gadis|damayanti/i.test(voice.name)) ?? indonesianVoices.at(-1);
    if (indonesian) spoken.voice = indonesian;
    const done = (): void => {
      if (generation === gen) audio.setExternalVoiceActive(false);
      resolve();
    };
    spoken.onend = done;
    spoken.onerror = done;
    audio.setExternalVoiceActive(true);
    window.speechSynthesis.speak(spoken);
  });
  quiz.onSpeak((id, _text, kind) => {
    if (kind === 'prompt' || kind === 'nino') {
      const g = ++gen;
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      audio.setExternalVoiceActive(false);
      // Host feedback must not wait behind anything; a prompt starts the chain the words hang on.
      chain = audio.playVoice(id).then(async (r) => {
        if (g !== gen) return;
        if (r.played) return r.ended;
        // The forest quiz has its own Aara recordings. Device speech is a robust fallback while an asset is missing.
        if (id.startsWith('aara_')) return deviceAara(_text, g);
      });
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
