import {
  VALID_FONTS,
  VALID_SIZES,
  VALID_THEMES,
  darkPresets,
  fontMap,
  lightPresets,
  textColorMap
} from './constants.mjs';
import { clampIndex, clampNumber, getElementTarget } from './utils.mjs';
import { createPresetCarousel } from './preset-carousel.mjs';

export function createSettings(context, { ui: _ui, onResetToolbarTimer, isMobileSheetLayout }) {
  const { els, state, runtime } = context;
  const loadedFonts = runtime.fonts.loaded;
  let initialized = false;

  function getPresets() {
    return state.currentMode === 'dark' ? darkPresets : lightPresets;
  }

  function ensureFontLoaded(fontKey) {
    if (loadedFonts.has(fontKey)) return;
    if (!fontMap[fontKey]) return;
    loadedFonts.add(fontKey);
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
    const config = fontMap[nextFont];
    if (!config) return;
    ensureFontLoaded(nextFont);
    if (typeof document !== 'undefined' && document.documentElement?.style) {
      document.documentElement.style.setProperty('--body-font', config.family);
      document.documentElement.style.setProperty('--heading-weight', config.weight);
    }
  }

  function setTheme(theme) {
    const nextTheme = VALID_THEMES.has(theme) ? theme : 'claude';
    if (typeof document !== 'undefined' && document.body?.classList) {
      Array.from(document.body.classList)
        .filter(className => className.startsWith('theme-'))
        .forEach(className => document.body.classList.remove(className));
      document.body.classList.add(`theme-${nextTheme}`);
    }
  }

  function applyTextColor(color) {
    if (!els.readerContent) return;
    const modeColors = textColorMap[state.currentMode] || textColorMap.light;
    const value = modeColors[color] || '';
    if (value) els.readerContent.style.setProperty('--reader-text-color', value);
    else els.readerContent.style.removeProperty('--reader-text-color');
  }

  function setTextColor(color) {
    state.currentTextColor = color || 'default';
    applyTextColor(state.currentTextColor);
  }

  function applyPreset(index, options = {}) {
    const list = getPresets();
    const safeIndex = clampIndex(index, list.length);
    const preset = list[safeIndex];
    if (!preset) return;
    state.currentPresetIndex = safeIndex;
    setFont(preset.font);
    setTheme(preset.theme);
    setTextColor(preset.color);
    setTrackPosition(safeIndex, options.animate !== false);
    updateDots();
    updatePresetA11y();
    if (options.resetTimer !== false) onResetToolbarTimer();
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
    document.querySelectorAll('[data-size]').forEach(button => {
      const active = button.getAttribute('data-size') === nextSize;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function setSettingsSectionExpanded(section, expanded) {
    if (!section) return;
    const isExpanded = Boolean(expanded);
    const toggle = section.querySelector('.settings-section-toggle');
    const panelId = toggle ? toggle.getAttribute('aria-controls') : '';
    const panel = panelId ? document.getElementById(panelId) : section.querySelector('.settings-section-panel');
    section.classList.toggle('is-open', isExpanded);
    if (toggle) toggle.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    if (panel) {
      panel.hidden = !isExpanded;
      panel.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
    }
  }

  function resetSettingsSections() {
    if (els.settingsDrawer) els.settingsDrawer.classList.add('active');
    els.settingsSections.forEach(section => {
      setSettingsSectionExpanded(section, section.getAttribute('data-settings-section') === 'theme');
    });
    updateThemeSettingsSummary();
  }

  function toggleSettingsSection(section) {
    if (!section) return;
    const expanded = !section.classList.contains('is-open');
    setSettingsSectionExpanded(section, expanded);
    onResetToolbarTimer();
    if (expanded && isMobileSheetLayout() && els.toolbar) {
      window.requestAnimationFrame(() => section.scrollIntoView({ block: 'nearest' }));
    }
  }

  function setLineHeight(value) {
    if (!els.lineHeightInput) return;
    const next = clampNumber(value, 1.85, 1.4, 2.6);
    els.lineHeightInput.value = next;
    if (els.readerContent) els.readerContent.style.lineHeight = next;
  }

  function setLetterSpacing(value) {
    if (!els.letterSpacingInput) return;
    const next = clampNumber(value, -0.015, -0.03, 0.15);
    els.letterSpacingInput.value = next;
    if (els.readerContent) els.readerContent.style.letterSpacing = `${next}em`;
  }

  function updateMarginStyle(value) {
    if (!els.readerContent) return;
    let padding = clampNumber(value, 24, 12, 80);
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
      const mobileMax = Number.isFinite(window.innerWidth) && window.innerWidth > 0
        ? Math.max(24, Math.floor(window.innerWidth * 0.14))
        : 48;
      padding = Math.min(padding, mobileMax);
    }
    els.readerContent.style.paddingLeft = `${padding}px`;
    els.readerContent.style.paddingRight = `${padding}px`;
  }

  function bindEvents() {
    if (initialized) return;
    initialized = true;
    if (els.modeLight) els.modeLight.addEventListener('click', () => setMode('light'));
    if (els.modeDark) els.modeDark.addEventListener('click', () => setMode('dark'));
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      document.querySelectorAll('[data-size]').forEach(button => {
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
        if (event.touches.length === 1 && canStartCarouselDrag(event.target)) startCarouselDrag(event.touches[0].clientX);
      }, { passive: true });
      els.presetWindow.addEventListener('touchmove', event => {
        if (state.isDraggingCarousel) state.dragCurrentX = event.touches[0].clientX;
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
        if (state.isDraggingCarousel) state.dragCurrentX = event.clientX;
      });
      window.addEventListener('mouseup', endCarouselDrag);
    }
    if (els.readerView) attachGestureArea(els.readerView);
    else if (els.readerContent) attachGestureArea(els.readerContent);
    if (els.lineHeightInput) els.lineHeightInput.addEventListener('input', () => setLineHeight(els.lineHeightInput.value));
    if (els.letterSpacingInput) els.letterSpacingInput.addEventListener('input', () => setLetterSpacing(els.letterSpacingInput.value));
    if (els.marginInput) els.marginInput.addEventListener('input', () => updateMarginStyle(els.marginInput.value));
  }

  return {
    applyPreset,
    applyTextColor,
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
    updateMarginStyle,
    updateThemeSettingsSummary
  };
}
