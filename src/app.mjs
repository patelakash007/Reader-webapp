import {
  DEFAULT_LETTER_SPACING,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MARGIN,
  DEFAULT_VOICE_RATE
} from './constants.mjs';
import { createAppContext } from './context.mjs';
import { collectElements } from './dom.mjs';
import { createReader } from './reader.mjs';
import { createSettings } from './settings.mjs';
import { createTTS } from './tts-controller.mjs';
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
  let reader;
  const settings = createSettings(context, {
    isMobileSheetLayout: () => reader && reader.isMobileSheetLayout(),
    onResetToolbarTimer: () => reader && reader.resetToolbarTimer(),
    onSettingsSectionToggle: () => reader && reader.syncMobileSheetHeight()
  });
  reader = createReader(context, {
    getSettings: () => settings,
    tts,
    ui
  });

  registerServiceWorker(documentObject);
  settings.bindEvents();
  reader.bindEvents();
  tts.bindEvents();

  settings.resetSettingsSections();
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

  settings.setLineHeight(DEFAULT_LINE_HEIGHT);
  settings.setLetterSpacing(DEFAULT_LETTER_SPACING);
  if (els.marginInput) els.marginInput.value = DEFAULT_MARGIN;
  settings.updateMarginStyle(DEFAULT_MARGIN);

  const rateText = `${DEFAULT_VOICE_RATE.toFixed(1)}x`;
  if (els.voiceRateInput) els.voiceRateInput.value = DEFAULT_VOICE_RATE;
  if (els.voiceRateVal) els.voiceRateVal.textContent = rateText;
  if (els.audioSpeedBtn) {
    els.audioSpeedBtn.textContent = rateText;
    if (typeof els.audioSpeedBtn.setAttribute === 'function') {
      els.audioSpeedBtn.setAttribute('aria-label', `Narration speed: ${rateText}`);
    }
  }

  tts.initializeVoices();
  return { context, reader, settings, tts, ui };
}
