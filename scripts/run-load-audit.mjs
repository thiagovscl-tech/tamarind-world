import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = Number(process.env.TAMARIND_AUDIT_PORT || 4174);
const runRoot = path.join(repoRoot, '.audit-output', new Date().toISOString().replaceAll(':', '-'));
await mkdir(runRoot, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // The preview process is still starting.
    }
    await sleep(250);
  }
  throw new Error('Vite preview did not become ready.');
}

async function openBrowser(profilePath) {
  await mkdir(profilePath, { recursive: true });
  const browser = spawn(chromePath, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=Translate,MediaRouter',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    `--user-data-dir=${profilePath}`,
    '--remote-debugging-port=0',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const webSocketUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Chrome DevTools endpoint timed out. ${stderr}`)), 15000);
    browser.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    browser.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before DevTools was ready (${code}). ${stderr}`));
    });
  });

  return { browser, webSocketUrl };
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  send(method, params = {}, sessionId = undefined) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function runAudit({ name, profilePath, landmarkStage = null }) {
  const { browser, webSocketUrl } = await openBrowser(profilePath);
  const cdp = new CdpClient(webSocketUrl);
  try {
    await cdp.connect();
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    const params = new URLSearchParams({ perf: 'load-audit' });
    if (landmarkStage !== null) params.set('landmarkStage', String(landmarkStage));
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/?${params}` }, sessionId);

    const deadline = Date.now() + 70000;
    let payload = null;
    while (Date.now() < deadline) {
      const evaluation = await cdp.send('Runtime.evaluate', {
        expression: "document.querySelector('#tamarind-perf-diagnostic')?.textContent || null",
        returnByValue: true,
      }, sessionId);
      payload = evaluation.result?.value || null;
      if (payload) break;
      await sleep(250);
    }
    if (!payload) throw new Error(`Diagnostic payload timed out for ${name}.`);

    const diagnostic = JSON.parse(payload);
    const maxLongTaskMs = Math.max(0, ...diagnostic.longTaskDetails.map((task) => task.durationMs));
    return {
      name,
      stage: landmarkStage === null ? 'full' : `L${landmarkStage}`,
      firstRenderMs: diagnostic.firstRenderMs,
      landmarksReadyMs: diagnostic.landmarksReadyMs,
      worldCompleteMs: diagnostic.worldCompleteMs,
      longTaskCount: diagnostic.longTaskCount,
      longTaskTotalMs: diagnostic.longTaskTotalMs,
      maxLongTaskMs,
      glbRequestCount: diagnostic.glbRequestCount,
      totalTransferBytes: diagnostic.totalTransferBytes,
      diagnostic,
    };
  } finally {
    try {
      await cdp.send('Browser.close');
    } catch {
      browser.kill();
    }
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      sleep(3000).then(() => browser.kill()),
    ]);
  }
}

const viteEntry = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const server = spawn(process.execPath, [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: repoRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  await waitForServer();
  const runs = [];
  for (let index = 1; index <= 3; index += 1) {
    runs.push(await runAudit({
      name: `cold-${index}`,
      profilePath: path.join(runRoot, `profile-cold-${index}`),
    }));
  }

  const warmProfile = path.join(runRoot, 'profile-warm');
  await runAudit({ name: 'warm-prime', profilePath: warmProfile });
  for (let index = 1; index <= 3; index += 1) {
    runs.push(await runAudit({ name: `warm-${index}`, profilePath: warmProfile }));
  }

  for (let landmarkStage = 0; landmarkStage <= 3; landmarkStage += 1) {
    runs.push(await runAudit({
      name: `stage-L${landmarkStage}`,
      profilePath: path.join(runRoot, `profile-stage-L${landmarkStage}`),
      landmarkStage,
    }));
  }

  console.table(runs.map(({ diagnostic, ...summary }) => summary));
  const resultPath = path.join(runRoot, 'results.json');
  await writeFile(resultPath, JSON.stringify(runs, null, 2));
  console.log(`RESULTS_JSON=${resultPath}`);
} finally {
  server.kill();
}
