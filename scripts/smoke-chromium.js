const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  browserEnvVars,
  ensureOutputDir,
  findBrowserExecutable,
  outputDir,
  startStaticServer,
  waitForServer,
  writeJson
} = require('./browser-smoke-utils');

function runBrowser(executablePath, args, stdio = 'pipe') {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { stdio });
    let stdout = '';
    let stderr = '';

    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

function hasSandboxFailure(stderr = '') {
  return /No usable sandbox/i.test(stderr);
}

async function runBrowserWithSandboxFallback(executablePath, args, stdio = 'pipe') {
  const initialResult = await runBrowser(executablePath, args, stdio);

  if (initialResult.code === 0 || !hasSandboxFailure(initialResult.stderr)) {
    return initialResult;
  }

  const retryArgs = [...args, '--no-sandbox'];
  const retryResult = await runBrowser(executablePath, retryArgs, stdio);
  return {
    ...retryResult,
    usedNoSandboxFallback: true
  };
}

async function runChromiumSmoke() {
  ensureOutputDir();
  const browser = findBrowserExecutable();

  if (!browser) {
    console.error('Chromium-only smoke skipped: no Chromium, Chrome, or Edge executable was found.');
    console.error(`Set one of these env vars to force a browser path: ${browserEnvVars.join(', ')}`);
    process.exit(1);
  }

  const localServer = await startStaticServer();
  const url = localServer.url;

  try {
    await waitForServer(url);
    if (localServer.reusedExistingServer) {
      console.log(`Reusing existing local server at ${url}`);
    }
    const screenshotPath = path.join(outputDir, 'chromium-smoke.png');
    const htmlPath = path.join(outputDir, 'chromium-smoke.html');
    const commonArgs = [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--window-size=1280,900'
    ];

    const domResult = await runBrowserWithSandboxFallback(browser.path, [...commonArgs, '--dump-dom', url]);
    fs.writeFileSync(htmlPath, domResult.stdout || '');

    if (domResult.code !== 0) {
      throw new Error(`Chromium DOM smoke failed with exit code ${domResult.code}: ${domResult.stderr}`);
    }

    if (!domResult.stdout.includes('Reader Webapp') && !domResult.stdout.includes('id="app"')) {
      throw new Error('Chromium DOM smoke did not find the app shell marker.');
    }

    const screenshotResult = await runBrowserWithSandboxFallback(browser.path, [
      ...commonArgs,
      `--screenshot=${screenshotPath}`,
      url
    ]);

    if (screenshotResult.code !== 0) {
      throw new Error(`Chromium screenshot smoke failed with exit code ${screenshotResult.code}: ${screenshotResult.stderr}`);
    }

    if (domResult.usedNoSandboxFallback || screenshotResult.usedNoSandboxFallback) {
      console.warn('Chromium sandbox was unavailable; retried smoke checks with --no-sandbox.');
    }

    writeJson('chromium-smoke.json', {
      mode: 'chromium-only',
      url,
      browserExecutable: browser.path,
      browserSource: browser.source,
      html: path.relative(process.cwd(), htmlPath),
      screenshot: path.relative(process.cwd(), screenshotPath),
      limitations: [
        'Chromium-only smoke checks app load, DOM output, and screenshot capture.',
        'Playwright smoke is needed for full interaction checks, console errors, page errors, and mobile viewport coverage.'
      ]
    });

    console.log(`Chromium-only smoke passed using ${browser.source}: ${browser.path}`);
    console.log(`Saved HTML and screenshot under ${path.relative(process.cwd(), outputDir)}`);
    console.log('Limitation: Chromium-only smoke checks app load/screenshot only; run Playwright smoke for interaction and error capture.');
  } finally {
    await localServer.close();
  }
}

runChromiumSmoke().catch(error => {
  console.error(error.message);
  process.exit(1);
});
