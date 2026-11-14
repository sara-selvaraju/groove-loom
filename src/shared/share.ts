// Share links: the piece, compressed, after "#p=" in the address. Links carry
// data, never code: an opened link goes through sanitizePiece like an AI
// reply. The piece sits after "#" because the fragment never reaches the
// server and survives the bare domain's redirect to www.
//
// Format: "#p=1." + base64url(deflate-raw(JSON)). The "1." is a format
// version, so a later format can still read old links.
import type { Piece } from './piece.js';

export const SHARE_PREFIX = '#p=';
const VERSION = '1.';

/** Longest link fragment accepted. A full eight-layer piece is well under 2,000. */
export const MAX_LINK_CHARS = 8000;
/** Most bytes a link may unpack to, so a small link cannot expand into something huge. */
export const MAX_UNPACKED_BYTES = 64 * 1024;

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function pipeBytes(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array | null> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => {});
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The fragment for a piece, starting "#p=". Solo is left out: it is a listening aid, not part of the piece. */
export async function encodePiece(piece: Piece): Promise<string> {
  const data = { ...piece, layers: piece.layers.map(({ solo: _solo, ...rest }) => rest) };
  const packed = await pipeBytes(new TextEncoder().encode(JSON.stringify(data)), new CompressionStream('deflate-raw'));
  return SHARE_PREFIX + VERSION + toBase64Url(packed!);
}

/** Whether an address fragment is a share link at all. */
export const isShareLink = (hash: string): boolean => hash.startsWith(SHARE_PREFIX);

/**
 * The unchecked data inside a share link, or null if the link is too long,
 * damaged, unpacks to too much, or is not JSON. The caller must still run it
 * through sanitizePiece.
 */
export async function decodeLink(hash: string): Promise<unknown> {
  if (!isShareLink(hash) || hash.length > MAX_LINK_CHARS) return null;
  const body = hash.slice(SHARE_PREFIX.length);
  if (!body.startsWith(VERSION)) return null;
  const bytes = fromBase64Url(body.slice(VERSION.length));
  if (!bytes || bytes.length === 0) return null;
  const unpacked = await pipeBytes(bytes, new DecompressionStream('deflate-raw'), MAX_UNPACKED_BYTES);
  if (!unpacked) return null;
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unpacked));
  } catch {
    return null;
  }
}
