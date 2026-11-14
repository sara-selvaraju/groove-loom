// The AI behind one interface. Whatever implements Composer, its piece is
// unvalidated: the caller runs it through sanitizePiece before use.
// ServerComposer posts to /api/compose, where the server holds the key;
// phase 2 adds browser-side adapters for a person's own key.
import type { Word } from '../shared/learning.js';
import type { Piece } from '../shared/piece.js';
import type { ChatMessage } from '../shared/prompt.js';

export interface ComposeRequest {
  request: string;
  piece: Piece;
  history: ChatMessage[];
}

export interface ComposeResult {
  reply: string;
  /** Checked by the server; check again before use. */
  words?: Word[];
  /** Unvalidated. */
  piece: unknown;
}

export interface Composer {
  compose(req: ComposeRequest, signal?: AbortSignal): Promise<ComposeResult>;
}

export type ComposerErrorCode =
  | 'unavailable'
  | 'forbidden'
  | 'locked'
  | 'rate_limited'
  | 'busy'
  | 'invalid_json'
  | 'refused'
  | 'cancelled'
  | 'failed';

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
      return "The AI isn't switched on here. The knobs, mute, solo and MP3 still work.";
    case 'forbidden':
      return "That invite code didn't work. Enter it again below to use the AI.";
    case 'locked':
      return 'Too many wrong invite codes from here. Wait a few minutes, then enter it again below.';
    case 'busy':
      return 'The AI is very busy right now. Your piece is unchanged; try again in a minute.';
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

const SERVER_CODES: Record<string, ComposerErrorCode> = {
  unavailable: 'unavailable',
  forbidden: 'forbidden',
  locked: 'locked',
  rate_limited: 'rate_limited',
  busy: 'busy',
  refused: 'refused',
  invalid_json: 'invalid_json',
};

/** Asks the server, which holds the API key. Testers unlock it with a shared invite code. */
export class ServerComposer implements Composer {
  constructor(private readonly inviteCode: () => string | null) {}

  async compose(req: ComposeRequest, signal?: AbortSignal): Promise<ComposeResult> {
    let res: Response;
    try {
      res = await fetch('/api/compose', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-invite-code': this.inviteCode() ?? '' },
        body: JSON.stringify({
          request: req.request,
          piece: req.piece,
          history: req.history.map(({ who, text, err }) => ({ who, text, err: !!err })),
        }),
        signal,
      });
    } catch (e) {
      if (signal?.aborted) throw new ComposerError('cancelled');
      throw new ComposerError('failed', e instanceof Error ? e.message : undefined);
    }
    const body = (await res.json().catch(() => null)) as { error?: string; reply?: unknown; words?: Word[]; piece?: unknown } | null;
    if (!res.ok) throw new ComposerError(SERVER_CODES[body?.error ?? ''] ?? 'failed');
    if (!body || typeof body.reply !== 'string') throw new ComposerError('invalid_json');
    return { reply: body.reply, words: body.words, piece: body.piece };
  }
}

/** Whether the server has the AI switched on (an API key and an invite code are configured). */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/status', { cache: 'no-store' });
    return res.ok && ((await res.json()) as { ai?: boolean }).ai === true;
  } catch {
    return false;
  }
}
