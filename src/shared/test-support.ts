// Test helpers. Not imported by the app.
import { mini } from '@strudel/mini';

/** The same check the browser runs, using the parser @strudel/web is built on. */
export function parsesAsMini(source: string): boolean {
  try {
    mini(source);
    return true;
  } catch {
    return false;
  }
}
