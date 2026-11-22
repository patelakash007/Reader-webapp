export function createReaderNavigation(context, { ui, getSettings, resetToolbarTimer }) {
  const { els, state, runtime } = context;
  let sheetFocusTrapListener = null;
  let sheetFocusTrapTarget = null;

  const FOCUSABLE_SELECTOR = [
    'button:not([disabled]):not([tabindex="-1"])',
    '[href]:not([tabindex="-1"])',
    'input:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  function getDoc() {
    return context.doc || (typeof document !== 'undefined' ? document : null);
  }

  function isElementVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    if ('offsetParent' in el) return el.offsetParent !== null;
    return true;
  }

  function getSheetFocusables() {
    if (!els.toolbar || typeof els.toolbar.querySelectorAll !== 'function') return [];
    const focusables = Array.from(els.toolbar.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isElementVisible);
    if (
      els.mobileFab &&
      els.mobileFab.classList &&
      els.mobileFab.classList.contains('active') &&
      !els.mobileFab.disabled &&
      isElementVisible(els.mobileFab) &&
      !focusables.includes(els.mobileFab)
    ) {
      focusables.push(els.mobileFab);
    }
    return focusables;
  }

  function isMobileSheetLayout() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function stripMobileSheetOverlayState() {
    const doc = getDoc();
    if (els.toolbar) {
      els.toolbar.classList.remove('expanded');
      if (typeof els.toolbar.removeAttribute === 'function') {
        els.toolbar.removeAttribute('aria-modal');
        els.toolbar.removeAttribute('role');
        els.toolbar.removeAttribute('aria-label');
      }
    }
    if (sheetFocusTrapListener && sheetFocusTrapTarget && typeof sheetFocusTrapTarget.removeEventListener === 'function') {
      sheetFocusTrapTarget.removeEventListener('keydown', sheetFocusTrapListener);
      sheetFocusTrapListener = null;
      sheetFocusTrapTarget = null;
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    if (doc && doc.body) {
      doc.body.classList.remove('mobile-sheet-active');
    }
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active');
      if (typeof els.mobileFab.setAttribute === 'function') {
        els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
        els.mobileFab.setAttribute('aria-expanded', 'false');
      }
    }
  }

  function toggleMobileSheet() {
    if (!els.toolbar) return;
    if (els.toolbar.classList.contains('expanded')) collapseMobileSheet();
    else expandMobileSheet();
  }

  function expandMobileSheet() {
    const doc = getDoc();
    runtime.reader.lastActiveElement = doc ? doc.activeElement : null;
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
    }
    if (els.toolbar) {
      els.toolbar.classList.remove('hidden-bar');
      els.toolbar.classList.add('expanded');
      if (typeof els.toolbar.setAttribute === 'function') {
        els.toolbar.setAttribute('role', 'dialog');
        els.toolbar.setAttribute('aria-modal', 'true');
        els.toolbar.setAttribute('aria-label', 'Reading Settings');
      }
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
    ui.setContainerFocusable(els.toolbar, true);
    if (isMobileSheetLayout() && doc && doc.body) {
      doc.body.classList.add('mobile-sheet-active');
      if (els.toolbar) els.toolbar.scrollTop = 0;
    }
    if (els.mobileFab) {
      els.mobileFab.classList.add('active');
      if (typeof els.mobileFab.setAttribute === 'function') {
        els.mobileFab.setAttribute('aria-label', 'Close Reading Settings');
        els.mobileFab.setAttribute('aria-expanded', 'true');
      }
    }

    if (els.toolbar && typeof els.toolbar.querySelectorAll === 'function') {
      const focusableElements = getSheetFocusables();
      if (focusableElements.length > 0) {
        try { focusableElements[0].focus(); } catch (err) {}
      }

      if (!sheetFocusTrapListener) {
        sheetFocusTrapListener = event => {
          if (!els.toolbar || !els.toolbar.classList.contains('expanded')) return;
          if (event.key === 'Tab') {
            const focusables = getSheetFocusables();
            if (!focusables.length) return;
            const active = doc ? doc.activeElement : null;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const insideDialog = Boolean(active && focusables.includes(active));
            if (event.shiftKey) {
              if (active === first || !insideDialog) {
                event.preventDefault();
                last.focus();
              }
            } else if (active === last || !insideDialog) {
              event.preventDefault();
              first.focus();
            }
          }
        };
        const listenerTarget = (doc && typeof doc.addEventListener === 'function') ? doc : els.toolbar;
        if (listenerTarget && typeof listenerTarget.addEventListener === 'function') {
          listenerTarget.addEventListener('keydown', sheetFocusTrapListener);
          sheetFocusTrapTarget = listenerTarget;
        }
      }
    }
  }

  function collapseMobileSheet() {
    const doc = getDoc();
    stripMobileSheetOverlayState();
    ui.setContainerFocusable(els.toolbar, false);
    if (els.toolbar) els.toolbar.scrollTop = 0;
    if (els.mobileFab) {
      const targetFocus = (runtime.reader.lastActiveElement && doc && typeof doc.contains === 'function' && doc.contains(runtime.reader.lastActiveElement))
        ? runtime.reader.lastActiveElement
        : els.mobileFab;
      try { targetFocus.focus(); } catch (err) {}
    }
    runtime.reader.lastActiveElement = null;
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
  }

  function syncLayoutOnResize() {
    if (!els.readerView || !els.readerView.classList.contains('active')) return;
    if (!isMobileSheetLayout()) {
      if (els.toolbar && els.toolbar.classList.contains('expanded')) {
        stripMobileSheetOverlayState();
        runtime.reader.lastActiveElement = null;
        resetToolbarTimer();
      } else if (els.toolbar && !els.toolbar.classList.contains('hidden-bar')) {
        ui.setContainerFocusable(els.toolbar, true);
        resetToolbarTimer();
      }
      return;
    }

    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.toolbarTimer);
    }
    if (els.toolbar) {
      els.toolbar.classList.remove('hidden-bar');
      ui.setContainerFocusable(els.toolbar, els.toolbar.classList.contains('expanded'));
    }
  }

  return {
    collapseMobileSheet,
    expandMobileSheet,
    isMobileSheetLayout,
    resetToolbarTimer,
    syncLayoutOnResize,
    toggleMobileSheet
  };
}
