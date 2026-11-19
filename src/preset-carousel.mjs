import { darkPresets, lightPresets } from './constants.mjs';
import { clampIndex, escapeHtml, getElementTarget, isMobileDevice } from './utils.mjs';

export function createPresetCarousel(context, { getPresets, applyPreset, setMode }) {
  const { els, state } = context;
  let carouselRafId = null;

  function setTrackPosition(index, animate) {
    if (!els.presetTrack) return;
    els.presetTrack.classList.toggle('snapping', Boolean(animate));
    els.presetTrack.classList.toggle('dragging', false);
    els.presetTrack.style.transform = `translate3d(-${index * 100}%, 0, 0)`;
  }

  function updateDots() {
    if (!els.presetDots) return;
    els.presetDots.querySelectorAll('.preset-dot').forEach((dot, index) => {
      dot.classList.toggle('active', index === state.currentPresetIndex);
    });
  }

  function updateThemeSettingsSummary() {
    if (!els.themeSettingsSummary) return;
    const preset = getPresets()[state.currentPresetIndex];
    const modeLabel = state.currentMode === 'dark' ? 'Dark' : 'Light';
    els.themeSettingsSummary.textContent = `${preset ? preset.name : 'Preset'}, ${modeLabel}`;
  }

  function updatePresetA11y() {
    if (!els.presetWindow || !els.presetTrack) return;
    const preset = getPresets()[state.currentPresetIndex];
    if (!preset) return;
    els.presetWindow.setAttribute(
      'aria-label',
      `Reading preset carousel. Current preset: ${preset.name}. Use left and right arrow keys to change presets.`
    );
    els.presetTrack.querySelectorAll('.preset-card').forEach((card, index) => {
      card.setAttribute('aria-hidden', index === state.currentPresetIndex ? 'false' : 'true');
    });
    updateThemeSettingsSummary();
  }

  function buildPresetCarousel(selectedIndex = state.currentPresetIndex) {
    const list = getPresets();
    state.currentPresetIndex = clampIndex(selectedIndex, list.length);
    if (els.presetTrack) {
      els.presetTrack.innerHTML = list.map((preset, index) =>
        `<div class="preset-card" data-index="${index}" aria-hidden="${index === state.currentPresetIndex ? 'false' : 'true'}">
          <div class="preset-name">${escapeHtml(preset.name)}</div>
          <div class="preset-desc">${escapeHtml(preset.desc)}</div>
        </div>`
      ).join('');
    }
    if (els.presetDots) {
      els.presetDots.innerHTML = list.map((preset, index) =>
        `<div class="preset-dot ${index === state.currentPresetIndex ? 'active' : ''}"></div>`
      ).join('');
    }
    setTrackPosition(state.currentPresetIndex, false);
    updatePresetA11y();
  }

  function nextPreset() {
    const list = getPresets();
    if (state.currentPresetIndex >= list.length - 1 && typeof setMode === 'function') {
      const nextMode = state.currentMode === 'dark' ? 'light' : 'dark';
      setMode(nextMode, { presetIndex: 0 });
      const newList = getPresets();
      showGestureHint(newList[0].name);
      return;
    }
    state.currentPresetIndex = (state.currentPresetIndex + 1) % list.length;
    applyPreset(state.currentPresetIndex);
    showGestureHint(list[state.currentPresetIndex].name);
  }

  function prevPreset() {
    const list = getPresets();
    if (state.currentPresetIndex <= 0 && typeof setMode === 'function') {
      const nextMode = state.currentMode === 'dark' ? 'light' : 'dark';
      const targetList = nextMode === 'dark' ? darkPresets : lightPresets;
      const lastIndex = targetList.length - 1;
      setMode(nextMode, { presetIndex: lastIndex });
      showGestureHint(targetList[lastIndex].name);
      return;
    }
    state.currentPresetIndex = (state.currentPresetIndex - 1 + list.length) % list.length;
    applyPreset(state.currentPresetIndex);
    showGestureHint(list[state.currentPresetIndex].name);
  }

  function showGestureHint(text) {
    if (!els.gestureHintText || !els.gestureHint) return;
    els.gestureHintText.textContent = text;
    els.gestureHint.classList.add('show');
    const safeClearTimeout = (typeof window !== 'undefined' && typeof window.clearTimeout === 'function') ? window.clearTimeout : (typeof clearTimeout === 'function' ? clearTimeout : null);
    const safeSetTimeout = (typeof window !== 'undefined' && typeof window.setTimeout === 'function') ? window.setTimeout : (typeof setTimeout === 'function' ? setTimeout : null);
    if (safeClearTimeout) safeClearTimeout(state.gestureHintTimer);
    if (safeSetTimeout) {
      state.gestureHintTimer = safeSetTimeout(() => {
        if (els.gestureHint) els.gestureHint.classList.remove('show');
      }, 700);
    }
  }

  function getCarouselWidth() {
    return els.presetWindow ? (els.presetWindow.getBoundingClientRect().width || 1) : 1;
  }

  function updateCarouselDrag() {
    carouselRafId = null;
    if (!state.isDraggingCarousel || !els.presetTrack) return;
    let distance = state.dragCurrentX - state.dragStartX;
    const list = getPresets();
    if ((state.dragStartIndex === 0 && distance > 0) || (state.dragStartIndex === list.length - 1 && distance < 0)) distance *= 0.35;
    const percentage = (distance / state.carouselWidth) * 100;
    els.presetTrack.style.transform = `translate3d(${(-state.dragStartIndex * 100) + percentage}%, 0, 0)`;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      carouselRafId = window.requestAnimationFrame(updateCarouselDrag);
    }
  }

  function startCarouselDrag(x) {
    if (!els.presetTrack) return;
    state.carouselWidth = getCarouselWidth();
    state.dragStartX = x;
    state.dragCurrentX = x;
    state.dragStartIndex = state.currentPresetIndex;
    state.isDraggingCarousel = true;
    state.lastCarouselDragDistance = 0;
    els.presetTrack.classList.remove('snapping');
    els.presetTrack.classList.add('dragging');
    if (carouselRafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(carouselRafId);
      carouselRafId = null;
    }
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      carouselRafId = window.requestAnimationFrame(updateCarouselDrag);
    }
  }

  function endCarouselDrag() {
    if (carouselRafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(carouselRafId);
      carouselRafId = null;
    }
    if (!state.isDraggingCarousel) return;
    state.isDraggingCarousel = false;
    const distance = state.dragCurrentX - state.dragStartX;
    state.lastCarouselDragDistance = Math.abs(distance);
    const threshold = state.carouselWidth * 0.18;
    const list = getPresets();
    if (distance < -threshold && state.currentPresetIndex < list.length - 1) state.currentPresetIndex += 1;
    else if (distance > threshold && state.currentPresetIndex > 0) state.currentPresetIndex -= 1;
    applyPreset(state.currentPresetIndex);
  }

  function hasSelectedText() {
    const selection = (typeof window !== 'undefined' && window.getSelection) ? window.getSelection() : null;
    return Boolean(selection && selection.toString().trim().length > 0);
  }

  function isBlockedGestureTarget(target) {
    const element = getElementTarget(target);
    if (!element) return false;
    return Boolean(element.closest([
      'a', 'button', 'input', 'select', 'textarea', 'label', 'pre', 'code', 'table', '[contenteditable]',
      '[role="button"]', '[role="link"]', '[role="slider"]', '[role="textbox"]', '[role="combobox"]',
      '[role="checkbox"]', '[role="radio"]', '#toolbar', '.audio-player-bar', '#backBtn'
    ].join(',')));
  }

  function canStartPresetGesture(target) {
    return !hasSelectedText() && !isBlockedGestureTarget(target);
  }

  function canStartCarouselDrag(target) {
    if (hasSelectedText()) return false;
    const element = getElementTarget(target);
    if (!element) return false;
    return !element.closest('a, button, input, select, textarea');
  }

  function attachGestureArea(element) {
    if (!element) return;
    element.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) return;
      if (!canStartPresetGesture(event.target)) {
        state.isGesture = false;
        return;
      }
      const touch = event.touches[0];
      state.gestureStartX = touch.clientX !== undefined ? touch.clientX : touch.screenX;
      state.gestureStartY = touch.clientY !== undefined ? touch.clientY : touch.screenY;
      state.gestureStartTime = Date.now();
      state.isGesture = true;
    }, { passive: true });
    element.addEventListener('touchmove', event => {
      if (!state.isGesture) return;
      if (event.touches && event.touches.length !== 1) {
        state.isGesture = false;
        return;
      }
      const touch = event.touches[0];
      const curX = touch.clientX !== undefined ? touch.clientX : touch.screenX;
      const curY = touch.clientY !== undefined ? touch.clientY : touch.screenY;
      const distanceX = Math.abs(curX - state.gestureStartX);
      const distanceY = Math.abs(curY - state.gestureStartY);
      if (distanceY > distanceX && distanceY > 20) state.isGesture = false;
    }, { passive: true });
    element.addEventListener('touchcancel', () => {
      state.isGesture = false;
    }, { passive: true });
    element.addEventListener('touchend', event => {
      if (!state.isGesture) return;
      state.isGesture = false;
      if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;
      const elapsed = Date.now() - state.gestureStartTime;
      const touch = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : null;
      if (!touch) return;
      const endX = touch.clientX !== undefined ? touch.clientX : touch.screenX;
      const endY = touch.clientY !== undefined ? touch.clientY : touch.screenY;
      const distanceX = endX - state.gestureStartX;
      const distanceY = endY - state.gestureStartY;
      if (elapsed > 500 || Math.abs(distanceX) < 55 || Math.abs(distanceY) > Math.abs(distanceX) * 0.7) return;
      if (distanceX < 0) nextPreset();
      else prevPreset();
    }, { passive: true });
    if (isMobileDevice()) {
      element.addEventListener('mousedown', event => {
        if (event.button !== undefined && event.button !== 0) return;
        if (!canStartPresetGesture(event.target)) {
          state.isGesture = false;
          return;
        }
        state.gestureStartX = event.clientX;
        state.gestureStartY = event.clientY;
        state.gestureStartTime = Date.now();
        state.isGesture = true;
      });
      element.addEventListener('mouseup', event => {
        if (!state.isGesture) return;
        state.isGesture = false;
        if (hasSelectedText() || isBlockedGestureTarget(event.target)) return;
        const elapsed = Date.now() - state.gestureStartTime;
        const distanceX = event.clientX - state.gestureStartX;
        const distanceY = event.clientY - state.gestureStartY;
        if (elapsed > 500 || Math.abs(distanceX) < 55 || Math.abs(distanceY) > Math.abs(distanceX) * 0.7) return;
        if (distanceX < 0) nextPreset();
        else prevPreset();
      });
      element.addEventListener('mouseleave', () => { state.isGesture = false; });
    }
  }

  function isInteractiveShortcutTarget(target) {
    const element = getElementTarget(target);
    if (!element) return false;
    return Boolean(element.closest('input, select, textarea, button, a, [contenteditable="true"], [role="button"], [role="slider"], [role="textbox"], [role="combobox"]'));
  }

  function canUseGlobalPresetShortcut(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (event.target === els.presetWindow) return false;
    return !isInteractiveShortcutTarget(event.target);
  }

  return {
    attachGestureArea,
    buildPresetCarousel,
    canStartCarouselDrag,
    canStartPresetGesture,
    canUseGlobalPresetShortcut,
    endCarouselDrag,
    getCarouselWidth,
    hasSelectedText,
    isBlockedGestureTarget,
    nextPreset,
    prevPreset,
    setTrackPosition,
    showGestureHint,
    startCarouselDrag,
    updateCarouselDrag,
    updateDots,
    updatePresetA11y,
    updateThemeSettingsSummary
  };
}
