import { getDoc } from './utils.mjs';

export function createUI(context) {
  const { els, state } = context;
  let announceTimer = null;

  function updateStatusTarget(target, message, type) {
    if (!target) return;
    const baseClass = target === els.readerStatusMessage ? 'status-message reader-status-message' : 'status-message';
    target.textContent = message || '';
    target.className = message ? `${baseClass} show ${type}` : baseClass;
  }

  function clearStatus() {
    updateStatusTarget(els.statusMessage, '', 'info');
    updateStatusTarget(els.readerStatusMessage, '', 'info');
  }

  function showStatus(message, type = 'info') {
    if (!els.statusMessage && !els.readerStatusMessage) return;
    if (!message) {
      clearStatus();
      return;
    }
    const isReaderActive = Boolean(els.readerView && els.readerView.classList && els.readerView.classList.contains('active'));
    const activeTarget = isReaderActive
      ? (els.readerStatusMessage || els.statusMessage)
      : (els.statusMessage || els.readerStatusMessage);
    const inactiveTarget = activeTarget === els.readerStatusMessage ? els.statusMessage : els.readerStatusMessage;
    updateStatusTarget(inactiveTarget, '', 'info');
    updateStatusTarget(activeTarget, message, type);
    if (typeof window !== 'undefined' && window.clearTimeout) {
      window.clearTimeout(state.statusTimer);
      state.statusTimer = window.setTimeout(clearStatus, 4500);
    }
  }

  function showLoader(message = 'Loading text...') {
    if (els.loader && els.loaderText) {
      els.loaderText.textContent = message;
      els.loader.classList.add('active');
    }
  }

  function hideLoader() {
    if (els.loader) els.loader.classList.remove('active');
  }

  function announceLive(msg) {
    const doc = getDoc(context);
    if (!doc || !doc.body) return;
    let live = doc.getElementById('liveAnnouncer');
    if (!live) {
      live = doc.createElement('div');
      live.id = 'liveAnnouncer';
      live.className = 'sr-only';
      live.setAttribute('aria-live', 'polite');
      doc.body.appendChild(live);
    }
    if (announceTimer !== null) {
      clearTimeout(announceTimer);
      announceTimer = null;
    }
    live.textContent = '';
    announceTimer = setTimeout(() => {
      announceTimer = null;
      live.textContent = msg;
    }, 50);
  }

  function setContainerFocusable(container, enabled) {
    if (!container) return;
    if ('inert' in container) {
      container.inert = !enabled;
    }
    if (container === els.toolbar) {
      if (enabled && typeof container.removeAttribute === 'function') {
        container.removeAttribute('aria-hidden');
      } else if (!enabled && typeof container.setAttribute === 'function') {
        container.setAttribute('aria-hidden', 'true');
      }
    }
    if (typeof container.querySelectorAll !== 'function') return;
    container.querySelectorAll('a[href], button, input, select, textarea, [tabindex]').forEach(element => {
      if (enabled) {
        if (element.dataset.savedTabindex !== undefined) {
          const previous = element.dataset.savedTabindex;
          if (previous) element.setAttribute('tabindex', previous);
          else element.removeAttribute('tabindex');
          delete element.dataset.savedTabindex;
        }
        return;
      }

      if (element.dataset.savedTabindex === undefined) {
        element.dataset.savedTabindex = element.hasAttribute('tabindex') ? element.getAttribute('tabindex') : '';
      }
      element.setAttribute('tabindex', '-1');
    });
  }

  return {
    announceLive,
    clearStatus,
    hideLoader,
    setContainerFocusable,
    showLoader,
    showStatus
  };
}
