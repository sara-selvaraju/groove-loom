// Mini-notation check on the server, with the same parser @strudel/web is
// built on (a unit test fails if the versions drift).
import { mini } from '@strudel/mini';

export function parsesAsMini(source: string): boolean {
  try {
    mini(source);
    return true;
  } catch {
    return false;
  }
}
