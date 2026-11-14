// The vocabulary the AI is allowed to use. Everything here is a whitelist:
// sanitizePiece drops anything outside it.

export const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export type Key = (typeof KEYS)[number];

export const SCALES = {
  major: 'Major (bright)',
  minor: 'Minor (moody)',
  dorian: 'Dorian (soulful minor)',
  mixolydian: 'Mixolydian (bluesy major)',
  'major pentatonic': 'Major pentatonic',
  'minor pentatonic': 'Minor pentatonic',
  blues: 'Blues',
  'harmonic minor': 'Harmonic minor',
  phrygian: 'Phrygian (dark, Spanish)',
  lydian: 'Lydian (dreamy)',
} as const;
export type Scale = keyof typeof SCALES;

/** A Strudel method call: name and arguments. */
export type Call = [method: string, args: (string | number)[]];

export interface Instrument {
  label: string;
  kind: 'drum' | 'tone';
  /** Strudel sound name. */
  sound: string;
  /** Recorded files: a list of drum files, or "gm" for a pitched instrument sampled at the notes in GM_NOTES. */
  sample?: string[] | 'gm';
  /** Base octave for pitched instruments. */
  octave?: number;
  /** Level balancing, measured per instrument. */
  gain: number;
  params: [string, number][];
  /** A recorded sound rather than a synth. */
  rec?: boolean;
}

// Recorded drums: Versilian Community Sample Library (CC0). Recorded instruments: Fluid R3 GM (CC BY 3.0).
// Both are published with the page under sounds/. Synth instruments need no files.
export const GM_NOTES: Record<string, string[]> = {
  ebass: ['A1', 'A2', 'A3', 'C1', 'C2', 'C3', 'C4', 'Eb1', 'Eb2', 'Eb3', 'Gb1', 'Gb2', 'Gb3'],
  epiano: ['A2', 'A3', 'A4', 'A5', 'C2', 'C3', 'C4', 'C5', 'C6', 'Eb2', 'Eb3', 'Eb4', 'Eb5', 'Gb2', 'Gb3', 'Gb4', 'Gb5'],
  flute: ['A4', 'A5', 'A6', 'C4', 'C5', 'C6', 'C7', 'Eb4', 'Eb5', 'Eb6', 'Gb4', 'Gb5', 'Gb6'],
  guitar: ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'C6', 'Eb2', 'Eb3', 'Eb4', 'Eb5', 'Gb2', 'Gb3', 'Gb4', 'Gb5'],
  piano: ['A2', 'A3', 'A4', 'A5', 'A6', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'Eb2', 'Eb3', 'Eb4', 'Eb5', 'Eb6', 'Gb2', 'Gb3', 'Gb4', 'Gb5', 'Gb6'],
  sax: ['A2', 'A3', 'A4', 'A5', 'C3', 'C4', 'C5', 'Eb3', 'Eb4', 'Eb5', 'Gb2', 'Gb3', 'Gb4', 'Gb5'],
  strings: ['A2', 'A3', 'A4', 'A5', 'C2', 'C3', 'C4', 'C5', 'C6', 'Eb2', 'Eb3', 'Eb4', 'Eb5', 'Eb6', 'Gb2', 'Gb3', 'Gb4', 'Gb5', 'Gb6'],
  trumpet: ['A3', 'A4', 'A5', 'C4', 'C5', 'C6', 'Eb3', 'Eb4', 'Eb5', 'Gb3', 'Gb4', 'Gb5'],
  vibes: ['A3', 'A4', 'A5', 'C4', 'C5', 'C6', 'Eb3', 'Eb4', 'Eb5', 'Eb6', 'Gb3', 'Gb4', 'Gb5', 'Gb6'],
};

const DRUM = (file: string, label: string, gain: number, extra?: [string, number][]): Instrument => ({
  label,
  kind: 'drum',
  sound: file,
  sample: [`drums/${file}.wav`],
  gain,
  params: extra ?? [],
  rec: true,
});
const TONE = (sound: string, label: string, octave: number, gain: number, params: [string, number][]): Instrument => ({
  label,
  kind: 'tone',
  sound,
  sample: 'gm',
  octave,
  gain,
  params,
  rec: true,
});

export const INSTR: Record<string, Instrument> = {
  kick: DRUM('kick', 'Kick drum', 0.74),
  snare: DRUM('snare', 'Snare drum', 0.56),
  rim: DRUM('rim', 'Rim click', 0.61),
  clap: DRUM('clap', 'Hand claps', 0.86),
  hihat: DRUM('hihat', 'Closed hi-hat', 0.57, [['cut', 1]]),
  openhat: DRUM('openhat', 'Open hi-hat', 0.36, [['cut', 1]]),
  tom: DRUM('tom', 'Low tom', 0.67),
  tomhi: DRUM('tomhi', 'High tom', 0.54),
  shaker: DRUM('shaker', 'Shaker', 0.67),
  tambourine: DRUM('tambourine', 'Tambourine', 0.42),
  crash: DRUM('crash', 'Crash cymbal', 0.73),
  piano: TONE('piano', 'Piano', 4, 4.0, [['release', 0.5]]),
  keys: TONE('epiano', 'Electric piano', 4, 1.24, [['release', 0.4]]),
  bass: TONE('ebass', 'Electric bass', 2, 1.86, [['release', 0.12]]),
  guitar: TONE('guitar', 'Nylon guitar', 3, 1.35, [['release', 0.4]]),
  strings: TONE('strings', 'Strings', 3, 2.26, [['attack', 0.15], ['release', 0.7]]),
  trumpet: TONE('trumpet', 'Trumpet', 4, 2.34, [['release', 0.15]]),
  sax: TONE('sax', 'Tenor sax', 3, 1.55, [['release', 0.2]]),
  flute: TONE('flute', 'Flute', 5, 1.34, [['attack', 0.03], ['release', 0.2]]),
  vibes: TONE('vibes', 'Vibraphone', 4, 2.67, [['release', 0.8]]),
  // electronic sounds, made by synthesis
  synthkick: { label: 'Electronic kick (synth)', kind: 'drum', sound: 'sbd', gain: 1.0, params: [['decay', 0.4]] },
  synthsnare: {
    label: 'Electronic snare (synth)',
    kind: 'drum',
    sound: 'white',
    gain: 0.55,
    params: [['hpf', 1500], ['attack', 0.001], ['decay', 0.14], ['sustain', 0]],
  },
  synthhat: {
    label: 'Electronic hi-hat (synth)',
    kind: 'drum',
    sound: 'white',
    gain: 0.32,
    params: [['hpf', 8000], ['attack', 0.001], ['decay', 0.035], ['sustain', 0]],
  },
  synthbass: {
    label: 'Synth bass',
    kind: 'tone',
    sound: 'sawtooth',
    octave: 2,
    gain: 0.55,
    params: [['attack', 0.005], ['decay', 0.18], ['sustain', 0.5], ['release', 0.08]],
  },
  subbass: { label: 'Sub bass (synth)', kind: 'tone', sound: 'sine', octave: 2, gain: 0.8, params: [['attack', 0.01], ['release', 0.1]] },
  pad: {
    label: 'Synth pad',
    kind: 'tone',
    sound: 'supersaw',
    octave: 3,
    gain: 0.28,
    params: [['attack', 0.4], ['sustain', 0.8], ['release', 1.2]],
  },
  lead: {
    label: 'Lead synth',
    kind: 'tone',
    sound: 'square',
    octave: 4,
    gain: 0.28,
    params: [['attack', 0.01], ['sustain', 0.6], ['release', 0.15]],
  },
  bell: {
    label: 'Synth bell',
    kind: 'tone',
    sound: 'sine',
    octave: 5,
    gain: 0.4,
    params: [['fm', 3], ['fmh', 3.5], ['attack', 0.001], ['decay', 0.9], ['sustain', 0]],
  },
};

/** Names used by earlier versions of the page. */
export const INSTR_ALIASES: Record<string, string> = { brass: 'trumpet', pluck: 'guitar' };

export const MAX_LAYERS = 8;

/** Sample files for a recorded instrument: a list, or note name to file. */
export function sampleMap(inst: Instrument): string[] | Record<string, string> {
  if (Array.isArray(inst.sample)) return inst.sample;
  return Object.fromEntries((GM_NOTES[inst.sound] ?? []).map((n) => [n, `${inst.sound}/${n}.mp3`]));
}

export function instrumentList(): string {
  return Object.entries(INSTR)
    .map(([k, v]) => `${k} (${v.kind === 'drum' ? 'drum' : 'pitched'}: ${v.label})`)
    .join(', ');
}
