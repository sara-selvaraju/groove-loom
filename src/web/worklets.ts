// Strudel embeds its audio processors as data: URLs, which the Content
// Security Policy blocks (script-src 'self'). scripts/extract-worklets.mjs
// writes the same processors to /worklets/ at build time; this redirects each
// load to its file. Must run before Strudel starts its audio engine.
import manifest from '../../public/worklets/manifest.json';

const FILES: Record<string, string> = manifest;
const PREFIX = 'data:text/javascript;base64,';

export function redirectWorklets(): void {
  if (!window.AudioWorklet) return;
  const orig = AudioWorklet.prototype.addModule;
  AudioWorklet.prototype.addModule = function (url: string | URL, opts?: WorkletOptions) {
    try {
      if (typeof url === 'string' && url.startsWith(PREFIX)) {
        const m = /registerProcessor\(\s*["']([^"']+)["']/.exec(atob(url.slice(PREFIX.length)));
        const file = m && FILES[m[1]!];
        if (file) url = new URL(`worklets/${file}`, document.baseURI).href;
      }
    } catch (e) {
      console.warn('worklet redirect failed', e);
    }
    return orig.call(this, url, opts);
  };
}
