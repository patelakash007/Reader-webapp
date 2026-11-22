import { createAppContext } from './context.mjs';
import { collectElements } from './dom.mjs';
import { createParser } from './parser.mjs';
import { createReader } from './reader.mjs';
import { createSettings } from './settings.mjs';
import { cleanupLegacyBrowserStorage } from './storage.mjs';
import { createTTS } from './tts.mjs';
import { createUI } from './ui.mjs';

const initializedDocuments = new WeakSet();

function registerServiceWorker(documentObject) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(err => {
        console.warn('Service worker registration failed.', err);
      });
  };

  if (documentObject && documentObject.readyState === 'complete') register();
  else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('load', register, { once: true });
  }
}

export function init(documentObject = document) {
  if (!documentObject || initializedDocuments.has(documentObject)) return;
  initializedDocuments.add(documentObject);

  const els = collectElements(documentObject);
  const context = createAppContext(els, documentObject);
  const ui = createUI(context);
  const tts = createTTS(context, { ui });
  const parser = createParser();
  let reader;
  const settings = createSettings(context, {
    isMobileSheetLayout: () => reader && reader.isMobileSheetLayout(),
    onResetToolbarTimer: () => reader && reader.resetToolbarTimer()
  });
  reader = createReader(context, {
    getSettings: () => settings,
    parser,
    tts,
    ui
  });

  cleanupLegacyBrowserStorage();
  registerServiceWorker(documentObject);
  settings.bindEvents();
  reader.bindEvents();
  tts.bindEvents();

  settings.resetSettingsSections();
  context.state.smartHeadings = true;
  settings.setMode('light', { presetIndex: 0, resetTimer: false });
  settings.setSize('medium');
  reader.toggleClearBtn();
  if (els.toolbar) ui.setContainerFocusable(els.toolbar, false);
  if (els.audioPlayerBar) {
    if (typeof els.audioPlayerBar.setAttribute === 'function') {
      els.audioPlayerBar.setAttribute('aria-hidden', 'true');
    }
    ui.setContainerFocusable(els.audioPlayerBar, false);
  }

  const defaultLineHeight = 1.85;
  if (els.lineHeightInput) els.lineHeightInput.value = defaultLineHeight;
  if (els.readerContent && els.readerContent.style) els.readerContent.style.lineHeight = defaultLineHeight;

  const defaultLetterSpacing = -0.015;
  if (els.letterSpacingInput) els.letterSpacingInput.value = defaultLetterSpacing;
  if (els.readerContent && els.readerContent.style) els.readerContent.style.letterSpacing = `${defaultLetterSpacing}em`;

  const defaultMargin = 24;
  if (els.marginInput) els.marginInput.value = defaultMargin;
  settings.updateMarginStyle(defaultMargin);

  const defaultVoiceRate = 1.0;
  if (els.voiceRateInput) els.voiceRateInput.value = defaultVoiceRate;
  if (els.voiceRateVal) els.voiceRateVal.textContent = `${defaultVoiceRate.toFixed(1)}x`;
  if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${defaultVoiceRate.toFixed(1)}x`;

  tts.initializeVoices();
  return { context, parser, reader, settings, tts, ui };
}
