'use strict';

const assert = require('node:assert/strict');

(async () => {
  const { cleanupLegacyBrowserStorage } = await import('../src/storage.mjs');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  function createStorage(initialEntries) {
    const entries = new Map(Object.entries(initialEntries));
    return {
      get length() { return entries.size; },
      key(index) { return Array.from(entries.keys())[index] ?? null; },
      getItem(key) { return entries.has(key) ? entries.get(key) : null; },
      setItem(key, value) { entries.set(String(key), String(value)); },
      removeItem(key) { entries.delete(key); }
    };
  }

  function setWindow(value) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      enumerable: true,
      writable: true,
      value
    });
  }

  try {
    const localStorage = createStorage({
      reader_text: 'old reader content',
      reader_theme: 'old theme',
      reader_custom_feature: 'belongs to another app',
      'reader:other-app': 'belongs to another app',
      'reader-theme-v2': 'belongs to another app',
      unrelated: 'keep me'
    });
    const sessionStorage = createStorage({
      reader_voice_rate: 'old rate',
      reader_session_for_other_app: 'keep me',
      session_unrelated: 'keep me'
    });

    setWindow({ localStorage, sessionStorage });
    cleanupLegacyBrowserStorage();

    assert.equal(localStorage.getItem('reader_text'), null, 'known legacy reader content should be removed');
    assert.equal(localStorage.getItem('reader_theme'), null, 'known legacy reader settings should be removed');
    assert.equal(sessionStorage.getItem('reader_voice_rate'), null, 'known legacy TTS settings should be removed');
    assert.equal(localStorage.getItem('reader_custom_feature'), 'belongs to another app', 'unlisted reader-prefixed keys must be preserved');
    assert.equal(localStorage.getItem('reader:other-app'), 'belongs to another app', 'colon-prefixed keys must be preserved');
    assert.equal(localStorage.getItem('reader-theme-v2'), 'belongs to another app', 'hyphen-prefixed keys must be preserved');
    assert.equal(sessionStorage.getItem('reader_session_for_other_app'), 'keep me', 'unlisted session keys must be preserved');
    assert.equal(localStorage.getItem('unrelated'), 'keep me', 'unrelated keys must be preserved');
    assert.equal(sessionStorage.getItem('session_unrelated'), 'keep me', 'unrelated session keys must be preserved');

    const accessibleSessionStorage = createStorage({ reader_text: 'legacy', session_unrelated: 'keep' });
    const restrictedWindow = {};
    Object.defineProperty(restrictedWindow, 'localStorage', {
      configurable: true,
      get() { throw new Error('localStorage blocked by browser policy'); }
    });
    Object.defineProperty(restrictedWindow, 'sessionStorage', {
      configurable: true,
      get() { return accessibleSessionStorage; }
    });
    setWindow(restrictedWindow);
    cleanupLegacyBrowserStorage();
    assert.equal(accessibleSessionStorage.getItem('reader_text'), null, 'sessionStorage cleanup should continue when localStorage access is blocked');
    assert.equal(accessibleSessionStorage.getItem('session_unrelated'), 'keep', 'storage access failures must not trigger broad deletion');

    const throwingStorage = {
      removeItem(key) {
        if (key === 'reader_text') throw new Error('Storage write failed or quota exceeded');
      }
    };
    setWindow({ localStorage: throwingStorage, sessionStorage: null });
    assert.doesNotThrow(() => cleanupLegacyBrowserStorage(), 'cleanupLegacyBrowserStorage must handle throwing removeItem gracefully');

    delete globalThis.window;
    assert.doesNotThrow(() => cleanupLegacyBrowserStorage(), 'cleanupLegacyBrowserStorage must not throw when window is undefined');

    console.log('Browser storage cleanup tests passed.');
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      delete globalThis.window;
    }
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
