// The JSON schema Claude's reply must follow (structured outputs). It narrows
// names to the whitelist up front; numbers are still clamped and notation is
// still checked by sanitizePiece, because the schema cannot express ranges or
// mini-notation.
import { INSTR, KEYS, MAX_LAYERS, SCALES } from './vocabulary.js';

const euclid = {
  type: 'object',
  properties: {
    mode: { const: 'euclid' },
    hits: { type: 'integer' },
    steps: { type: 'integer' },
    rotate: { type: 'integer' },
  },
  required: ['mode', 'hits', 'steps', 'rotate'],
  additionalProperties: false,
} as const;

const steps = {
  type: 'object',
  properties: {
    mode: { const: 'steps' },
    pattern: { type: 'string' },
  },
  required: ['mode', 'pattern'],
  additionalProperties: false,
} as const;

const layer = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    instrument: { type: 'string', enum: Object.keys(INSTR) },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    rhythm: { anyOf: [euclid, steps, { type: 'null' }] },
    volume: { type: 'number' },
    tone: { type: 'number' },
    space: { type: 'number' },
    octave: { type: 'integer' },
    muted: { type: 'boolean' },
    echo: { type: 'number' },
    grit: { type: 'number' },
    accent: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    about: { type: 'string' },
  },
  required: ['id', 'name', 'instrument', 'notes', 'rhythm', 'volume', 'tone', 'space', 'octave', 'muted', 'echo', 'grit', 'accent', 'about'],
  additionalProperties: false,
} as const;

export const COMPOSE_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    piece: {
      type: 'object',
      properties: {
        tempo: { type: 'number' },
        key: { type: 'string', enum: [...KEYS] },
        scale: { type: 'string', enum: Object.keys(SCALES) },
        swing: { type: 'number' },
        layers: { type: 'array', items: layer, description: `At most ${MAX_LAYERS} layers.` },
      },
      required: ['tempo', 'key', 'scale', 'swing', 'layers'],
      additionalProperties: false,
    },
  },
  required: ['reply', 'piece'],
  additionalProperties: false,
} as const;
