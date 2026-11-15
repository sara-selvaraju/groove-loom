// Runs the compose eval: each case in cases.json goes through the real
// /api/compose handler (prompt building, structured output, sanitizePiece,
// the dropped-layer note) with a real Claude call, then is graded by the
// checks below. Results land in eval/compose/results/<variant>/.
//
//   npm run eval -- --variant opus-v1 --model claude-opus-5-5 [--instructions v0] [--only id,id] [--reps 1]
//
// Costs real money: every case is one API call. Needs ANTHROPIC_API_KEY in .env.
import Anthropic from '@anthropic-ai/sdk';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/server/app.js';
import type { MessagesApi } from '../../src/server/compose.js';
import { Limiter } from '../../src/server/limiter.js';
import { parsesAsMini } from '../../src/server/mini.js';
import { droppedLayers, sanitizePiece, STARTER, BLANK, type Layer, type Piece } from '../../src/shared/piece.js';
import { encodePiece } from '../../src/shared/share.js';
import { INSTR } from '../../src/shared/vocabulary.js';

type Check = {
  minLayers?: number;
  maxLayers?: number;
  addsInstrument?: string;
  dropsInstrument?: string;
  keepsLayers?: string[];
  wantsWords?: boolean;
  noWords?: boolean;
  onlyChanges?: string[];
  swingDown?: boolean;
  tempoUp?: boolean;
  noReteach?: boolean;
  acknowledges?: string;
  replyNamesReplaced?: boolean;
  usesSynth?: boolean;
  pieceUnchanged?: boolean;
};
interface Case {
  id: string;
  tags: string[];
  piece: string;
  request: string;
  learnt?: string[];
  check: Check;
}
interface Word {
  said: string;
  term: string;
  meaning: string;
}

const ROOT = 'eval/compose';
const SHARE_BASE = 'https://www.groove-loom.com/';
const CASE_CEILING_MS = 150_000;
const CONCURRENCY = 4;
const MAX_REPLY_WORDS = 45;

/* ---------- arguments ---------- */

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const variant = arg('variant');
const model = arg('model');
const instructionsName = arg('instructions', 'current')!;
const reps = Number(arg('reps', '1'));
const only = arg('only')?.split(',');
/** --dry: a stand-in for Claude that returns the piece unchanged, to check the plumbing and grading for free. */
const dry = args.includes('--dry');
if (!variant || !model || !/^[a-z0-9-]+$/.test(variant)) {
  console.error('Usage: npm run eval -- --variant <name> --model <model id> [--instructions v0|current] [--only id,id] [--reps n]');
  process.exit(2);
}
if (!dry && !process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY is not set. Put it in .env (never commit it).');
  process.exit(2);
}
const instructions = instructionsName === 'current' ? undefined : readFileSync(join(ROOT, `instructions-${instructionsName}.txt`), 'utf8');

/* ---------- starting pieces ---------- */

const clean = (p: unknown): Piece => sanitizePiece(p, null, parsesAsMini)!;
const starter = clean(STARTER);
const layer = (l: Partial<Layer> & Pick<Layer, 'id' | 'name' | 'instrument'>): Layer => ({
  about: '',
  volume: 0.6,
  tone: 0.5,
  space: 0.2,
  octave: 0,
  muted: false,
  solo: false,
  echo: 0,
  grit: 0,
  accent: null,
  rhythm: null,
  ...l,
});
const trumpet = layer({ id: 'tpt', name: 'Trumpet', instrument: 'trumpet', notes: '0 2 4', rhythm: { mode: 'euclid', hits: 3, steps: 8, rotate: 1 }, about: 'Short off-beat stabs.' });
const PIECES: Record<string, Piece> = {
  blank: clean(BLANK),
  starter,
  'starter+trumpet': clean({ ...starter, layers: [...starter.layers, trumpet] }),
  'starter-swung': clean({ ...starter, swing: 0.55 }),
  full8: clean({
    ...starter,
    layers: [
      ...starter.layers,
      trumpet,
      layer({ id: 'keys', name: 'Piano chords', instrument: 'piano', notes: '<[0,2,4] [3,5,7]>', about: 'Two chords, one per bar.' }),
      layer({ id: 'pad', name: 'Strings', instrument: 'strings', notes: '[0,4]', volume: 0.4, space: 0.5, about: 'A soft held chord underneath.' }),
      layer({ id: 'shaker', name: 'Shaker', instrument: 'shaker', rhythm: { mode: 'steps', pattern: 'x*8' }, volume: 0.4, about: 'Steady eighth notes.' }),
    ],
  }),
};

/* ---------- grading ---------- */

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const sentences = (s: string) => s.split(/[.!?]+(?:\s|$)/).filter((x) => x.trim()).length;
const sameLayer = (a: Layer, b: Layer) => JSON.stringify({ ...a, solo: false }) === JSON.stringify({ ...b, solo: false });
const samePiece = (a: Piece, b: Piece) =>
  a.tempo === b.tempo && a.key === b.key && a.scale === b.scale && a.swing === b.swing && a.layers.length === b.layers.length && a.layers.every((l, i) => sameLayer(l, b.layers[i]!));

function grade(c: Case, before: Piece, out: { reply: string; words: Word[]; piece: Piece } | null, refused: boolean, droppedCount: number) {
  const g: Record<string, number> = {};
  const why: string[] = [];
  const ok = (name: string, pass: boolean) => {
    if (!pass) why.push(name);
    return pass;
  };
  const checks: boolean[] = [];
  const k = c.check;
  if (refused || !out) {
    const pass = !!k.pieceUnchanged; // a refusal is the right outcome only for the take-over case
    g.all_pass = pass ? 1 : 0;
    g.valid = pass ? 1 : 0;
    g.short = 1;
    g.case_checks = pass ? 1 : 0;
    return { grade: g, failed: pass ? [] : ['refused'] };
  }
  const { piece, words: ws } = out;
  // The handler appends a note when layers were left out; judge the model's own reply without it.
  const reply = out.reply.split('\n\n')[0]!;
  const after = new Map(piece.layers.map((l) => [l.id, l]));
  const instruments = piece.layers.map((l) => l.instrument);
  const had = before.layers.map((l) => l.instrument);

  const valid = ok('nothing dropped', droppedCount === 0);
  const short = ok('short reply', sentences(reply) <= 2 && words(reply) <= MAX_REPLY_WORDS);
  checks.push(ok('glossary size', ws.length <= 3), ok('plain meanings', ws.every((w) => words(w.meaning) < 20)));
  if (k.minLayers !== undefined) checks.push(ok(`at least ${k.minLayers} layers`, piece.layers.length >= k.minLayers));
  if (k.maxLayers !== undefined) checks.push(ok(`at most ${k.maxLayers} layers`, piece.layers.length <= k.maxLayers));
  if (k.addsInstrument) checks.push(ok(`adds ${k.addsInstrument}`, instruments.includes(k.addsInstrument) && !had.includes(k.addsInstrument)));
  if (k.dropsInstrument) checks.push(ok(`drops ${k.dropsInstrument}`, !instruments.includes(k.dropsInstrument)));
  if (k.keepsLayers) checks.push(ok('keeps the other layers', k.keepsLayers.every((id) => after.has(id))));
  if (k.wantsWords) checks.push(ok('teaches a word', ws.length >= 1));
  if (k.noWords) checks.push(ok('no glossary entry', ws.length === 0));
  if (k.onlyChanges) {
    const others = before.layers.filter((l) => !k.onlyChanges!.includes(l.id));
    const untouched = others.every((l) => after.has(l.id) && sameLayer(l, after.get(l.id)!)) && piece.layers.length === before.layers.length;
    const globals = piece.tempo === before.tempo && piece.key === before.key && piece.scale === before.scale && piece.swing === before.swing;
    const target = k.onlyChanges.every((id) => after.has(id) && !sameLayer(before.layers.find((l) => l.id === id)!, after.get(id)!));
    checks.push(ok('only the asked-for layer changes', untouched && globals && target));
  }
  if (k.swingDown) checks.push(ok('less swing', piece.swing < before.swing));
  if (k.tempoUp) checks.push(ok('faster', piece.tempo > before.tempo));
  if (k.noReteach) {
    const known = new Set((c.learnt ?? []).map((t) => t.toLowerCase()));
    checks.push(ok('does not re-teach known words', ws.every((w) => !known.has(w.term.toLowerCase()))));
  }
  if (k.acknowledges) checks.push(ok(`mentions "${k.acknowledges}"`, reply.toLowerCase().includes(k.acknowledges.toLowerCase())));
  if (k.replyNamesReplaced) {
    const gone = before.layers.filter((l) => !after.has(l.id));
    const full = out.reply.toLowerCase();
    checks.push(ok('says what made room', gone.length > 0 && gone.some((l) => full.includes(l.name.toLowerCase()) || full.includes(INSTR[l.instrument]!.label.toLowerCase()))));
  }
  if (k.usesSynth) checks.push(ok('uses a synth sound', piece.layers.some((l) => !INSTR[l.instrument]?.rec)));
  if (k.pieceUnchanged) checks.push(ok('piece unchanged', samePiece(before, piece)), ok('no glossary entry', ws.length === 0));

  const passed = checks.filter(Boolean).length;
  g.case_checks = passed / checks.length;
  g.valid = valid ? 1 : 0;
  g.short = short ? 1 : 0;
  g.all_pass = valid && short && passed === checks.length ? 1 : 0;
  return { grade: g, failed: why };
}

/* ---------- running one case ---------- */

const outDir = join(ROOT, 'results', variant);
mkdirSync(join(outDir, 'traces'), { recursive: true });
const resultsPath = join(outDir, 'results.jsonl');
const done = new Set(
  existsSync(resultsPath)
    ? readFileSync(resultsPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const r = JSON.parse(l) as { prompt_id: string; rep: number };
          return `${r.prompt_id}#${r.rep}`;
        })
    : [],
);
const client = new Anthropic({ timeout: 120_000, maxRetries: 3 });
const staticRoot = mkdtempSync(join(tmpdir(), 'groove-loom-eval-'));

async function runCase(c: Case, rep: number): Promise<void> {
  const before = PIECES[c.piece];
  if (!before) throw new Error(`unknown piece ${c.piece}`);
  let params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming | undefined;
  let message: Anthropic.Beta.Messages.BetaMessage | undefined;
  const messages: MessagesApi = {
    async create(p, o) {
      params = p;
      message = dry
        ? ({
            id: 'dry',
            type: 'message',
            role: 'assistant',
            model,
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: JSON.stringify({ reply: 'Done.', words: [], piece: before }) }],
            usage: { input_tokens: 0, output_tokens: 0 },
          } as unknown as Anthropic.Beta.Messages.BetaMessage)
        : await client.beta.messages.create(p, o);
      return message;
    },
  };
  const app = createApp({
    staticRoot,
    compose: {
      messages,
      inviteCode: 'eval',
      model,
      instructions,
      limiter: new Limiter({ perMinute: 1e6, perDay: 1e6, globalPerDay: 1e6 }),
      log: () => {},
    },
  });
  const started = Date.now();
  const call = app.request('/api/compose', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-invite-code': 'eval', 'x-forwarded-for': `eval-${c.id}` },
    body: JSON.stringify({ request: c.request, piece: before, history: [], learnt: c.learnt ?? [] }),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const res = await Promise.race([call, new Promise<null>((r) => (timer = setTimeout(() => r(null), CASE_CEILING_MS)))]);
  clearTimeout(timer);
  const latency = (Date.now() - started) / 1000;
  const errorRow = (failure: string, detail: unknown) =>
    appendFileSync(join(outDir, 'errors.jsonl'), JSON.stringify({ prompt_id: c.id, rep, failure, detail, model: message?.model, usage: message?.usage }) + '\n');
  if (!res) return errorRow('timeout', `over ${CASE_CEILING_MS / 1000}s`);
  const body = (await res.json()) as { reply?: string; words?: Word[]; piece?: Piece; error?: string };
  const refused = res.status === 422 && body.error === 'refused';
  if (res.status !== 200 && !refused) return errorRow(body.error ?? `http ${res.status}`, message?.stop_reason ?? null);
  if (message && message.model !== model) console.warn(`  ${c.id}: served by ${message.model}, not ${model}`);

  const raw = (() => {
    const text = message?.content.find((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')?.text;
    try {
      return JSON.parse(text ?? 'null') as { piece?: unknown };
    } catch {
      return null;
    }
  })();
  const out = refused ? null : { reply: body.reply!, words: body.words ?? [], piece: body.piece! };
  const dropped = out && raw ? droppedLayers(raw.piece, out.piece) : { overLimit: [], unknownInstrument: [] };
  const { grade: g, failed } = grade(c, before, out, refused, dropped.overLimit.length + dropped.unknownInstrument.length);
  const share = out ? SHARE_BASE + (await encodePiece(out.piece)) : null;

  const row = {
    prompt_id: c.id,
    prompt: c.request,
    tags: [...c.tags, c.piece],
    rep,
    status: message?.stop_reason === 'max_tokens' ? 'truncated' : 'ok',
    stop_reason: message?.stop_reason ?? null,
    grade: g,
    explanation: { all_pass: failed.length ? `failed: ${failed.join(', ')}` : 'all checks passed' },
    model: message?.model ?? model,
    usage: message?.usage,
    latency_s: latency,
    reply_words: out ? words(out.reply.split('\n\n')[0]!) : 0,
    meta: { reply: out?.reply ?? '(refused)', words: out?.words ?? [], share, instructions: instructionsName },
  };
  writeFileSync(
    join(outDir, 'traces', `${c.id}_rep${rep}.json`),
    JSON.stringify(
      [
        { role: 'system', content: params ? JSON.stringify(params.system) : '' },
        { role: 'user', content: params ? JSON.stringify(params.messages) : '' },
        { role: 'assistant', content: message ? JSON.stringify(message.content, null, 2) : '(no response)' },
      ],
      null,
      2,
    ),
  );
  appendFileSync(resultsPath, JSON.stringify(row) + '\n');
  console.log(`  ${g.all_pass ? 'pass' : 'FAIL'}  ${c.id}${failed.length ? `  (${failed.join(', ')})` : ''}`);
}

/* ---------- the run ---------- */

const cases = (JSON.parse(readFileSync(join(ROOT, 'cases.json'), 'utf8')) as Case[]).filter((c) => !only || only.includes(c.id));
const queue = cases.flatMap((c) => Array.from({ length: reps }, (_, rep) => ({ c, rep }))).filter(({ c, rep }) => !done.has(`${c.id}#${rep}`));
console.log(`${variant}: ${queue.length} calls on ${model} (instructions: ${instructionsName})`);
const t0 = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        await runCase(job.c, job.rep);
      } catch (e) {
        appendFileSync(join(outDir, 'errors.jsonl'), JSON.stringify({ prompt_id: job.c.id, rep: job.rep, failure: 'harness', detail: String(e) }) + '\n');
        console.log(`  ERROR ${job.c.id}: ${String(e)}`);
      }
    }
  }),
);
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
