import { STATE_IDLE } from './constants.mjs';
import { isMobileDevice } from './utils.mjs';

export function createAppContext(els, doc = null) {
  return {
    doc,
    els,
    state: {
      currentText: '',
      currentPresetIndex: 0,
      currentMode: 'light',
      toolbarTimer: null,
      gestureHintTimer: null,
      statusTimer: null,
      dragStartX: 0,
      dragCurrentX: 0,
      dragStartIndex: 0,
      isDraggingCarousel: false,
      carouselWidth: 0,
      gestureStartX: 0,
      gestureStartY: 0,
      gestureStartTime: 0,
      isGesture: false,
      lastCarouselDragDistance: 0
    },
    runtime: {
      reader: {
        activeRenderId: 0,
        lastActiveElement: null
      },
      tts: {
        voices: [],
        voicesSignature: '',
        wordMeta: [],
        wordSpans: [],
        fullSpokenText: '',
        chunks: [],
        chunkIndex: 0,
        currentUtterance: null,
        currentWordIndex: -1,
        state: STATE_IDLE,
        finishing: false,
        chunkHasBoundary: false,
        estimateTimer: null,
        keepAliveTimer: null,
        pageHideTimer: null,
        speechGeneration: 0,
        visibilityInterrupted: false,
        speechCanceledWhileHidden: false,
        pausedAt: 0,
        isSpeaking: false,
        supported: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
        synth: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
          ? window.speechSynthesis
          : null,
        isMobile: isMobileDevice()
      }
    }
  };
}
