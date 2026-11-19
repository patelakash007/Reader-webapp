import {
  BOUNDARY_FALLBACK_MS,
  KEEP_ALIVE_MS,
  PAGEHIDE_CANCEL_TIMEOUT,
  SPEED_STEPS,
  STATE_IDLE,
  STATE_PAUSED,
  STATE_PLAYING,
  VOICE_POLL_MS,
  VOICE_POLL_TIMEOUT,
  WORDS_PER_MIN
} from './constants.mjs';
import { clampNumber } from './utils.mjs';
import { chunkText, deduplicateAndSortVoices, resolveVoiceIndex, tokenizeReaderDOM } from './tts-core.mjs';

export function createTTS(context, { ui }) {
  const { els, runtime } = context;
  const session = runtime.tts;
  let initialized = false;

  function clearHighlight() {
    if (session.currentWordIndex >= 0 && session.wordSpans[session.currentWordIndex]) {
      session.wordSpans[session.currentWordIndex].classList.remove('active');
    }
    if (els.readerContent) {
      els.readerContent.querySelectorAll('.tts-word.active').forEach(span => span.classList.remove('active'));
    }
    session.currentWordIndex = -1;
  }

  function findWordIndexByChar(absIndex) {
    const meta = session.wordMeta;
    if (!meta.length || absIndex < meta[0].start) return -1;
    let low = 0;
    let high = meta.length - 1;
    let best = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const m = meta[mid];
      if (m.start <= absIndex) {
        if (absIndex < m.end) return mid;
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  function findFirstWordEndingAfter(charOffset) {
    const meta = session.wordMeta;
    if (!meta.length) return -1;
    let low = 0;
    let high = meta.length - 1;
    let best = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (meta[mid].end > charOffset) {
        best = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
    return best;
  }

  function scrollSpanIntoView(span) {
    if (!span) return;
    const rect = typeof span.getBoundingClientRect === 'function' ? span.getBoundingClientRect() : null;
    const viewportHeight = typeof window !== 'undefined'
      ? (window.innerHeight || (typeof document !== 'undefined' && document.documentElement?.clientHeight) || 800)
      : 800;
    if (rect && rect.top >= 80 && rect.bottom <= (viewportHeight - 100)) return;
    const rate = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : '1.0') || 1.0;
    const reducedMotion = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scrollBehavior = (rate > 1.5 || reducedMotion) ? 'auto' : 'smooth';
    try {
      span.scrollIntoView({ block: 'nearest', behavior: scrollBehavior });
    } catch (err) {
      if (typeof span.scrollIntoView === 'function') span.scrollIntoView();
    }
  }

  function highlightAtIndex(absIndex) {
    if (!session.wordMeta.length) return;

    // Fast-path short-circuits: check current word and next word
    const curr = session.currentWordIndex;
    if (curr >= 0 && curr < session.wordMeta.length) {
      const w = session.wordMeta[curr];
      if (absIndex >= w.start && absIndex < w.end) return;
      if (curr + 1 < session.wordMeta.length) {
        const next = session.wordMeta[curr + 1];
        if (absIndex >= next.start && absIndex < next.end) {
          if (session.wordSpans[curr]) session.wordSpans[curr].classList.remove('active');
          session.currentWordIndex = curr + 1;
          const nextSpan = session.wordSpans[curr + 1];
          if (nextSpan) {
            nextSpan.classList.add('active');
            scrollSpanIntoView(nextSpan);
          }
          return;
        }
      }
    }

    const index = findWordIndexByChar(absIndex);
    if (index === -1 || index === session.currentWordIndex) return;
    if (session.currentWordIndex >= 0 && session.wordSpans[session.currentWordIndex]) {
      session.wordSpans[session.currentWordIndex].classList.remove('active');
    }
    session.currentWordIndex = index;
    const span = session.wordSpans[index];
    if (!span) return;
    span.classList.add('active');
    scrollSpanIntoView(span);
  }

  function tokenize() {
    clearHighlight();
    const result = tokenizeReaderDOM(els.readerContent);
    session.wordSpans = result.spans;
    session.wordMeta = result.meta;
    session.fullSpokenText = result.text;
    return result;
  }

  function invalidateTokenization() {
    stopTTS();
    session.wordSpans = [];
    session.wordMeta = [];
    session.fullSpokenText = '';
    session.chunks = [];
    session.chunkIndex = 0;
    session.currentWordIndex = -1;
  }

  function populateVoices() {
    if (!session.supported || !els.voiceSelect) return;
    const list = session.synth.getVoices();
    if (!list || !list.length) return;
    const sorted = deduplicateAndSortVoices(Array.from(list));
    const signature = sorted.map(v => `${v.voiceURI || v.name}|${v.lang}`).join(';');
    if (signature && signature === session.voicesSignature) return;
    session.voicesSignature = signature;
    session.voices = sorted;
    const previousSelection = els.voiceSelect.value || '';
    els.voiceSelect.innerHTML = '';
    session.voices.forEach((voice, index) => {
      const option = document.createElement('option');
      option.value = voice.voiceURI || String(index);
      option.textContent = `${voice.name} (${voice.lang})${voice.default ? ' — default' : ''}`;
      els.voiceSelect.appendChild(option);
    });
    const userLanguage = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const selectedIndex = resolveVoiceIndex(session.voices, previousSelection, userLanguage);
    if (selectedIndex >= 0) els.voiceSelect.value = session.voices[selectedIndex].voiceURI || String(selectedIndex);
  }

  function pollVoices() {
    if (!session.supported) return;
    let elapsed = 0;
    const intervalId = setInterval(() => {
      elapsed += VOICE_POLL_MS;
      populateVoices();
      if (session.voices.length || elapsed >= VOICE_POLL_TIMEOUT) {
        clearInterval(intervalId);
        if (session.voices.length && session.synth && 'onvoiceschanged' in session.synth) {
          session.synth.onvoiceschanged = null;
        }
      }
    }, VOICE_POLL_MS);
  }

  function getSelectedVoice() {
    if (!session.voices.length || !els.voiceSelect) return null;
    const value = els.voiceSelect.value;
    return session.voices.find(voice => voice.voiceURI === value) || session.voices[parseInt(value, 10)] || session.voices[0] || null;
  }

  function stopEstimateTimer() {
    if (session.estimateTimer) {
      clearInterval(session.estimateTimer);
      session.estimateTimer = null;
    }
  }

  function startEstimateTimer(chunk, generation) {
    stopEstimateTimer();
    if (!session.wordMeta.length) return;
    const rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : '1.0', 1.0, 0.5, 2.5);
    const startingChunkIndex = session.chunkIndex;
    const firstWord = findFirstWordEndingAfter(chunk.start);
    const chunkFirstWordIndex = firstWord === -1 ? session.wordMeta.length - 1 : firstWord;
    const lastWordIdx = findWordIndexByChar(chunk.end - 1);
    const lastWord = lastWordIdx >= chunkFirstWordIndex ? lastWordIdx : chunkFirstWordIndex;
    const firstWordIndex = (session.currentWordIndex >= chunkFirstWordIndex && session.currentWordIndex <= lastWord)
      ? session.currentWordIndex
      : chunkFirstWordIndex;
    let elapsed = 0;
    if (firstWordIndex >= 0 && firstWordIndex < session.wordMeta.length) highlightAtIndex(session.wordMeta[firstWordIndex].start);

    session.estimateTimer = setInterval(() => {
      if (generation !== session.speechGeneration || session.finishing || session.state !== STATE_PLAYING || session.chunkIndex !== startingChunkIndex) {
        stopEstimateTimer();
        return;
      }
      elapsed += BOUNDARY_FALLBACK_MS;
      const wordsPerMs = (WORDS_PER_MIN * rate) / 60000;
      const estimatedOffset = Math.floor(elapsed * wordsPerMs);
      const index = Math.min(lastWord, firstWordIndex + estimatedOffset);
      if (index >= firstWordIndex && index !== session.currentWordIndex && index < session.wordMeta.length) {
        highlightAtIndex(session.wordMeta[index].start);
      }
    }, BOUNDARY_FALLBACK_MS);
  }

  function stopKeepAliveTimer() {
    if (session.keepAliveTimer) {
      clearInterval(session.keepAliveTimer);
      session.keepAliveTimer = null;
    }
  }

  function startKeepAliveTimer() {
    stopKeepAliveTimer();
    if (session.isMobile) return;
    session.keepAliveTimer = setInterval(() => {
      if (session.finishing || session.state !== STATE_PLAYING) return;
      try {
        if (session.synth && session.synth.speaking) {
          session.synth.pause();
          session.synth.resume();
        }
      } catch (err) {}
    }, KEEP_ALIVE_MS);
  }

  function setState(nextState) {
    session.state = nextState;
    const idle = nextState === STATE_IDLE;
    const playing = nextState === STATE_PLAYING;
    const paused = nextState === STATE_PAUSED;
    session.isSpeaking = playing || paused;
    session.pausedAt = paused ? (session.pausedAt || Date.now()) : 0;

    if (els.ttsBtn) {
      els.ttsBtn.classList.toggle('active', playing || paused);
      els.ttsBtn.setAttribute('aria-pressed', playing ? 'true' : 'false');
      if (playing) {
        els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x23F8;</span> Pause';
        els.ttsBtn.setAttribute('aria-label', 'Pause Read Aloud');
        els.ttsBtn.setAttribute('title', 'Pause Read Aloud');
      } else if (paused) {
        els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x25B6;</span> Resume';
        els.ttsBtn.setAttribute('aria-label', 'Resume Read Aloud');
        els.ttsBtn.setAttribute('title', 'Resume Read Aloud');
      } else {
        els.ttsBtn.innerHTML = '<span aria-hidden="true">&#x1F50A;</span> Read Aloud';
        els.ttsBtn.setAttribute('aria-label', 'Start Read Aloud');
        els.ttsBtn.setAttribute('title', 'Start Read Aloud');
      }
    }
    if (els.ttsStopBtn) els.ttsStopBtn.disabled = idle;
    if (els.audioPlayerBar) els.audioPlayerBar.classList.toggle('active', !idle);
    if (els.audioPlayPauseBtn) {
      if (playing) {
        els.audioPlayPauseBtn.innerHTML = '<span aria-hidden="true">&#x23F8;</span>';
        els.audioPlayPauseBtn.setAttribute('aria-label', 'Pause narration');
        els.audioPlayPauseBtn.setAttribute('title', 'Pause narration');
      } else {
        els.audioPlayPauseBtn.innerHTML = '<span aria-hidden="true">&#x25B6;</span>';
        els.audioPlayPauseBtn.setAttribute('aria-label', paused ? 'Resume narration' : 'Play narration');
        els.audioPlayPauseBtn.setAttribute('title', paused ? 'Resume narration' : 'Play narration');
      }
    }
    if (els.audioStopBtn) els.audioStopBtn.disabled = idle;
    if (els.audioStatusText) els.audioStatusText.textContent = playing ? 'Speaking...' : paused ? 'Paused' : 'Speech Ready';
  }

  function buildUtterance(chunk, generation) {
    const utterance = new SpeechSynthesisUtterance(chunk.text);
    const voice = getSelectedVoice();
    if (voice) {
      try {
        utterance.voice = voice;
        if (voice.lang) utterance.lang = voice.lang;
      } catch (err) {}
    }
    utterance.rate = clampNumber(els.voiceRateInput ? els.voiceRateInput.value : '1.0', 1.0, 0.5, 2.5);
    utterance.pitch = 1;
    session.chunkHasBoundary = false;

    utterance.onboundary = event => {
      if (generation !== session.speechGeneration || (event.name && event.name !== 'word')) return;
      session.chunkHasBoundary = true;
      stopEstimateTimer();
      highlightAtIndex(chunk.start + event.charIndex);
    };
    utterance.onstart = () => {
      if (generation !== session.speechGeneration || session.finishing) return;
      if (!session.chunkHasBoundary) startEstimateTimer(chunk, generation);
    };
    utterance.onend = () => {
      if (generation !== session.speechGeneration || session.finishing) return;
      stopEstimateTimer();
      if (session.state === STATE_PLAYING && session.chunkIndex < session.chunks.length - 1) {
        session.chunkIndex += 1;
        speakChunk(session.chunks[session.chunkIndex], generation);
      } else if (session.state === STATE_PLAYING) {
        finishSpeech();
      }
    };
    utterance.onerror = event => {
      if (generation !== session.speechGeneration || session.finishing) return;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        stopEstimateTimer();
        if (session.state === STATE_PLAYING) finishSpeech();
        return;
      }
      if (event.error === 'not-allowed' || session.state !== STATE_IDLE) {
        const message = event.error === 'not-allowed'
          ? 'Speech permission was denied. Check your browser audio settings.'
          : 'Speech playback stopped unexpectedly. Try another voice or browser.';
        ui.showStatus(message, 'error');
        finishSpeech();
      }
    };
    return utterance;
  }

  function speakChunk(chunk, generation = session.speechGeneration) {
    if (!session.supported || !session.synth) return;
    session.currentUtterance = buildUtterance(chunk, generation);
    session.synth.speak(session.currentUtterance);
  }

  function restartFromWord(index) {
    if (!session.supported || !session.synth || !session.fullSpokenText || !session.wordMeta.length) return;
    const meta = session.wordMeta[index];
    const startChar = meta ? meta.start : 0;
    session.chunks = chunkText(session.fullSpokenText.slice(startChar), startChar);
    session.chunkIndex = 0;
    session.finishing = false;
    session.visibilityInterrupted = false;
    session.speechCanceledWhileHidden = false;
    session.speechGeneration += 1;
    try { session.synth.cancel(); } catch (err) {}
    setState(STATE_PLAYING);
    startKeepAliveTimer();
    if (session.chunks.length) {
      speakChunk(session.chunks[0], session.speechGeneration);
      highlightAtIndex(startChar);
    } else finishSpeech();
  }

  function startSpeech(fromWordIndex = 0) {
    if (!session.supported || !session.synth) {
      ui.showStatus('Text-to-speech is not supported in your browser.', 'error');
      return;
    }
    if (!els.readerContent) return;
    if (!session.wordMeta.length) tokenize();
    if (!session.fullSpokenText || !session.wordMeta.length) {
      ui.showStatus('No text content available to read.', 'info');
      return;
    }
    const targetIndex = Math.max(0, Math.min(fromWordIndex, session.wordMeta.length - 1));
    restartFromWord(targetIndex);
    ui.announceLive('Text-to-speech started.');
  }

  function pauseSpeech() {
    if (session.state !== STATE_PLAYING) return;
    stopEstimateTimer();
    stopKeepAliveTimer();
    if (session.isMobile) {
      session.speechGeneration += 1;
      try { session.synth.cancel(); } catch (err) {}
    } else {
      try { session.synth.pause(); } catch (err) {}
    }
    setState(STATE_PAUSED);
    ui.announceLive('Text-to-speech paused.');
  }

  function resumeSpeech() {
    if (session.state !== STATE_PAUSED) return;
    const isLongPause = Boolean(session.pausedAt && (Date.now() - session.pausedAt > 10000));
    if (session.isMobile || session.speechCanceledWhileHidden || session.visibilityInterrupted || isLongPause) {
      restartFromWord(session.currentWordIndex >= 0 ? session.currentWordIndex : 0);
    } else {
      try { session.synth.resume(); } catch (err) {}
      setState(STATE_PLAYING);
      startKeepAliveTimer();
      if (!session.chunkHasBoundary && session.chunks[session.chunkIndex]) {
        startEstimateTimer(session.chunks[session.chunkIndex], session.speechGeneration);
      }
    }
    ui.announceLive('Text-to-speech resumed.');
  }

  function finishSpeech() {
    stopTTS();
  }

  function stopTTS() {
    if (session.finishing) return;
    const wasActive = session.state !== STATE_IDLE;
    session.finishing = true;
    session.speechGeneration += 1;
    session.visibilityInterrupted = false;
    session.speechCanceledWhileHidden = false;
    stopEstimateTimer();
    stopKeepAliveTimer();
    if (session.supported && session.synth) {
      try { session.synth.cancel(); } catch (err) {}
    }
    session.currentUtterance = null;
    clearHighlight();
    if (wasActive) {
      setState(STATE_IDLE);
    }
    session.finishing = false;
    if (wasActive) {
      ui.announceLive('Text-to-speech stopped.');
    }
  }

  function toggleTTS() {
    if (!session.supported || !session.synth) {
      ui.showStatus('Text-to-speech is not supported in your browser.', 'error');
      return;
    }
    if (session.state === STATE_PLAYING) pauseSpeech();
    else if (session.state === STATE_PAUSED) resumeSpeech();
    else startSpeech(0);
  }

  function cycleVoiceSpeed() {
    const current = parseFloat(els.voiceRateInput ? els.voiceRateInput.value : '1.0') || 1.0;
    const nextSpeed = SPEED_STEPS.find(s => s > current + 0.049) ?? SPEED_STEPS[0];
    if (els.voiceRateInput) els.voiceRateInput.value = nextSpeed;
    if (els.voiceRateVal) els.voiceRateVal.textContent = `${nextSpeed.toFixed(1)}x`;
    if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${nextSpeed.toFixed(1)}x`;
    ui.announceLive(`Speech speed changed to ${nextSpeed.toFixed(1)}x.`);
    if (session.state === STATE_PLAYING) restartFromWord(session.currentWordIndex >= 0 ? session.currentWordIndex : 0);
    else if (session.state === STATE_PAUSED) session.visibilityInterrupted = true;
  }

  function handlePageHide() {
    if (session.pageHideTimer) clearTimeout(session.pageHideTimer);
    if (session.state === STATE_PLAYING) {
      session.visibilityInterrupted = true;
      stopEstimateTimer();
      stopKeepAliveTimer();
      if (session.isMobile) {
        session.speechGeneration += 1;
        try { session.synth.cancel(); } catch (err) {}
      } else {
        try { session.synth.pause(); } catch (err) {}
      }
      setState(STATE_PAUSED);
    }
    session.pageHideTimer = setTimeout(() => {
      if (session.visibilityInterrupted && session.state === STATE_PAUSED) session.speechCanceledWhileHidden = true;
      try { session.synth.cancel(); } catch (err) {}
    }, PAGEHIDE_CANCEL_TIMEOUT);
  }

  function handlePageShow() {
    if (session.pageHideTimer) {
      clearTimeout(session.pageHideTimer);
      session.pageHideTimer = null;
    }
  }

  function handleVisibilityChange() {
    if (typeof document !== 'undefined' && document.hidden) {
      if (session.state === STATE_PLAYING) {
        session.visibilityInterrupted = true;
        stopEstimateTimer();
        stopKeepAliveTimer();
        if (session.isMobile) {
          session.speechGeneration += 1;
          try { session.synth.cancel(); } catch (err) {}
        } else {
          try { session.synth.pause(); } catch (err) {}
        }
        setState(STATE_PAUSED);
      }
    }
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.ttsBtn) els.ttsBtn.addEventListener('click', toggleTTS);
    if (els.ttsStopBtn) els.ttsStopBtn.addEventListener('click', stopTTS);
    if (els.audioPlayPauseBtn) els.audioPlayPauseBtn.addEventListener('click', toggleTTS);
    if (els.audioStopBtn) els.audioStopBtn.addEventListener('click', stopTTS);
    if (els.audioSpeedBtn) els.audioSpeedBtn.addEventListener('click', cycleVoiceSpeed);
    if (els.voiceSelect) {
      els.voiceSelect.addEventListener('change', () => {
        if (session.state === STATE_PLAYING) restartFromWord(session.currentWordIndex >= 0 ? session.currentWordIndex : 0);
        else if (session.state === STATE_PAUSED) session.visibilityInterrupted = true;
      });
    }
    if (els.voiceRateInput && els.voiceRateVal) {
      els.voiceRateInput.addEventListener('input', () => {
        const value = clampNumber(els.voiceRateInput.value, 1.0, 0.5, 2.5);
        els.voiceRateInput.value = value;
        els.voiceRateVal.textContent = `${value.toFixed(1)}x`;
        if (els.audioSpeedBtn) els.audioSpeedBtn.textContent = `${value.toFixed(1)}x`;
      });
      els.voiceRateInput.addEventListener('change', () => {
        const value = clampNumber(els.voiceRateInput.value, 1.0, 0.5, 2.5);
        ui.announceLive(`Speech speed changed to ${value.toFixed(1)}x.`);
        if (session.state === STATE_PLAYING) restartFromWord(session.currentWordIndex >= 0 ? session.currentWordIndex : 0);
        else if (session.state === STATE_PAUSED) session.visibilityInterrupted = true;
      });
    }
    if (session.supported && session.synth) {
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
  }

  function initializeVoices() {
    if (!session.supported || !session.synth) return;
    populateVoices();
    if (session.voices.length) {
      if ('onvoiceschanged' in session.synth) session.synth.onvoiceschanged = null;
    } else {
      if ('onvoiceschanged' in session.synth) {
        session.synth.onvoiceschanged = () => {
          populateVoices();
          if (session.voices.length && 'onvoiceschanged' in session.synth) {
            session.synth.onvoiceschanged = null;
          }
        };
      }
      pollVoices();
    }
  }

  return {
    bindEvents,
    initializeVoices,
    cycleVoiceSpeed,
    findWordIndexByChar,
    getSession: () => session,
    highlightAtIndex,
    invalidateTokenization,
    pauseSpeech,
    populateVoices,
    restartFromWord,
    resumeSpeech,
    setState,
    startSpeech,
    stopTTS,
    tokenize,
    tokenizeReaderDOM,
    toggleTTS
  };
}
