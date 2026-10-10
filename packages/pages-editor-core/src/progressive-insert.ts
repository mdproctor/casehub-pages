import type { EditableText } from './types.js';

export interface ProgressiveInsertOptions {
  speed?: number;
  isSkipped?: () => boolean;
}

const CHAR_PHASE_WORDS = 5;
const CHUNK_SIZES = [1, 2, 4, 5];
const PHASE_LENGTHS = [5, 6, 7, Infinity];

export async function progressiveEmit(
  text: string,
  emit: (chunk: string) => void,
  options?: ProgressiveInsertOptions,
): Promise<void> {
  const speed = options?.speed ?? 1;
  const isSkipped = options?.isSkipped;
  const charDelay = Math.max(10, 40 / speed);
  const wordDelay = Math.max(20, 60 / speed);
  const words = text.split(/(\s+)/);

  const phase0End = Math.min(CHAR_PHASE_WORDS, words.length);
  for (let w = 0; w < phase0End; w++) {
    const word = words[w]!;
    for (const ch of word) {
      if (isSkipped?.()) return;
      emit(ch);
      await new Promise(r => setTimeout(r, charDelay));
    }
  }

  let wordIndex = phase0End;
  for (let phase = 0; phase < CHUNK_SIZES.length; phase++) {
    const chunk = CHUNK_SIZES[phase]!;
    const len = PHASE_LENGTHS[phase]!;
    let count = 0;
    while (wordIndex < words.length && count < len) {
      if (isSkipped?.()) return;
      let batch = '';
      for (let c = 0; c < chunk && wordIndex < words.length; c++, wordIndex++) {
        batch += words[wordIndex]!;
      }
      emit(batch);
      count++;
      await new Promise(r => setTimeout(r, wordDelay));
    }
  }
}

export async function progressiveInsert(
  editor: EditableText,
  text: string,
  options?: ProgressiveInsertOptions,
): Promise<void> {
  const insert = editor.insertRawText ? (chunk: string) => editor.insertRawText!(chunk) : (chunk: string) => editor.insertText(chunk);
  await progressiveEmit(text, insert, options);
}
