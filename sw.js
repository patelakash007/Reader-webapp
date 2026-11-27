'use strict';

// Bump CACHE_NAME whenever APP_SHELL files change so updates install into a fresh cache atomically.
const CACHE_NAME = 'reader-webapp-shell-v15';
const CACHE_PREFIX = 'reader-webapp-';
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './src/app.mjs',
  './src/constants.mjs',
  './src/context.mjs',
  './src/dom.mjs',
  './src/markdown-parser.mjs',
  './src/reader.mjs',
  './src/reader-renderer.mjs',
  './src/reader-navigation.mjs',
  './src/settings.mjs',
  './src/preset-carousel.mjs',
  './src/tts-core.mjs',
  './src/tts-controller.mjs',
  './src/ui.mjs',
  './src/utils.mjs',
  './manifest.webmanifest',
  './vendor/marked.esm.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png'
];

const ROOT_URL = new URL('./', self.registration.scope).href;
const INDEX_URL = new URL('./index.html', self.registration.scope).href;
const APP_SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));
const CANONICAL_NAVIGATION_URLS = new Set([ROOT_URL, INDEX_URL]);

function getRequestUrl(request) {
  const url = new URL(request.url);
  url.hash = '';
  const withoutSearch = new URL(url.href);
  withoutSearch.search = '';
  if (withoutSearch.href === ROOT_URL) {
    return ROOT_URL;
  }
  if (withoutSearch.href === INDEX_URL) {
    return INDEX_URL;
  }
  return url.href;
}

function isSameOriginGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

function isCanonicalAppShellRequest(request) {
  return isSameOriginGet(request) && APP_SHELL_URLS.has(getRequestUrl(request));
}

function isCanonicalNavigation(request) {
  return request.mode === 'navigate' && CANONICAL_NAVIGATION_URLS.has(getRequestUrl(request));
}

function safeCachePut(cache, request, response) {
  try {
    return cache.put(request, response).catch(err => {
      console.warn('Service worker cache write failed.', err);
    });
  } catch (err) {
    console.warn('Service worker cache write failed.', err);
    return Promise.resolve();
  }
}

async function cacheCanonicalNavigation(cache, request, response) {
  if (!response || !response.ok || !isCanonicalNavigation(request)) return;

  const requestUrl = getRequestUrl(request);
  const cacheWrites = [safeCachePut(cache, requestUrl, response.clone())];

  if (requestUrl === ROOT_URL) {
    cacheWrites.push(safeCachePut(cache, INDEX_URL, response.clone()));
  } else if (requestUrl === INDEX_URL) {
    cacheWrites.push(safeCachePut(cache, ROOT_URL, response.clone()));
  }

  await Promise.all(cacheWrites);
}

async function navigationResponse(request) {
  const canonicalNavigation = isCanonicalNavigation(request);
  const cache = await caches.open(CACHE_NAME);

  try {
    const fetchOptions = canonicalNavigation ? { cache: 'no-cache' } : undefined;
    const response = await fetch(request, fetchOptions);
    if (response && response.ok) {
      await cacheCanonicalNavigation(cache, request, response);
      return response;
    }

    if (!canonicalNavigation) return response || Response.error();
    const cachedShell = await cache.match(INDEX_URL) || await cache.match(ROOT_URL);
    return cachedShell || response || Response.error();
  } catch (err) {
    if (!canonicalNavigation) return Response.error();
    const cachedShell = await cache.match(INDEX_URL) || await cache.match(ROOT_URL);
    return cachedShell || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cacheKey = getRequestUrl(request);
  const cached = await cache.match(cacheKey);
  const networkUpdate = fetch(request, { cache: 'no-cache' })
    .then(async response => {
      if (response && response.ok) {
        await safeCachePut(cache, cacheKey, response.clone());
      }
      return response;
    });

  event.waitUntil(networkUpdate.catch(() => undefined));

  if (cached) return cached;
  return networkUpdate.catch(() => Response.error());
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const requests = APP_SHELL.map(path => new Request(new URL(path, self.registration.scope), { cache: 'reload' }));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    if (url.origin === self.location.origin && url.href.startsWith(self.registration.scope)) {
      event.respondWith(navigationResponse(request));
    }
    return;
  }

  if (isCanonicalAppShellRequest(request)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});
