// "Your words": the music words a person has picked up, kept on this device
// across sessions. Clear chat and Start over leave it alone; only "Forget my
// words" empties it. The list never leaves the device, except the terms
// themselves, which go with each AI request so the AI can build on them.
import { addWords, sanitizeCollection, usedTerms, type Learnt, type Word } from '../shared/learning.js';
import { $ } from './state.js';

const KEY = 'gl.words';

function load(): Learnt[] {
  try {
    return sanitizeCollection(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return [];
  }
}

let collection: Learnt[] = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(collection));
  } catch {
    // storage full or blocked: the words are kept for this visit only
  }
}

/** The terms to send with a request. */
export function learntTerms(): string[] {
  return collection.map((e) => e.term);
}

/**
 * After a successful reply: counts the known words the person used in their
 * request, then adds the reply's new words.
 */
export function recordExchange(request: string, words: Word[]): void {
  const used = new Set(usedTerms(request, learntTerms()).map((t) => t.toLowerCase()));
  collection = collection.map((e) => (used.has(e.term.toLowerCase()) ? { ...e, used: e.used + 1 } : e));
  collection = addWords(collection, words);
  save();
  renderWords();
}

export function renderWords(): void {
  const n = collection.length;
  $('wordsOpen').textContent = n ? `Your words (${n})` : 'Your words';
  const list = $('wordsList');
  list.textContent = '';
  $('wordsEmpty').hidden = n > 0;
  $('wordsForget').hidden = n === 0;
  for (const e of [...collection].reverse()) {
    const li = document.createElement('li');
    const head = document.createElement('div');
    head.className = 'w-head';
    const term = document.createElement('span');
    term.className = 'term';
    term.textContent = e.term;
    head.append(term);
    if (e.used > 0) {
      const badge = document.createElement('span');
      badge.className = 'used';
      badge.textContent = e.used === 1 ? '✓ you used it' : `✓ you used it ${e.used} times`;
      head.append(badge);
    }
    const meaning = document.createElement('p');
    meaning.className = 'meaning';
    meaning.textContent = e.meaning;
    li.append(head, meaning);
    if (e.said.length) {
      const said = document.createElement('p');
      said.className = 'from';
      said.textContent = `From your words: ${e.said.map((s) => `“${s}”`).join(', ')}`;
      li.append(said);
    }
    list.append(li);
  }
}

export function wireWords(): void {
  const dialog = $<HTMLDialogElement>('wordsDialog');
  $('wordsOpen').onclick = () => {
    renderWords();
    dialog.showModal();
  };
  $('wordsClose').onclick = () => dialog.close();
  // a tap on the dimmed background closes it too
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  $('wordsForget').onclick = () => {
    if (!confirm('Forget all your words? This cannot be undone.')) return;
    collection = [];
    save();
    renderWords();
  };
  renderWords();
}
