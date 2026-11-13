import type { Category, Choice, ChoiceId, Display, Question, QuizItem } from './types';

/**
 * Tiny built-in sample bank, used per category only while src/data/quiz/<category>.json is missing or empty
 * (so the game always builds and runs). Not meant as content: the real bank is written by the content pipeline.
 */
export const FALLBACK_ITEMS: Readonly<Record<string, QuizItem>> = {
  apple: { id: 'apple', label: 'apel', emoji: '🍎', en: 'apple', zh: '苹果', pinyin: 'píng guǒ' },
  star: { id: 'star', label: 'bintang', emoji: '⭐', en: 'star', zh: '星星', pinyin: 'xīng xing' },
  ball: { id: 'ball', label: 'bola', emoji: '⚽', en: 'ball', zh: '球', pinyin: 'qiú' },
  fish: { id: 'fish', label: 'ikan', emoji: '🐟', en: 'fish', zh: '鱼', pinyin: 'yú' },
  cat: { id: 'cat', label: 'kucing', emoji: '🐱', en: 'cat', zh: '猫', pinyin: 'māo' },
  dog: { id: 'dog', label: 'anjing', emoji: '🐶', en: 'dog', zh: '狗', pinyin: 'gǒu' },
  cow: { id: 'cow', label: 'sapi', emoji: '🐮', en: 'cow', zh: '牛', pinyin: 'niú' },
  duck: { id: 'duck', label: 'bebek', emoji: '🦆', en: 'duck', zh: '鸭子', pinyin: 'yā zi' },
  sun: { id: 'sun', label: 'matahari', emoji: '☀️', en: 'sun', zh: '太阳', pinyin: 'tài yáng' },
  book: { id: 'book', label: 'buku', emoji: '📖', en: 'book', zh: '书', pinyin: 'shū' },
};

type C = Pick<Choice, 'item' | 'text' | 'lang' | 'pinyin'>;
const ids: ChoiceId[] = ['a', 'b', 'c'];

function q(id: string, category: Category, level: 1 | 2 | 3, prompt: string, display: Display, choices: [C, C, C], answer: 0 | 1 | 2): Question {
  return {
    id: `fb_${id}`,
    category,
    level,
    prompt,
    audio_id: `quiz_fb_${id}`,
    display,
    choices: choices.map((c, i) => ({ id: ids[i], ...c })) as Question['choices'],
    answer: ids[answer],
  };
}
const n = (v: number): C => ({ text: String(v) });
const it = (item: string): C => ({ item });
const tx = (text: string, lang?: string, pinyin?: string): C => ({ text, lang, pinyin });

export const FALLBACK_QUESTIONS: Readonly<Record<Category, Question[]>> = {
  berhitung: [
    q('b1', 'berhitung', 1, 'Ada berapa apel?', { kind: 'count', item: 'apple', count: 3 }, [n(2), n(3), n(4)], 1),
    q('b2', 'berhitung', 1, 'Ada berapa bintang?', { kind: 'count', item: 'star', count: 5 }, [n(4), n(6), n(5)], 2),
    q('b3', 'berhitung', 1, 'Ada berapa bola?', { kind: 'count', item: 'ball', count: 4 }, [n(4), n(3), n(5)], 0),
    q('b4', 'berhitung', 2, 'Berapa semuanya?', { kind: 'sum', a: { item: 'apple', count: 2 }, b: { item: 'apple', count: 1 } }, [n(2), n(4), n(3)], 2),
    q('b5', 'berhitung', 2, 'Berapa hasilnya?', { kind: 'equation', text: '2 + 3 = ?' }, [n(4), n(5), n(6)], 1),
    q('b6', 'berhitung', 3, 'Berapa hasilnya?', { kind: 'equation', text: '7 - 3 = ?' }, [n(4), n(3), n(5)], 0),
    q('b7', 'berhitung', 3, 'Berapa semuanya?', { kind: 'sum', a: { item: 'fish', count: 3 }, b: { item: 'fish', count: 4 } }, [n(8), n(6), n(7)], 2),
  ],
  inggris: [
    q('e1', 'inggris', 1, 'Mana yang "cat"?', { kind: 'speak', text: 'cat', lang: 'en', speak_audio_id: 'quiz_fb_say_cat' }, [it('dog'), it('cat'), it('fish')], 1),
    q('e2', 'inggris', 1, 'Mana yang "dog"?', { kind: 'speak', text: 'dog', lang: 'en', speak_audio_id: 'quiz_fb_say_dog' }, [it('dog'), it('cow'), it('cat')], 0),
    q('e3', 'inggris', 2, 'Mana yang "apple"?', { kind: 'speak', text: 'apple', lang: 'en', speak_audio_id: 'quiz_fb_say_apple' }, [it('ball'), it('star'), it('apple')], 2),
    q('e4', 'inggris', 2, 'Ini dalam bahasa Inggris apa?', { kind: 'picture', item: 'ball' }, [tx('bell', 'en'), tx('ball', 'en'), tx('bag', 'en')], 1),
    q('e5', 'inggris', 3, 'Ini dalam bahasa Inggris apa?', { kind: 'picture', item: 'sun' }, [tx('sun', 'en'), tx('sand', 'en'), tx('sea', 'en')], 0),
    q('e6', 'inggris', 3, 'Mana yang "book"?', { kind: 'speak', text: 'book', lang: 'en', speak_audio_id: 'quiz_fb_say_book' }, [it('book'), it('duck'), it('fish')], 0),
  ],
  mandarin: [
    q('m1', 'mandarin', 1, 'Mana yang 猫?', { kind: 'speak', text: '猫', lang: 'zh', pinyin: 'māo', speak_audio_id: 'quiz_fb_say_mao' }, [it('dog'), it('cat'), it('cow')], 1),
    q('m2', 'mandarin', 1, 'Mana yang 鱼?', { kind: 'speak', text: '鱼', lang: 'zh', pinyin: 'yú', speak_audio_id: 'quiz_fb_say_yu' }, [it('fish'), it('duck'), it('ball')], 0),
    q('m3', 'mandarin', 2, 'Mana yang 太阳?', { kind: 'speak', text: '太阳', lang: 'zh', pinyin: 'tài yáng', speak_audio_id: 'quiz_fb_say_taiyang' }, [it('star'), it('book'), it('sun')], 2),
    q('m4', 'mandarin', 2, 'Ini dalam bahasa Mandarin apa?', { kind: 'picture', item: 'dog' }, [tx('猫', 'zh', 'māo'), tx('狗', 'zh', 'gǒu'), tx('牛', 'zh', 'niú')], 1),
    q('m5', 'mandarin', 3, 'Ini dalam bahasa Mandarin apa?', { kind: 'picture', item: 'book' }, [tx('书', 'zh', 'shū'), tx('鱼', 'zh', 'yú'), tx('球', 'zh', 'qiú')], 0),
    q('m6', 'mandarin', 3, 'Mana yang 苹果?', { kind: 'speak', text: '苹果', lang: 'zh', pinyin: 'píng guǒ', speak_audio_id: 'quiz_fb_say_pingguo' }, [it('apple'), it('ball'), it('sun')], 0),
  ],
  hewan: [
    q('h1', 'hewan', 1, 'Binatang apa ini?', { kind: 'picture', item: 'cow' }, [tx('sapi'), tx('bebek'), tx('ikan')], 0),
    q('h2', 'hewan', 1, 'Siapa bayangan ini?', { kind: 'silhouette', item: 'cat' }, [it('dog'), it('cat'), it('duck')], 1),
    q('h3', 'hewan', 2, 'Siapa yang bersuara begini?', { kind: 'sound', item: 'cow', sound_id: 'moo' }, [it('cow'), it('fish'), it('cat')], 0),
    q('h4', 'hewan', 2, 'Siapa bayangan ini?', { kind: 'silhouette', item: 'duck' }, [it('cow'), it('duck'), it('fish')], 1),
    q('h5', 'hewan', 3, 'Siapa yang bersuara begini?', { kind: 'sound', item: 'dog', sound_id: 'woof' }, [it('cat'), it('cow'), it('dog')], 2),
    q('h6', 'hewan', 3, 'Binatang apa ini?', { kind: 'picture', item: 'fish' }, [tx('ikan'), tx('bebek'), tx('kucing')], 0),
  ],
  membaca: [
    q('r1', 'membaca', 1, 'Mana huruf A?', { kind: 'none' }, [tx('B'), tx('A'), tx('D')], 1),
    q('r2', 'membaca', 1, 'Huruf apa ini?', { kind: 'text', text: 'B' }, [tx('B'), tx('D'), tx('P')], 0),
    q('r3', 'membaca', 2, 'Mana tulisan "kucing"?', { kind: 'picture', item: 'cat' }, [tx('kuda'), tx('kura'), tx('kucing')], 2),
    q('r4', 'membaca', 2, 'Mana tulisan "bola"?', { kind: 'picture', item: 'ball' }, [tx('bola'), tx('bula'), tx('bala')], 0),
    q('r5', 'membaca', 3, 'Baca kata ini. Gambar yang mana?', { kind: 'text', text: 'buku' }, [it('ball'), it('book'), it('duck')], 1),
    q('r6', 'membaca', 3, 'Baca kata ini. Gambar yang mana?', { kind: 'text', text: 'ikan' }, [it('fish'), it('cow'), it('sun')], 0),
  ],
};
