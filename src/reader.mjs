import { enforceExtractedTextLimit } from './markdown-parser.mjs';
import { cancelPendingRender, formatError, getDoc, getElementTarget, getScrollTop, isListenSectionOpen } from './utils.mjs';
import { createReaderRenderer } from './reader-renderer.mjs';
import { createReaderNavigation } from './reader-navigation.mjs';

export function createReader(context, { ui, tts, getSettings }) {
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
    syncMobileSheetHeight,
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
        const doc = getDoc(context);
        if (doc && els.toolbar.contains(doc.activeElement)) return;
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
    return Boolean(session.isSpeaking || isListenSectionOpen(context));
  }

  function enterReader() {
    const doc = getDoc(context);
    isPointerOverToolbar = false;
    if (els.inputView) els.inputView.classList.add('hidden');
    if (els.readerView) els.readerView.classList.add('active');
    if (els.backBtn) els.backBtn.classList.add('show');
    if (els.toolbar) els.toolbar.classList.remove('hidden-bar', 'expanded');
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    if (doc && doc.body) {
      doc.body.classList.remove('mobile-sheet-active');
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
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  }

  function goBack() {
    const doc = getDoc(context);
    isPointerOverToolbar = false;
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
      state.toolbarTimer = null;
    }
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
    if (doc && doc.body) {
      doc.body.classList.remove('mobile-sheet-active');
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
      safeText = enforceExtractedTextLimit(text, 'pasted text');
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
    els.clearBtn.style.display = els.pasteArea.value.trim() ? 'inline-flex' : 'none';
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
      const doc = getDoc(context);
      const winScroll = getScrollTop();
      const docHeight = doc && doc.documentElement ? doc.documentElement.scrollHeight : 0;
      const clientHeight = doc && doc.documentElement ? doc.documentElement.clientHeight : 0;
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

  function shouldRevealToolbarOnTap(target) {
    if (!els.readerView || !els.readerView.classList.contains('active') || !els.toolbar) return false;
    if (els.toolbar.contains(target)) return false;
    if (els.backBtn && els.backBtn.contains(target)) return false;
    if (els.mobileFab && els.mobileFab.contains(target)) return false;
    if (els.sheetBackdrop && els.sheetBackdrop.contains(target)) return false;
    if (els.audioPlayerBar && typeof els.audioPlayerBar.contains === 'function' && els.audioPlayerBar.contains(target)) return false;
    if (typeof window !== 'undefined' && typeof window.getSelection === 'function') {
      const selection = window.getSelection();
      if (selection && (!selection.isCollapsed || (selection.toString && selection.toString().length > 0))) {
        return false;
      }
    }
    const element = getElementTarget(target);
    if (element && typeof element.closest === 'function' && element.closest('a[href^="#"]')) return false;
    const session = tts && typeof tts.getSession === 'function' ? tts.getSession() : null;
    if (isClickToSpeakEnabled(session) && els.readerContent && typeof els.readerContent.contains === 'function' && els.readerContent.contains(target)) {
      return false;
    }
    return true;
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    const doc = getDoc(context);
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
          const currentDoc = getDoc(context);
          if (currentDoc && typeof currentDoc.elementFromPoint === 'function' && typeof event.clientX === 'number' && typeof event.clientY === 'number') {
            const el = currentDoc.elementFromPoint(event.clientX, event.clientY);
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
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('click', event => {
        if (shouldRevealToolbarOnTap(event.target)) resetToolbarTimer();
      });
      doc.addEventListener('mousemove', event => {
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
      doc.addEventListener('keydown', event => {
        if (!els.readerView || !els.readerView.classList.contains('active')) return;
        if (event.key === 'Tab' && els.toolbar && els.toolbar.classList.contains('hidden-bar') && !isMobileSheetLayout()) {
          resetToolbarTimer();
        }
        if (event.key === 'Escape') {
          if (els.toolbar && els.toolbar.classList.contains('expanded')) {
            collapseMobileSheet();
            return;
          }
          const currentDoc = getDoc(context);
          const activeEl = currentDoc ? currentDoc.activeElement : null;
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
    collapseMobileSheet,
    enterReader,
    expandMobileSheet,
    goBack,
    isMobileSheetLayout,
    renderTextAsync,
    resetToolbarTimer,
    syncLayoutOnResize,
    syncMobileSheetHeight,
    toggleClearBtn,
    toggleMobileSheet
  };
}
