// Compares eval variants: pass rates, reply length, speed and cost per request,
// and writes LISTEN.md with each result's reply, glossary and share link.
//   npm run eval:summary -- opus-v0 opus-v1 sonnet-v1 haiku-v1
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'eval/compose';
// $ per million tokens: input, output. Cache writes are 1.25x input, cache reads 0.1x input.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

interface Row {
  prompt_id: string;
  prompt: string;
  grade: Record<string, number>;
  explanation: { all_pass: string };
  model: string;
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  latency_s: number;
  reply_words: number;
  meta: { reply: string; words: { said: string; term: string; meaning: string }[]; share: string | null };
}

const cost = (r: Row) => {
  const p = PRICES[r.model];
  if (!p || !r.usage) return NaN;
  const u = r.usage;
  return (u.input_tokens * p[0] + (u.cache_creation_input_tokens ?? 0) * p[0] * 1.25 + (u.cache_read_input_tokens ?? 0) * p[0] * 0.1 + u.output_tokens * p[1]) / 1e6;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
};

const variants = process.argv.slice(2);
const data = new Map<string, Row[]>();
for (const v of variants) {
  const p = join(ROOT, 'results', v, 'results.jsonl');
  const rows = existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row) : [];
  const errs = existsSync(join(ROOT, 'results', v, 'errors.jsonl')) ? readFileSync(join(ROOT, 'results', v, 'errors.jsonl'), 'utf8').split('\n').filter(Boolean).length : 0;
  data.set(v, rows);
  const n = rows.length;
  const pct = (k: string) => `${Math.round(100 * mean(rows.map((r) => r.grade[k] ?? 0)))}%`;
  console.log(
    [
      v.padEnd(12),
      `${n} cases${errs ? ` (+${errs} errors)` : ''}`,
      `all checks ${pct('all_pass')}`,
      `nothing dropped ${pct('valid')}`,
      `short ${pct('short')}`,
      `case checks ${pct('case_checks')}`,
      `reply ${Math.round(median(rows.map((r) => r.reply_words)))} words (median)`,
      `${median(rows.map((r) => r.latency_s)).toFixed(1)}s (median)`,
      `${(100 * mean(rows.map(cost))).toFixed(2)}c a request`,
    ].join('  |  '),
  );
}

// LISTEN.md: per case, each variant's reply, glossary and share link. Model text is quoted, never interpreted.
const esc = (s: string) => s.replace(/[\\`*_[\]<>|#]/g, (ch) => `\\${ch}`).replace(/\s*\n+\s*/g, ' ');
const ids = [...new Set([...data.values()].flat().map((r) => r.prompt_id))];
let md = `# Listen and compare\n\nEach link opens the result on www.groove-loom.com. Opening it replaces the piece on that device; Undo brings yours back.\n`;
for (const id of ids) {
  const first = [...data.values()].flat().find((r) => r.prompt_id === id)!;
  md += `\n## ${esc(id)}: "${esc(first.prompt)}"\n`;
  for (const v of variants) {
    const r = data.get(v)!.find((x) => x.prompt_id === id);
    if (!r) {
      md += `\n- **${v}**: no result\n`;
      continue;
    }
    md += `\n- **${v}** ${r.grade.all_pass ? 'passed' : `(${esc(r.explanation.all_pass)})`}${r.meta.share ? ` [listen](${r.meta.share})` : ''}\n  - ${esc(r.meta.reply)}\n`;
    for (const w of r.meta.words) md += `  - "${esc(w.said)}" → **${esc(w.term)}**: ${esc(w.meaning)}\n`;
  }
}
writeFileSync(join(ROOT, 'results', 'LISTEN.md'), md);
console.log(`\nWrote ${join(ROOT, 'results', 'LISTEN.md')}`);
