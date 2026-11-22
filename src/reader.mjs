import { cancelPendingRender, formatError, getElementTarget, getScrollTop } from './utils.mjs';
import { createReaderRenderer } from './reader-renderer.mjs';
import { createReaderNavigation } from './reader-navigation.mjs';

export function createReader(context, { ui, parser, tts, getSettings }) {
  const { els, state } = context;
  let initialized = false;
  let scrollProgressPending = false;
  let isPointerOverToolbar = false;

  const renderer = createReaderRenderer(context, { ui, tts });
  const { renderTextAsync } = renderer;
  const navigation = createReaderNavigation(context, {
    ui,
    getSettings,
    resetToolbarTimer: (...args) => resetToolbarTimer(...args)
  });
  const {
    collapseMobileSheet,
    expandMobileSheet,
    isMobileSheetLayout,
    syncLayoutOnResize,
    toggleMobileSheet
  } = navigation;

  function resetToolbarTimer() {
    if (!els.toolbar) return;
    if (isMobileSheetLayout()) {
      if (typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(state.toolbarTimer);
      ui.setContainerFocusable(els.toolbar, els.toolbar.classList.contains('expanded'));
      return;
    }
    els.toolbar.classList.remove('hidden-bar');
    ui.setContainerFocusable(els.toolbar, true);
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
      if (isPointerOverToolbar) return;
      state.toolbarTimer = window.setTimeout(() => {
        if (isPointerOverToolbar) return;
        if (typeof document !== 'undefined' && els.toolbar.contains(document.activeElement)) return;
        els.toolbar.classList.add('hidden-bar');
        ui.setContainerFocusable(els.toolbar, false);
      }, 3500);
    }
  }

  function updateMarginOnResize() {
    const settings = getSettings();
    if (settings && els.marginInput) settings.updateMarginStyle(parseFloat(els.marginInput.value));
  }

  function isClickToSpeakEnabled(session) {
    if (!session || !session.supported) return false;
    if (session.isSpeaking) return true;
    const listenSection = Array.isArray(els.settingsSections)
      ? els.settingsSections.find(section => section && typeof section.getAttribute === 'function' && section.getAttribute('data-settings-section') === 'listen')
      : (typeof document !== 'undefined' && typeof document.querySelector === 'function'
        ? document.querySelector('[data-settings-section="listen"]')
        : null);
    return Boolean(listenSection && listenSection.classList && listenSection.classList.contains('is-open'));
  }

  function enterReader() {
    isPointerOverToolbar = false;
    if (els.inputView) els.inputView.classList.add('hidden');
    if (els.readerView) els.readerView.classList.add('active');
    if (els.backBtn) els.backBtn.classList.add('show');
    if (els.toolbar) els.toolbar.classList.remove('hidden-bar', 'expanded');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('reader-active');
      els.mobileFab.classList.remove('active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, true);
    resetToolbarTimer();
    if (typeof window !== 'undefined' && window.scrollTo) {
      window.setTimeout(() => window.scrollTo(0, 0), 50);
    }
  }

  function goBack() {
    isPointerOverToolbar = false;
    cancelPendingRender(context, { clearContent: true });
    if (tts && typeof tts.stopTTS === 'function') {
      tts.stopTTS();
    }
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    if (els.toolbar && els.toolbar.classList.contains('expanded')) {
      collapseMobileSheet();
    }
    ui.hideLoader();
    if (els.readerView) els.readerView.classList.remove('active');
    if (els.inputView) els.inputView.classList.remove('hidden');
    if (els.backBtn) els.backBtn.classList.remove('show');
    if (els.toolbar) {
      els.toolbar.classList.add('hidden-bar');
      els.toolbar.classList.remove('expanded');
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
    }
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active', 'reader-active');
      els.mobileFab.setAttribute('aria-expanded', 'false');
      els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
    }
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
    if (els.toolbar) ui.setContainerFocusable(els.toolbar, false);
    if (els.pasteArea && state.currentText) {
      if (els.pasteArea.value !== state.currentText) {
        els.pasteArea.value = state.currentText;
      }
    }
    toggleClearBtn();
    if (els.progressBar) els.progressBar.style.width = '0%';
    if (els.pasteArea && typeof els.pasteArea.focus === 'function') {
      try { els.pasteArea.focus(); } catch (err) {}
    }
  }

  function loadTextFlow(text) {
    if (!text || !text.trim()) {
      ui.showStatus('Please paste text first.', 'error');
      return;
    }
    let safeText;
    try {
      safeText = parser.enforceExtractedTextLimit(text, 'pasted text');
    } catch (err) {
      ui.showStatus(formatError(err), 'error');
      return;
    }
    ui.clearStatus();
    state.currentText = safeText;
    renderTextAsync(state.currentText, enterReader);
  }

  function loadFromPaste() {
    if (!els.pasteArea) return;
    cancelPendingRender(context);
    ui.hideLoader();
    loadTextFlow(els.pasteArea.value);
  }

  function toggleClearBtn() {
    if (!els.clearBtn || !els.pasteArea) return;
    els.clearBtn.style.display = els.pasteArea.value.trim() ? 'block' : 'none';
  }

  function clearText() {
    cancelPendingRender(context, { clearContent: true });
    if (tts && typeof tts.invalidateTokenization === 'function') {
      tts.invalidateTokenization();
    }
    ui.hideLoader();
    state.currentText = '';
    if (els.pasteArea) els.pasteArea.value = '';
    toggleClearBtn();
    ui.showStatus('Text cleared.', 'success');
  }

  function setInputProgress() {
    if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar || scrollProgressPending) return;
    scrollProgressPending = true;

    const executeProgress = () => {
      scrollProgressPending = false;
      if (!els.readerView || !els.readerView.classList.contains('active') || !els.progressBar) return;
      const winScroll = getScrollTop();
      const docHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.scrollHeight : 0;
      const clientHeight = typeof document !== 'undefined' && document.documentElement ? document.documentElement.clientHeight : 0;
      const height = docHeight - clientHeight;
      const scrolled = height > 0 ? (winScroll / height) * 100 : 0;
      els.progressBar.style.width = `${scrolled}%`;
    };

    if (typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(executeProgress);
    } else {
      executeProgress();
    }
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.readBtn) els.readBtn.addEventListener('click', loadFromPaste);
    if (els.clearBtn) els.clearBtn.addEventListener('click', clearText);
    if (els.backBtn) els.backBtn.addEventListener('click', goBack);
    if (els.readerContent) {
      els.readerContent.addEventListener('click', event => {
        const session = tts && typeof tts.getSession === 'function' ? tts.getSession() : null;
        if (!isClickToSpeakEnabled(session)) return;

        if (typeof window !== 'undefined' && window.getSelection) {
          const selection = window.getSelection();
          if (selection && (!selection.isCollapsed || (selection.toString && selection.toString().length > 0))) {
            return;
          }
        }

        const target = getElementTarget(event.target);
        if (!target || target.closest('a, button')) return;

        let currentTarget = target;
        if (!session.wordMeta.length) {
          tts.tokenize();
          if (typeof document !== 'undefined' && typeof document.elementFromPoint === 'function' && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            const el = document.elementFromPoint(event.clientX, event.clientY);
            if (el) currentTarget = el;
          }
        }

        const wordElement = currentTarget.closest('.tts-word');
        if (!wordElement || !wordElement.hasAttribute('data-word-idx')) return;
        const index = parseInt(wordElement.getAttribute('data-word-idx'), 10);
        if (!Number.isNaN(index) && index >= 0 && index < session.wordMeta.length) tts.startSpeech(index);
      });
    }
    if (els.pasteArea) {
      els.pasteArea.addEventListener('input', () => {
        toggleClearBtn();
        ui.clearStatus();
      });
    }
    if (els.toolbar) {
      els.toolbar.addEventListener('click', resetToolbarTimer);
      els.toolbar.addEventListener('touchstart', resetToolbarTimer, { passive: true });
      els.toolbar.addEventListener('touchmove', resetToolbarTimer, { passive: true });
      els.toolbar.addEventListener('mouseenter', () => {
        isPointerOverToolbar = true;
        if (typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(state.toolbarTimer);
      });
      els.toolbar.addEventListener('mouseleave', () => {
        isPointerOverToolbar = false;
        resetToolbarTimer();
      });
      els.toolbar.addEventListener('focusin', () => {
        if (typeof window !== 'undefined' && window.clearTimeout) window.clearTimeout(state.toolbarTimer);
      });
      els.toolbar.addEventListener('focusout', resetToolbarTimer);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('click', event => {
        if (els.readerView && els.readerView.classList.contains('active') && els.toolbar && !els.toolbar.contains(event.target) && els.backBtn && !els.backBtn.contains(event.target) && els.mobileFab && !els.mobileFab.contains(event.target) && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) resetToolbarTimer();
      });
      document.addEventListener('touchstart', event => {
        if (els.readerView && els.readerView.classList.contains('active') && els.toolbar && !els.toolbar.contains(event.target) && els.backBtn && !els.backBtn.contains(event.target) && els.mobileFab && !els.mobileFab.contains(event.target) && els.sheetBackdrop && !els.sheetBackdrop.contains(event.target)) resetToolbarTimer();
      }, { passive: true });
      document.addEventListener('mousemove', event => {
        if (
          els.readerView &&
          els.readerView.classList.contains('active') &&
          els.toolbar &&
          els.toolbar.classList.contains('hidden-bar') &&
          !isMobileSheetLayout() &&
          typeof event.clientY === 'number' &&
          event.clientY <= 80
        ) {
          resetToolbarTimer();
        }
      }, { passive: true });
      document.addEventListener('keydown', event => {
        if (!els.readerView || !els.readerView.classList.contains('active')) return;
        if (event.key === 'Tab' && els.toolbar && els.toolbar.classList.contains('hidden-bar') && !isMobileSheetLayout()) {
          resetToolbarTimer();
        }
        if (event.key === 'Escape') {
          if (els.toolbar && els.toolbar.classList.contains('expanded')) {
            collapseMobileSheet();
            return;
          }
          const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
          const isToolbarFormControl = Boolean(
            activeEl &&
            els.toolbar &&
            els.toolbar.contains(activeEl) &&
            (typeof activeEl.matches === 'function'
              ? activeEl.matches('input, select, textarea')
              : /^(INPUT|SELECT|TEXTAREA)$/i.test(activeEl.tagName || ''))
          );
          if (isToolbarFormControl && typeof activeEl.blur === 'function') {
            activeEl.blur();
            return;
          }
          const selection = typeof window !== 'undefined' && typeof window.getSelection === 'function'
            ? window.getSelection()
            : null;
          if (selection && !selection.isCollapsed && typeof selection.removeAllRanges === 'function') {
            selection.removeAllRanges();
            return;
          }
          goBack();
        }
        const settings = getSettings();
        if (event.key === 'ArrowRight' && settings && settings.canUseGlobalPresetShortcut(event)) {
          event.preventDefault();
          settings.nextPreset();
        }
        if (event.key === 'ArrowLeft' && settings && settings.canUseGlobalPresetShortcut(event)) {
          event.preventDefault();
          settings.prevPreset();
        }
      });
    }
    if (els.mobileFab) els.mobileFab.addEventListener('click', toggleMobileSheet);
    if (els.sheetBackdrop) els.sheetBackdrop.addEventListener('click', collapseMobileSheet);
    if (els.bottomSheetHandle) els.bottomSheetHandle.addEventListener('click', collapseMobileSheet);
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', setInputProgress, { passive: true });
      window.addEventListener('resize', () => {
        updateMarginOnResize();
        syncLayoutOnResize();
      });
    }
  }

  return {
    bindEvents,
    cancelPendingRender: options => cancelPendingRender(context, options),
    collapseMobileSheet,
    enterReader,
    expandMobileSheet,
    goBack,
    isMobileSheetLayout,
    loadFromPaste,
    loadTextFlow,
    renderTextAsync,
    resetToolbarTimer,
    syncLayoutOnResize,
    toggleClearBtn,
    toggleMobileSheet,
    updateMarginOnResize
  };
}
