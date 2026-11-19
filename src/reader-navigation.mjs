export function createReaderNavigation(context, { ui, getSettings, resetToolbarTimer }) {
  const { els, runtime } = context;
  let sheetFocusTrapListener = null;

  function isMobileSheetLayout() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function toggleMobileSheet() {
    if (!els.toolbar) return;
    if (els.toolbar.classList.contains('expanded')) collapseMobileSheet();
    else expandMobileSheet();
  }

  function expandMobileSheet() {
    runtime.reader.lastActiveElement = typeof document !== 'undefined' ? document.activeElement : null;
    if (els.toolbar) {
      els.toolbar.classList.add('expanded');
      if (typeof els.toolbar.setAttribute === 'function') {
        els.toolbar.setAttribute('role', 'dialog');
        els.toolbar.setAttribute('aria-modal', 'true');
        els.toolbar.setAttribute('aria-label', 'Reading Settings');
      }
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.add('show');
    ui.setContainerFocusable(els.toolbar, true);
    if (isMobileSheetLayout() && typeof document !== 'undefined' && document.body) {
      document.body.classList.add('mobile-sheet-active');
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
      const focusableElements = Array.from(els.toolbar.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusableElements.length > 0) {
        try { focusableElements[0].focus(); } catch (err) {}
      }

      if (!sheetFocusTrapListener) {
        sheetFocusTrapListener = event => {
          if (!els.toolbar || !els.toolbar.classList.contains('expanded')) return;
          if (event.key === 'Tab') {
            const focusables = Array.from(els.toolbar.querySelectorAll(
              'button:not([disabled]):not([tabindex="-1"]), [href]:not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])'
            )).filter(el => el.offsetParent !== null);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey) {
              if (document.activeElement === first || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                last.focus();
              }
            } else {
              if (document.activeElement === last || !els.toolbar.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
              }
            }
          }
        };
        if (typeof els.toolbar.addEventListener === 'function') {
          els.toolbar.addEventListener('keydown', sheetFocusTrapListener);
        }
      }
    }
  }

  function collapseMobileSheet() {
    if (els.toolbar) {
      els.toolbar.classList.remove('expanded');
      if (typeof els.toolbar.removeAttribute === 'function') {
        els.toolbar.removeAttribute('aria-modal');
        els.toolbar.removeAttribute('role');
        els.toolbar.removeAttribute('aria-label');
      }
      if (sheetFocusTrapListener && typeof els.toolbar.removeEventListener === 'function') {
        els.toolbar.removeEventListener('keydown', sheetFocusTrapListener);
        sheetFocusTrapListener = null;
      }
    }
    if (els.sheetBackdrop) els.sheetBackdrop.classList.remove('show');
    ui.setContainerFocusable(els.toolbar, false);
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('mobile-sheet-active');
    }
    if (els.toolbar) els.toolbar.scrollTop = 0;
    if (els.mobileFab) {
      els.mobileFab.classList.remove('active');
      if (typeof els.mobileFab.setAttribute === 'function') {
        els.mobileFab.setAttribute('aria-label', 'Open Reading Settings');
        els.mobileFab.setAttribute('aria-expanded', 'false');
      }
      const targetFocus = (runtime.reader.lastActiveElement && typeof document !== 'undefined' && document.contains(runtime.reader.lastActiveElement))
        ? runtime.reader.lastActiveElement
        : els.mobileFab;
      try { targetFocus.focus(); } catch (err) {}
    }
    runtime.reader.lastActiveElement = null;
    const settings = getSettings();
    if (settings) settings.resetSettingsSections();
  }

  return {
    collapseMobileSheet,
    expandMobileSheet,
    isMobileSheetLayout,
    resetToolbarTimer,
    toggleMobileSheet
  };
}
