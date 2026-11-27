import {
  DEFAULT_LETTER_SPACING,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_MARGIN,
  THEME_COLORS,
  VALID_FONTS,
  VALID_SIZES,
  VALID_THEMES,
  darkPresets,
  fontMap,
  lightPresets
} from './constants.mjs';
import { clampIndex, clampNumber, getDoc, getElementTarget } from './utils.mjs';
import { createPresetCarousel } from './preset-carousel.mjs';

export function createSettings(context, { onResetToolbarTimer, isMobileSheetLayout, onSettingsSectionToggle } = {}) {
  const { els, state, runtime } = context;
  let initialized = false;

  function getPresets() {
    return state.currentMode === 'dark' ? darkPresets : lightPresets;
  }

  const carousel = createPresetCarousel(context, {
    getPresets,
    applyPreset: (...args) => applyPreset(...args),
    setMode: (...args) => setMode(...args)
  });
  const {
    attachGestureArea,
    buildPresetCarousel,
    canStartCarouselDrag,
    canUseGlobalPresetShortcut,
    endCarouselDrag,
    hasSelectedText,
    moveCarouselDrag,
    nextPreset,
    prevPreset,
    setTrackPosition,
    startCarouselDrag,
    updateDots,
    updatePresetA11y,
    updateThemeSettingsSummary
  } = carousel;

  function setFont(font) {
    const nextFont = VALID_FONTS.has(font) ? font : 'sans';
    const family = fontMap[nextFont];
    if (!family) return;
    const doc = getDoc(context);
    if (doc && doc.documentElement?.style) {
      doc.documentElement.style.setProperty('--body-font', family);
    }
  }

  function setTheme(theme) {
    const nextTheme = VALID_THEMES.has(theme) ? theme : 'claude';
    const doc = getDoc(context);
    if (doc && doc.body?.classList) {
      Array.from(doc.body.classList)
        .filter(className => className.startsWith('theme-'))
        .forEach(className => doc.body.classList.remove(className));
      doc.body.classList.add(`theme-${nextTheme}`);
    }
    if (doc && typeof doc.querySelector === 'function' && THEME_COLORS[nextTheme]) {
      const themeColorMeta = doc.querySelector('meta[name="theme-color"]');
      if (themeColorMeta && typeof themeColorMeta.setAttribute === 'function') {
        themeColorMeta.setAttribute('content', THEME_COLORS[nextTheme]);
      }
    }
  }

  function applyPreset(index, options = {}) {
    const list = getPresets();
    const safeIndex = clampIndex(index, list.length);
    const preset = list[safeIndex];
    if (!preset) return;
    state.currentPresetIndex = safeIndex;
    setFont(preset.font);
    setTheme(preset.theme);
    setTrackPosition(safeIndex, options.animate !== false);
    updateDots();
    updatePresetA11y();
    if (options.resetTimer !== false && typeof onResetToolbarTimer === 'function') onResetToolbarTimer();
  }

  function setMode(mode, options = {}) {
    state.currentMode = mode === 'dark' ? 'dark' : 'light';
    if (els.modeLight) {
      els.modeLight.classList.toggle('active', state.currentMode === 'light');
      els.modeLight.setAttribute('aria-pressed', state.currentMode === 'light' ? 'true' : 'false');
    }
    if (els.modeDark) {
      els.modeDark.classList.toggle('active', state.currentMode === 'dark');
      els.modeDark.setAttribute('aria-pressed', state.currentMode === 'dark' ? 'true' : 'false');
    }
    const selectedIndex = options.presetIndex === undefined ? 0 : options.presetIndex;
    buildPresetCarousel(selectedIndex);
    applyPreset(state.currentPresetIndex, { animate: false, resetTimer: options.resetTimer });
  }

  function setSize(size) {
    if (!els.readerContent) return;
    const nextSize = VALID_SIZES.has(size) ? size : 'medium';
    els.readerContent.classList.remove('fs-small', 'fs-medium', 'fs-large', 'fs-xl');
    els.readerContent.classList.add(`fs-${nextSize}`);
    const doc = getDoc(context);
    if (doc && typeof doc.querySelectorAll === 'function') {
      doc.querySelectorAll('[data-size]').forEach(button => {
        const active = button.getAttribute('data-size') === nextSize;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

  function setSettingsSectionExpanded(section, expanded) {
    if (!section) return;
    const isExpanded = Boolean(expanded);
    const doc = getDoc(context);
    const toggle = typeof section.querySelector === 'function' ? section.querySelector('.settings-section-toggle') : null;
    const panelId = toggle ? toggle.getAttribute('aria-controls') : '';
    const panel = panelId && doc && typeof doc.getElementById === 'function'
      ? doc.getElementById(panelId)
      : (typeof section.querySelector === 'function' ? section.querySelector('.settings-section-panel') : null);
    section.classList.toggle('is-open', isExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    if (panel) {
      panel.hidden = !isExpanded;
      panel.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
    }
    if (
      typeof section.getAttribute === 'function' &&
      section.getAttribute('data-settings-section') === 'listen' &&
      els.readerContent?.classList &&
      typeof els.readerContent.classList.toggle === 'function'
    ) {
      const interactive = isExpanded || Boolean(runtime?.tts?.isSpeaking);
      els.readerContent.classList.toggle('tts-interactive', interactive);
    }
  }

  function resetSettingsSections() {
    if (Array.isArray(els.settingsSections)) {
      els.settingsSections.forEach(section => {
        setSettingsSectionExpanded(section, section.getAttribute('data-settings-section') === 'theme');
      });
    }
    updateThemeSettingsSummary();
  }

  function toggleSettingsSection(section) {
    if (!section) return;
    const expanded = !section.classList.contains('is-open');
    if (expanded && Array.isArray(els.settingsSections)) {
      els.settingsSections.forEach(other => {
        if (other && other !== section) setSettingsSectionExpanded(other, false);
      });
    }
    setSettingsSectionExpanded(section, expanded);
    if (typeof onResetToolbarTimer === 'function') onResetToolbarTimer();
    if (typeof onSettingsSectionToggle === 'function') onSettingsSectionToggle();
    if (expanded && typeof isMobileSheetLayout === 'function' && isMobileSheetLayout() && els.toolbar && typeof window !== 'undefined' && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => section.scrollIntoView({ block: 'nearest' }));
    }
  }

  function setLineHeight(value) {
    const next = clampNumber(value, DEFAULT_LINE_HEIGHT, 1.4, 2.6);
    if (els.lineHeightInput) els.lineHeightInput.value = next;
    if (els.lineHeightVal) els.lineHeightVal.textContent = next.toFixed(2);
    if (els.readerContent && els.readerContent.style) els.readerContent.style.lineHeight = next;
  }

  function setLetterSpacing(value) {
    const next = clampNumber(value, DEFAULT_LETTER_SPACING, -0.03, 0.15);
    if (els.letterSpacingInput) els.letterSpacingInput.value = next;
    if (els.letterSpacingVal) els.letterSpacingVal.textContent = `${next}em`;
    if (els.readerContent && els.readerContent.style) els.readerContent.style.letterSpacing = `${next}em`;
  }

  function updateMarginStyle(value) {
    if (!els.readerContent) return;
    let padding = clampNumber(value, DEFAULT_MARGIN, 12, 80);
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
      const mobileMax = Number.isFinite(window.innerWidth) && window.innerWidth > 0
        ? Math.max(24, Math.floor(window.innerWidth * 0.14))
        : 48;
      padding = Math.min(padding, mobileMax);
    }
    if (els.marginVal) els.marginVal.textContent = `${Math.round(padding)}px`;
    if (els.readerContent.style) {
      els.readerContent.style.paddingLeft = `${padding}px`;
      els.readerContent.style.paddingRight = `${padding}px`;
    }
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    const doc = getDoc(context);
    if (els.modeLight) els.modeLight.addEventListener('click', () => setMode('light'));
    if (els.modeDark) els.modeDark.addEventListener('click', () => setMode('dark'));
    if (doc && typeof doc.querySelectorAll === 'function') {
      doc.querySelectorAll('[data-size]').forEach(button => {
        button.addEventListener('click', () => setSize(button.getAttribute('data-size')));
      });
    }
    if (els.arrowLeft) els.arrowLeft.addEventListener('click', prevPreset);
    if (els.arrowRight) els.arrowRight.addEventListener('click', nextPreset);
    if (els.settingsSectionToggles) {
      els.settingsSectionToggles.forEach(toggle => {
        toggle.addEventListener('click', () => toggleSettingsSection(toggle.closest('[data-settings-section]')));
      });
    }
    if (els.presetWindow) {
      els.presetWindow.addEventListener('touchstart', event => {
        if (event.touches && event.touches.length === 1 && canStartCarouselDrag(event.target)) startCarouselDrag(event.touches[0].clientX);
      }, { passive: true });
      els.presetWindow.addEventListener('touchmove', event => {
        if (state.isDraggingCarousel && event.touches && event.touches.length === 1) moveCarouselDrag(event.touches[0].clientX);
      }, { passive: true });
      els.presetWindow.addEventListener('touchend', endCarouselDrag, { passive: true });
      els.presetWindow.addEventListener('touchcancel', endCarouselDrag, { passive: true });
      els.presetWindow.addEventListener('mousedown', event => {
        if ((event.button === undefined || event.button === 0) && canStartCarouselDrag(event.target)) {
          startCarouselDrag(event.clientX);
        }
      });
      els.presetWindow.addEventListener('click', event => {
        if (hasSelectedText() || state.isDraggingCarousel) return;
        if (state.lastCarouselDragDistance > 5) {
          state.lastCarouselDragDistance = 0;
          return;
        }
        const target = getElementTarget(event.target);
        if (target && target.closest('a, button, input, select, textarea')) return;
        const card = target ? target.closest('.preset-card') : null;
        if (card) applyPreset(card.getAttribute('data-index'));
      });
      els.presetWindow.addEventListener('keydown', event => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nextPreset();
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          prevPreset();
        } else if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          applyPreset(state.currentPresetIndex);
        }
      });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('mousemove', event => {
        if (state.isDraggingCarousel) moveCarouselDrag(event.clientX);
      });
      window.addEventListener('mouseup', endCarouselDrag);
      window.addEventListener('blur', endCarouselDrag);
    }
    if (els.readerView) attachGestureArea(els.readerView);
    else if (els.readerContent) attachGestureArea(els.readerContent);
    if (els.lineHeightInput) els.lineHeightInput.addEventListener('input', () => setLineHeight(els.lineHeightInput.value));
    if (els.letterSpacingInput) els.letterSpacingInput.addEventListener('input', () => setLetterSpacing(els.letterSpacingInput.value));
    if (els.marginInput) els.marginInput.addEventListener('input', () => updateMarginStyle(els.marginInput.value));
  }

  return {
    applyPreset,
    attachGestureArea,
    bindEvents,
    buildPresetCarousel,
    canUseGlobalPresetShortcut,
    getPresets,
    nextPreset,
    prevPreset,
    resetSettingsSections,
    setLetterSpacing,
    setLineHeight,
    setMode,
    setSize,
    toggleSettingsSection,
    updateMarginStyle,
    updateThemeSettingsSummary
  };
}
