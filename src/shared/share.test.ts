import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { STARTER, sanitizePiece } from './piece.js';
import { MAX_LINK_CHARS, MAX_UNPACKED_BYTES, decodeLink, encodePiece, isShareLink } from './share.js';
import { parsesAsMini } from './test-support.js';

const piece = () => sanitizePiece(STARTER, null, parsesAsMini)!;
const link = (bytes: Buffer) => '#p=1.' + bytes.toString('base64url');

describe('share links', () => {
  it('round-trips a piece through a short, address-safe link', async () => {
    const p = piece();
    const hash = await encodePiece(p);
    expect(hash).toMatch(/^#p=1\.[A-Za-z0-9_-]+$/);
    expect(hash.length).toBeLessThan(1200);
    const back = sanitizePiece(await decodeLink(hash), null, parsesAsMini);
    expect(back).toEqual(p);
  });

  it('leaves solo out of the link', async () => {
    const p = piece();
    p.layers[0]!.solo = true;
    const data = (await decodeLink(await encodePiece(p))) as { layers: Record<string, unknown>[] };
    expect(data.layers[0]).not.toHaveProperty('solo');
  });

  it('keeps a full eight-layer piece well under the length limit', async () => {
    const p = piece();
    p.layers = Array.from({ length: 8 }, (_, i) => ({ ...p.layers[i % p.layers.length]!, id: `layer${i}`, about: 'x'.repeat(120) }));
    expect((await encodePiece(p)).length).toBeLessThan(MAX_LINK_CHARS / 2);
  });

  it('knows a share link when it sees one', () => {
    expect(isShareLink('#p=1.abc')).toBe(true);
    expect(isShareLink('#top')).toBe(false);
    expect(isShareLink('')).toBe(false);
  });

  it.each([
    ['not a share link', '#hello'],
    ['an unknown format version', '#p=2.abc'],
    ['an empty body', '#p=1.'],
    ['characters outside base64url', '#p=1.ab+c/=='],
    ['bytes that do not unpack', '#p=1.' + Buffer.from('not compressed at all').toString('base64url')],
    ['a link that was cut short', '#p=1.' + deflateRawSync(JSON.stringify({ tempo: 100, layers: [] })).subarray(0, 6).toString('base64url')],
    ['unpacked bytes that are not JSON', link(deflateRawSync('tempo: 100'))],
    ['unpacked bytes that are not text', link(deflateRawSync(Buffer.from([0xff, 0xfe, 0x00])))],
  ])('rejects %s', async (_why, hash) => {
    expect(await decodeLink(hash)).toBeNull();
  });

  it('rejects a link longer than the limit without unpacking it', async () => {
    expect(await decodeLink('#p=1.' + 'A'.repeat(MAX_LINK_CHARS))).toBeNull();
  });

  it('stops unpacking a small link that would expand into something huge', async () => {
    const bomb = deflateRawSync(Buffer.alloc(MAX_UNPACKED_BYTES * 50, 0x20));
    const hash = link(bomb);
    expect(hash.length).toBeLessThan(MAX_LINK_CHARS);
    expect(await decodeLink(hash)).toBeNull();
  });

  it('hands back hostile data unchecked, and sanitizePiece makes it safe', async () => {
    const hostile = { tempo: 9999, key: 'H', code: 'alert(1)', layers: [{ instrument: 'kick', name: '<img src=x onerror=alert(1)>', rhythm: { mode: 'steps', pattern: 'x"); evil(' } }] };
    const data = await decodeLink(link(deflateRawSync(JSON.stringify(hostile))));
    expect(data).toEqual(hostile);
    const safe = sanitizePiece(data, null, parsesAsMini)!;
    expect(safe.tempo).toBe(180);
    expect(safe).not.toHaveProperty('code');
    expect(safe.layers[0]!.rhythm).not.toEqual(hostile.layers[0]!.rhythm);
  });
});
