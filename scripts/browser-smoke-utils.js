const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'output', 'browser-smoke');

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

const browserEnvVars = [
  'BROWSER_EXE',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE',
  'CHROMIUM_EXECUTABLE'
];

function ensureOutputDir() {
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeJson(fileName, data) {
  ensureOutputDir();
  fs.writeFileSync(path.join(outputDir, fileName), `${JSON.stringify(data, null, 2)}\n`);
}

function fileExists(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function candidateBrowserPaths() {
  const candidates = [];
  for (const envVar of browserEnvVars) {
    if (process.env[envVar]) {
      candidates.push({ source: envVar, path: process.env[envVar] });
    }
  }

  if (process.platform === 'win32') {
    const prefixes = [
      process.env.LOCALAPPDATA,
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)']
    ].filter(Boolean);

    for (const prefix of prefixes) {
      candidates.push(
        { source: 'common path', path: path.join(prefix, 'Google', 'Chrome', 'Application', 'chrome.exe') },
        { source: 'common path', path: path.join(prefix, 'Chromium', 'Application', 'chrome.exe') },
        { source: 'common path', path: path.join(prefix, 'Microsoft', 'Edge', 'Application', 'msedge.exe') }
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      { source: 'common path', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { source: 'common path', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
      { source: 'common path', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' }
    );
  } else {
    candidates.push(
      { source: 'common path', path: '/usr/bin/chromium-browser' },
      { source: 'common path', path: '/usr/bin/chromium' },
      { source: 'common path', path: '/usr/bin/google-chrome-stable' },
      { source: 'common path', path: '/usr/bin/google-chrome' },
      { source: 'common path', path: '/usr/bin/microsoft-edge' },
      { source: 'common path', path: '/snap/bin/chromium' }
    );
  }

  return candidates;
}

function findBrowserExecutable() {
  return candidateBrowserPaths().find(candidate => fileExists(candidate.path)) || null;
}

async function launchChromiumWithFallback(playwright, browserExecutable) {
  const launchOptions = { headless: true };
  if (browserExecutable && browserExecutable.source !== 'common path') {
    return {
      browser: await playwright.module.chromium.launch({
        ...launchOptions,
        executablePath: browserExecutable.path
      }),
      browserExecutable
    };
  }

  try {
    return {
      browser: await playwright.module.chromium.launch(launchOptions),
      browserExecutable: null
    };
  } catch (error) {
    if (browserExecutable) {
      return {
        browser: await playwright.module.chromium.launch({
          ...launchOptions,
          executablePath: browserExecutable.path
        }),
        browserExecutable
      };
    }
    if (playwright.packageName === 'playwright-core') {
      console.warn('Playwright is available, but no browser executable was detected.');
      console.warn(`Set one of these env vars to force a Chromium-compatible executable: ${browserEnvVars.join(', ')}`);
    }
    throw error;
  }
}

function isInsideRoot(filePath) {
  const relativePath = path.relative(rootDir, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function startStaticServer(port = 0) {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://127.0.0.1:${port}`);
    let decodedPath;

    try {
      decodedPath = decodeURIComponent(requestUrl.pathname);
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Bad request');
      return;
    }

    const normalizedPath = path.normalize(decodedPath).replace(/^([/\\])+/, '');
    const filePath = path.resolve(rootDir, normalizedPath || 'index.html');

    if (!isInsideRoot(filePath)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
      ? path.join(filePath, 'index.html')
      : filePath;

    fs.readFile(targetPath, (error, content) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
        return;
      }

      response.writeHead(200, {
        'Content-Type': mimeTypes.get(path.extname(targetPath)) || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      response.end(content);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = address && typeof address === 'object' ? address.port : port;
      resolve({
        server,
        url: `http://127.0.0.1:${actualPort}/`,
        reusedExistingServer: false,
        close: () => new Promise(done => server.close(done))
      });
    });
  });
}

async function waitForServer(url, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, response => {
          response.resume();
          response.on('end', resolve);
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy(new Error('Timed out waiting for local server.'));
        });
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  throw lastError || new Error('Timed out waiting for local server.');
}

module.exports = {
  browserEnvVars,
  ensureOutputDir,
  findBrowserExecutable,
  launchChromiumWithFallback,
  outputDir,
  rootDir,
  startStaticServer,
  waitForServer,
  writeJson
};
