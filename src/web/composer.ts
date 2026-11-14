// The AI behind one interface. Whatever implements Composer, its piece is
// unvalidated: the caller runs it through sanitizePiece before use.
// Task 4 adds ServerComposer (posts to /api/compose); phase 2 adds
// browser-side adapters for a person's own key.
import type { Piece } from '../shared/piece.js';
import type { ChatMessage } from '../shared/prompt.js';

export interface ComposeRequest {
  request: string;
  piece: Piece;
  history: ChatMessage[];
}

export interface ComposeResult {
  reply: string;
  /** Unvalidated. */
  piece: unknown;
}

export interface Composer {
  compose(req: ComposeRequest, signal?: AbortSignal): Promise<ComposeResult>;
}

export type ComposerErrorCode = 'unavailable' | 'rate_limited' | 'invalid_json' | 'refused' | 'cancelled' | 'failed';

export class ComposerError extends Error {
  constructor(
    readonly code: ComposerErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ComposerError';
  }
}

/** Plain-words message for each failure. The piece is always left unchanged. */
export function composerErrorText(code: ComposerErrorCode): string {
  switch (code) {
    case 'unavailable':
      return "The AI isn't connected yet. The knobs, mute, solo and MP3 still work.";
    case 'rate_limited':
      return 'Too many requests just now. Give it a moment, then try again.';
    case 'invalid_json':
      return 'I got a muddled answer back and left your piece unchanged. Try again or rephrase.';
    case 'refused':
      return "I can't help with that one. Try describing a sound or a feel.";
    case 'cancelled':
      return 'Stopped.';
    default:
      return 'Something went wrong reaching the AI. Your piece is unchanged; try again.';
  }
}

/** No AI connected yet. */
export const composer: Composer | null = null;
