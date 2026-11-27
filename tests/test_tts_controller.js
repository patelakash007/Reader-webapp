'use strict';

const assert = require('node:assert');

class FakeUtterance {
  constructor(text) {
    this.text = text;
    this.rate = 1;
    this.pitch = 1;
    this.voice = null;
    this.onstart = null;
    this.onboundary = null;
    this.onend = null;
    this.onerror = null;
  }
}

class FakeSynth {
  constructor() {
    this.speaking = false;
    this.paused = false;
    this.history = [];
    this.onvoiceschanged = null;
  }
  speak(utterance) {
    this.speaking = true;
    this.paused = false;
    this.history.push({ action: 'speak', text: utterance.text, rate: utterance.rate });
    if (utterance.onstart) utterance.onstart();
  }
  pause() {
    this.paused = true;
    this.history.push({ action: 'pause' });
  }
  resume() {
    this.paused = false;
    this.history.push({ action: 'resume' });
  }
  cancel() {
    this.speaking = false;
    this.paused = false;
    this.history.push({ action: 'cancel' });
  }
  getVoices() {
    return [];
  }
}

function classList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); },
    toggle(value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    }
  };
}

(async () => {
  global.SpeechSynthesisUtterance = FakeUtterance;
  global.document = {
    hidden: false,
    addEventListener() {},
    createElement() {
      return { value: '', textContent: '', selected: false, dataset: {} };
    }
  };
  const { createAppContext } = await import('../src/context.mjs');
  const { createTTS } = await import('../src/tts-controller.mjs');

  function createFixture(isMobile) {
    const synth = new FakeSynth();
    const spans = Array.from({ length: 9 }, () => ({ classList: classList(), scrollIntoView() {} }));
    const audioBarAttrs = { 'aria-hidden': 'true' };
    const focusabilityLog = [];
    const audioPlayerBar = {
      classList: classList(),
      setAttribute(name, value) { audioBarAttrs[name] = value; },
      getAttribute(name) { return audioBarAttrs[name]; }
    };
    const context = createAppContext({
      readerContent: { classList: classList(), querySelectorAll: () => [], contains: () => true },
      voiceRateInput: { value: '1.0' },
      ttsBtn: null,
      ttsStopBtn: null,
      audioPlayerBar,
      audioPlayPauseBtn: null,
      audioStopBtn: null,
      audioStatusText: null,
      audioSpeedBtn: null,
      voiceSelect: null
    });
    const session = context.runtime.tts;
    session.supported = true;
    session.synth = synth;
    session.isMobile = isMobile;
    session.wordSpans = spans;
    session.wordMeta = [
      { index: 0, text: 'The', start: 0, end: 3, element: spans[0] },
      { index: 1, text: 'quick', start: 4, end: 9, element: spans[1] },
      { index: 2, text: 'brown', start: 10, end: 15, element: spans[2] },
      { index: 3, text: 'fox', start: 16, end: 19, element: spans[3] },
      { index: 4, text: 'jumps', start: 20, end: 25, element: spans[4] },
      { index: 5, text: 'over', start: 26, end: 30, element: spans[5] },
      { index: 6, text: 'the', start: 31, end: 34, element: spans[6] },
      { index: 7, text: 'lazy', start: 35, end: 39, element: spans[7] },
      { index: 8, text: 'dog', start: 40, end: 43, element: spans[8] }
    ];
    session.fullSpokenText = 'The quick brown fox jumps over the lazy dog';
    const ui = {
      showStatus() {},
      announceLive() {},
      setContainerFocusable(container, enabled) {
        if (container === audioPlayerBar) focusabilityLog.push(enabled);
      }
    };
    const controller = createTTS(context, { ui });
    return { audioPlayerBar, controller, focusabilityLog, session, synth };
  }

  const desktop = createFixture(false);
  desktop.controller.startSpeech(0);
  assert.strictEqual(desktop.session.state, 'playing');
  assert.strictEqual(desktop.audioPlayerBar.getAttribute('aria-hidden'), 'false', 'Active audio player bar should expose aria-hidden=false');
  assert.strictEqual(desktop.focusabilityLog.at(-1), true, 'Active audio player bar should become focusable');
  assert.strictEqual(desktop.session.wordSpans.length, 9);
  assert(desktop.session.keepAliveTimer);
  desktop.controller.pauseSpeech();
  assert.strictEqual(desktop.session.state, 'paused');
  assert.strictEqual(desktop.synth.history.at(-1).action, 'pause');
  desktop.controller.resumeSpeech();
  assert.strictEqual(desktop.session.state, 'playing');
  assert.strictEqual(desktop.synth.history.at(-1).action, 'resume');
  desktop.controller.stopTTS();
  assert.strictEqual(desktop.session.state, 'idle');
  assert.strictEqual(desktop.audioPlayerBar.getAttribute('aria-hidden'), 'true', 'Idle audio player bar should restore aria-hidden=true');
  assert.strictEqual(desktop.focusabilityLog.at(-1), false, 'Idle audio player bar should remove controls from tab order');

  // pageHideTimer lifecycle guards
  desktop.controller.handlePageHide();
  assert.strictEqual(desktop.session.pageHideTimer, null, 'handlePageHide while idle must not schedule a cancel timer');
  desktop.controller.startSpeech(0);
  desktop.controller.handlePageHide();
  assert(desktop.session.pageHideTimer, 'handlePageHide while speaking should pause and schedule cancel timer');
  desktop.controller.handlePageShow();
  assert.strictEqual(desktop.session.pageHideTimer, null, 'handlePageShow must clear pending pageHideTimer');
  desktop.controller.handlePageHide();
  assert(desktop.session.pageHideTimer, 'handlePageHide while paused should schedule cancel timer');
  desktop.controller.stopTTS();
  assert.strictEqual(desktop.session.pageHideTimer, null, 'stopTTS must clear pending pageHideTimer');

  // Desktop long pause test (F-09)
  const longPauseDesktop = createFixture(false);
  longPauseDesktop.controller.startSpeech(0);
  longPauseDesktop.controller.pauseSpeech();
  assert.strictEqual(longPauseDesktop.session.state, 'paused');
  longPauseDesktop.session.pausedAt = Date.now() - 20000;
  longPauseDesktop.controller.resumeSpeech();
  assert.strictEqual(longPauseDesktop.session.state, 'playing');
  const recentActions = longPauseDesktop.synth.history.slice(-2).map(h => h.action);
  assert(recentActions.includes('cancel') && recentActions.includes('speak'), `Expected cancel and speak on long pause restart, got: ${recentActions.join(', ')}`);
  assert(!recentActions.includes('resume'), 'Long pause resume should not invoke synth.resume');
  longPauseDesktop.controller.stopTTS();

  const mobile = createFixture(true);
  mobile.controller.startSpeech(2);
  assert.strictEqual(mobile.session.state, 'playing');
  assert.strictEqual(mobile.session.keepAliveTimer, null);
  mobile.controller.pauseSpeech();
  assert.strictEqual(mobile.session.state, 'paused');
  assert.strictEqual(mobile.synth.history.at(-1).action, 'cancel');
  mobile.controller.resumeSpeech();
  assert.strictEqual(mobile.session.state, 'playing');
  const latestSpeech = mobile.synth.history.filter(entry => entry.action === 'speak').at(-1);
  assert(latestSpeech.text.startsWith('brown'));
  mobile.controller.stopTTS();
  assert.strictEqual(mobile.session.state, 'idle');

  // Test idle invalidateTokenization vs active stopTTS announcements (F-04)
  const announcements = [];
  const announcementContext = createAppContext({
    readerContent: { querySelectorAll: () => [], contains: () => true },
    voiceRateInput: { value: '1.0' }
  });
  announcementContext.runtime.tts.supported = true;
  announcementContext.runtime.tts.synth = new FakeSynth();
  announcementContext.runtime.tts.wordSpans = [];
  announcementContext.runtime.tts.wordMeta = [{ index: 0, text: 'Hello', start: 0, end: 5 }];
  announcementContext.runtime.tts.fullSpokenText = 'Hello';
  const announcementUI = { showStatus() {}, announceLive(msg) { announcements.push(msg); } };
  const announcementController = createTTS(announcementContext, { ui: announcementUI });

  announcementController.invalidateTokenization();
  assert.strictEqual(announcements.length, 0, `Expected 0 announcements while idle, got: ${announcements.length}`);

  announcementContext.runtime.tts.wordSpans = [
    { classList: classList(), scrollIntoView() {} }
  ];
  announcementContext.runtime.tts.wordMeta = [{ index: 0, text: 'Hello', start: 0, end: 5 }];
  announcementContext.runtime.tts.fullSpokenText = 'Hello';

  announcementController.startSpeech(0);
  assert.strictEqual(announcements.filter(a => a === 'Text-to-speech started.').length, 1);
  announcementController.stopTTS();
  const stopAnnouncements = announcements.filter(a => a === 'Text-to-speech stopped.');
  assert.strictEqual(stopAnnouncements.length, 1, `Expected exactly 1 stop announcement, got: ${stopAnnouncements.length}`);

  announcementController.stopTTS();
  const secondStopCount = announcements.filter(a => a === 'Text-to-speech stopped.').length;
  assert.strictEqual(secondStopCount, 1, 'Second stopTTS while idle should not announce');

  // Test voice select churn prevention and late-arriving voices (F-11)
  let innerHtmlAssignCount = 0;
  const mockVoiceSelect = {
    value: '',
    _innerHTML: '',
    set innerHTML(val) {
      innerHtmlAssignCount++;
      this._innerHTML = val;
    },
    get innerHTML() {
      return this._innerHTML;
    },
    appendChild() {}
  };
  const voiceSynth = new FakeSynth();
  const testVoices = [
    { name: 'Alex', lang: 'en-US', voiceURI: 'alex-uri', default: true },
    { name: 'Samantha', lang: 'en-US', voiceURI: 'samantha-uri', default: false }
  ];
  voiceSynth.getVoices = () => testVoices;

  const voiceContext = createAppContext({
    voiceSelect: mockVoiceSelect,
    voiceRateInput: { value: '1.0' }
  });
  voiceContext.runtime.tts.supported = true;
  voiceContext.runtime.tts.synth = voiceSynth;
  const voiceController = createTTS(voiceContext, { ui: { showStatus() {}, announceLive() {} } });

  voiceController.initializeVoices();
  assert.strictEqual(innerHtmlAssignCount, 1, `Expected innerHTML assigned once on initial populate, got ${innerHtmlAssignCount}`);
  assert.strictEqual(voiceContext.runtime.tts.voices.length, 2);
  assert.strictEqual(typeof voiceSynth.onvoiceschanged, 'function', 'onvoiceschanged should stay attached for late-arriving voices');

  voiceSynth.onvoiceschanged();
  assert.strictEqual(innerHtmlAssignCount, 1, `Expected innerHTML NOT reassigned when voice signature matches, got ${innerHtmlAssignCount}`);

  voiceSynth.getVoices = () => [
    ...testVoices,
    { name: 'Victoria', lang: 'en-US', voiceURI: 'victoria-uri', default: false }
  ];
  voiceSynth.onvoiceschanged();
  assert.strictEqual(innerHtmlAssignCount, 2, `Expected innerHTML reassigned when late voices arrive, got ${innerHtmlAssignCount}`);
  assert.strictEqual(voiceContext.runtime.tts.voices.length, 3);

  // Test voice speed cycling (F-12)
  const speedRateInput = { value: '1.0' };
  const speedRateVal = { textContent: '1.0x' };
  const speedBtn = { textContent: '1.0x' };
  const speedContext = createAppContext({
    voiceRateInput: speedRateInput,
    voiceRateVal: speedRateVal,
    audioSpeedBtn: speedBtn
  });
  const speedController = createTTS(speedContext, { ui: { showStatus() {}, announceLive() {} } });

  speedRateInput.value = '0.9';
  speedController.cycleVoiceSpeed();
  assert.strictEqual(speedRateInput.value, 1.0, `Expected 0.9 to advance to 1.0, got ${speedRateInput.value}`);

  speedRateInput.value = '1.2';
  speedController.cycleVoiceSpeed();
  assert.strictEqual(speedRateInput.value, 1.5, `Expected 1.2 to advance to 1.5, got ${speedRateInput.value}`);

  speedRateInput.value = '2.0';
  speedController.cycleVoiceSpeed();
  assert.strictEqual(speedRateInput.value, 0.8, `Expected 2.0 to wrap around to 0.8, got ${speedRateInput.value}`);

  speedRateInput.value = '2.4';
  speedController.cycleVoiceSpeed();
  assert.strictEqual(speedRateInput.value, 0.8, `Expected 2.4 to wrap around to 0.8, got ${speedRateInput.value}`);

  // Test fallback estimateTimer progression and startingChunkIndex safety
  const estimateSynth = new FakeSynth();
  let estimateUtterance = null;
  estimateSynth.speak = (u) => {
    estimateUtterance = u;
  };
  const estimateContext = createAppContext({
    voiceRateInput: { value: '1.0' },
    readerContent: { querySelectorAll: () => [], contains: () => true }
  });
  estimateContext.runtime.tts.supported = true;
  estimateContext.runtime.tts.synth = estimateSynth;
  estimateContext.runtime.tts.wordMeta = [
    { index: 0, text: 'First', start: 0, end: 5 },
    { index: 1, text: 'Second', start: 6, end: 12 },
    { index: 2, text: 'Third', start: 13, end: 18 }
  ];
  estimateContext.runtime.tts.wordSpans = [
    { classList: classList(), scrollIntoView() {} },
    { classList: classList(), scrollIntoView() {} },
    { classList: classList(), scrollIntoView() {} }
  ];
  estimateContext.runtime.tts.fullSpokenText = 'First Second Third';
  const estimateController = createTTS(estimateContext, { ui: { showStatus() {}, announceLive() {} } });
  estimateController.startSpeech(0);
  assert(estimateUtterance, 'Utterance must be created for speech');
  estimateUtterance.onstart();
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.strictEqual(estimateContext.runtime.tts.state, 'playing');
  assert(estimateContext.runtime.tts.currentWordIndex >= 0, 'Word highlight should advance via estimate timer');
  estimateController.stopTTS();

  // Test unsupported TTS environment
  const unsupportedContext = createAppContext({
    voiceRateInput: { value: '1.0' },
    readerContent: { querySelectorAll: () => [], contains: () => true }
  });
  unsupportedContext.runtime.tts.supported = false;
  unsupportedContext.runtime.tts.synth = null;
  const unsupportedController = createTTS(unsupportedContext, { ui: { showStatus() {}, announceLive() {} } });
  assert.doesNotThrow(() => {
    unsupportedController.startSpeech(0);
    unsupportedController.pauseSpeech();
    unsupportedController.resumeSpeech();
    unsupportedController.toggleTTS();
    unsupportedController.stopTTS();
    unsupportedController.populateVoices();
  }, 'Unsupported TTS environment methods must not throw');
  assert.strictEqual(unsupportedContext.runtime.tts.state, 'idle');

  // Test startSpeech boundary clamping
  const boundsFixture = createFixture(false);
  boundsFixture.controller.startSpeech(-10);
  assert.strictEqual(boundsFixture.session.state, 'playing');
  assert.strictEqual(boundsFixture.session.currentWordIndex, 0, 'Negative word index should clamp to 0');
  boundsFixture.controller.stopTTS();

  boundsFixture.controller.startSpeech(999);
  assert.strictEqual(boundsFixture.session.state, 'playing');
  assert.strictEqual(boundsFixture.session.currentWordIndex, boundsFixture.session.wordMeta.length - 1, 'Out-of-bounds index should clamp to last word');
  boundsFixture.controller.stopTTS();

  console.log('Production TTS controller state-machine tests passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
