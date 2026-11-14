// The parts of @strudel/web that Groove Loom uses. The package ships no types.
declare module '@strudel/web' {
  export interface Fraction {
    valueOf(): number;
  }
  export interface Hap {
    part: { begin: Fraction; end: Fraction };
    value: unknown;
  }
  export interface Pattern {
    queryArc(begin: number, end: number): Hap[];
    swingBy(amount: number, subdivision: number): Pattern;
    [method: string]: unknown;
  }
  export interface Scheduler {
    now(): number;
  }
  export interface Repl {
    scheduler: Scheduler;
    setCps(cps: number): void;
    setPattern(pattern: Pattern, autostart?: boolean): Promise<unknown>;
    stop(): void;
  }
  export interface SuperdoughOutput {
    destinationGain: AudioNode;
  }

  export function initStrudel(options?: { prebake?: () => unknown }): Promise<Repl>;
  export function samples(map: Record<string, unknown>, baseUrl?: string): Promise<unknown>;
  export function loadBuffer(url: string, ctx: AudioContext, sound?: string): Promise<AudioBuffer>;
  export function getAudioContext(): AudioContext;
  export function loadWorklets(): Promise<unknown>;
  export function getSuperdoughAudioController(): { output: SuperdoughOutput };
  export function mini(source: string): Pattern;
  export function noteToMidi(note: string): number;
  export function s(...args: unknown[]): Pattern;
  export function n(...args: unknown[]): Pattern;
  export function stack(...patterns: Pattern[]): Pattern;
  export const silence: Pattern;
}
