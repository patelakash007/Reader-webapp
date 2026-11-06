'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_PATH = path.join(__dirname, '../sw.js');
const SW_SOURCE = fs.readFileSync(SW_PATH, 'utf8');

const cacheNameMatch = SW_SOURCE.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
const CURRENT_CACHE_NAME = cacheNameMatch ? cacheNameMatch[1] : 'reader-webapp-shell-v11';

const appShellMatches = SW_SOURCE.match(/const\s+APP_SHELL\s*=\s*\[([\s\S]*?)\];/);
const APP_SHELL_COUNT = appShellMatches ? (appShellMatches[1].match(/'[^']+'/g) || []).length : 27;

class FakeResponse {
  constructor(body = '', { ok = true, status = 200 } = {}) {
    this.body = body;
    this.ok = ok;
    this.status = status;
  }

  clone() {
    return new FakeResponse(this.body, { ok: this.ok, status: this.status });
  }
}

class FakeRequest {
  constructor(url, options = {}) {
    this.url = String(url);
    this.method = options.method || 'GET';
    this.mode = options.mode || 'same-origin';
  }
}

class FakeCache {
  constructor() {
    this.entries = new Map();
  }

  key(request) {
    return request.url || String(request);
  }

  async match(request) {
    return this.entries.get(this.key(request));
  }

  async put(request, response) {
    this.entries.set(this.key(request), response);
  }

  async addAll(requests) {
    for (const request of requests) {
      const response = await globalFetch(request);
      if (!response.ok) throw new Error(`Unable to precache ${request.url}`);
      await this.put(request, response.clone());
    }
  }
}

const cachesByName = new Map();
const eventHandlers = new Map();
const waitUntilPromises = [];
let fetchQueue = [];
let fetchCalls = [];

function globalFetch(request, options) {
  fetchCalls.push({ request, options });
  const next = fetchQueue.shift();
  if (!next) return Promise.reject(new Error('No fetch response queued.'));
  return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
}

const self = {
  location: { origin: 'https://reader.example.test' },
  registration: { scope: 'https://reader.example.test/' },
  skipWaitingCalls: 0,
  clients: { claimCalls: 0 },
  addEventListener(type, handler) {
    eventHandlers.set(type, handler);
  },
  skipWaiting() {
    this.skipWaitingCalls += 1;
    return Promise.resolve();
  }
};
self.clients.claim = () => {
  self.clients.claimCalls += 1;
  return Promise.resolve();
};

const context = vm.createContext({
  self,
  URL,
  Set,
  Promise,
  Request: FakeRequest,
  Response: Object.assign(FakeResponse, { error: () => new FakeResponse('', { ok: false, status: 0 }) }),
  console: { warn() {}, log() {} },
  fetch: globalFetch,
  caches: {
    async open(name) {
      if (!cachesByName.has(name)) cachesByName.set(name, new FakeCache());
      return cachesByName.get(name);
    },
    async keys() {
      return [...cachesByName.keys()];
    },
    async delete(name) {
      return cachesByName.delete(name);
    }
  }
});
vm.runInContext(SW_SOURCE, context, { filename: SW_PATH });

function makeEvent({ request } = {}) {
  const responses = [];
  const event = {
    request,
    responses,
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    },
    respondWith(promise) {
      responses.push(Promise.resolve(promise));
    }
  };
  return event;
}

async function drainWaitUntil() {
  while (waitUntilPromises.length) {
    const pending = waitUntilPromises.splice(0);
    await Promise.all(pending);
  }
}

function queueFetch(...responses) {
  fetchQueue.push(...responses);
}

function resetRuntime() {
  fetchQueue = [];
  fetchCalls = [];
  waitUntilPromises.length = 0;
  cachesByName.clear();
}

async function testInstallAndActivateVersionedCaches() {
  resetRuntime();
  queueFetch(...Array.from({ length: APP_SHELL_COUNT }, () => new FakeResponse('asset')));

  const installEvent = makeEvent();
  eventHandlers.get('install')(installEvent);
  await drainWaitUntil();

  assert.equal(self.skipWaitingCalls > 0, true, 'install should call skipWaiting');
  assert.equal(cachesByName.has(CURRENT_CACHE_NAME), true, 'install should create current cache');

  cachesByName.set('reader-webapp-shell-v9', new FakeCache());
  cachesByName.set('reader-webapp-shell-v10', new FakeCache());
  cachesByName.set('unrelated-cache', new FakeCache());
  const activateEvent = makeEvent();
  eventHandlers.get('activate')(activateEvent);
  await drainWaitUntil();

  assert.equal(cachesByName.has('reader-webapp-shell-v9'), false, 'old reader cache should be deleted');
  assert.equal(cachesByName.has('reader-webapp-shell-v10'), false, 'previous reader cache should be deleted');
  assert.equal(cachesByName.has(CURRENT_CACHE_NAME), true, 'current reader cache should remain');
  assert.equal(cachesByName.has('unrelated-cache'), true, 'unrelated caches should not be deleted');
  assert.equal(self.clients.claimCalls > 0, true, 'activate should claim clients');
}

async function testVendorUsesStaleWhileRevalidate() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  const request = new FakeRequest('https://reader.example.test/vendor/marked.esm.mjs');
  await cache.put(request, new FakeResponse('old-vendor'));
  queueFetch(new FakeResponse('new-vendor'));

  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];
  await drainWaitUntil();

  assert.equal(response.body, 'old-vendor', 'vendor request should return cached content immediately');
  assert.equal(fetchCalls.length, 1, 'cached vendor request should revalidate once');
  assert.equal(fetchCalls[0].options.cache, 'no-cache', 'vendor revalidation should bypass browser HTTP cache');
  assert.equal((await cache.match(request)).body, 'new-vendor', 'revalidated vendor response should replace stale cache');
}

async function testAppShellUsesStaleWhileRevalidate() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  const request = new FakeRequest('https://reader.example.test/style.css');
  await cache.put(request, new FakeResponse('old-style'));
  queueFetch(new FakeResponse('new-style'));

  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];
  await drainWaitUntil();

  assert.equal(response.body, 'old-style', 'app shell request should return cached content immediately');
  assert.equal(fetchCalls.length, 1, 'cached app shell request should revalidate once');
  assert.equal(fetchCalls[0].options.cache, 'no-cache', 'app shell revalidation should bypass browser HTTP cache');
  assert.equal((await cache.match(request)).body, 'new-style', 'revalidated app shell response should replace stale cache');
}

async function testVendorOfflineFallback() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  const request = new FakeRequest('https://reader.example.test/vendor/marked.esm.mjs');
  await cache.put(request, new FakeResponse('cached-marked'));
  queueFetch(new Error('offline'));

  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];
  await drainWaitUntil();

  assert.equal(response.body, 'cached-marked', 'offline vendor request should use cached content');
}

async function testCanonicalNavigationFallsBackOnServerError() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  await cache.put(new FakeRequest('https://reader.example.test/index.html'), new FakeResponse('cached-shell'));
  queueFetch(new FakeResponse('server-error', { ok: false, status: 503 }));

  const request = new FakeRequest('https://reader.example.test/', { mode: 'navigate' });
  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];

  assert.equal(response.body, 'cached-shell', 'canonical navigation should fall back on HTTP errors');
}

async function testNonCanonicalNavigationKeepsServerError() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  await cache.put(new FakeRequest('https://reader.example.test/index.html'), new FakeResponse('cached-shell'));
  const serverError = new FakeResponse('not-found', { ok: false, status: 404 });
  queueFetch(serverError);

  const request = new FakeRequest('https://reader.example.test/other-route', { mode: 'navigate' });
  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];

  assert.equal(response, serverError, 'non-canonical navigation should preserve server response even when the app shell is cached');
}

async function testNonCanonicalNavigationDoesNotUseAppShellWhenOffline() {
  resetRuntime();
  const cache = new FakeCache();
  cachesByName.set(CURRENT_CACHE_NAME, cache);
  await cache.put(new FakeRequest('https://reader.example.test/index.html'), new FakeResponse('cached-shell'));
  queueFetch(new Error('offline'));

  const request = new FakeRequest('https://reader.example.test/other-route', { mode: 'navigate' });
  const event = makeEvent({ request });
  eventHandlers.get('fetch')(event);
  const response = await event.responses[0];

  assert.equal(response.status, 0, 'non-canonical navigation should return a network error rather than the cached app shell');
}

async function run() {
  const tests = [
    ['versioned cache install/activate', testInstallAndActivateVersionedCaches],
    ['vendor stale-while-revalidate', testVendorUsesStaleWhileRevalidate],
    ['app shell stale-while-revalidate', testAppShellUsesStaleWhileRevalidate],
    ['vendor offline fallback', testVendorOfflineFallback],
    ['navigation fallback on HTTP error', testCanonicalNavigationFallsBackOnServerError],
    ['non-canonical navigation preserves HTTP error', testNonCanonicalNavigationKeepsServerError],
    ['non-canonical navigation does not mask offline errors', testNonCanonicalNavigationDoesNotUseAppShellWhenOffline]
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`✓ ${name}`);
  }

  console.log(`PWA behavior tests passed: ${tests.length}/${tests.length}`);
}

run().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
