interface Health {
  ok: boolean;
  version: string;
  commit: string;
}

const statusEl = document.querySelector<HTMLParagraphElement>('#status');

async function checkHealth(): Promise<void> {
  if (!statusEl) return;
  try {
    const res = await fetch('/healthz', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const health = (await res.json()) as Health;
    const commit = health.commit === 'unknown' ? '' : `, build ${health.commit.slice(0, 7)}`;
    statusEl.textContent = `Server is up: version ${health.version}${commit}.`;
    statusEl.dataset.state = 'ok';
  } catch (err) {
    statusEl.textContent = `Could not reach the server (${err instanceof Error ? err.message : 'unknown error'}).`;
    statusEl.dataset.state = 'error';
  }
}

void checkHealth();
