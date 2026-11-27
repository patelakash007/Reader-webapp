# Architecture Guide

Reader Webapp is a zero-build, zero-backend static web application composed of browser-native ES modules (`src/*.mjs`), a single stylesheet (`style.css`), a strict-CSP HTML shell (`index.html`), a vendored Markdown parser (`vendor/marked.esm.mjs`), and an offline app-shell service worker (`sw.js`).

## High-Level Module Graph

```mermaid
flowchart TD
    HTML[index.html] --> Shim[script.js]
    Shim --> App[src/app.mjs]
    App --> DOM[src/dom.mjs]
    App --> Context[src/context.mjs]
    App --> UI[src/ui.mjs]
    App --> Settings[src/settings.mjs]
    App --> Reader[src/reader.mjs]
    App --> TTSCtrl[src/tts-controller.mjs]
    App -.-> SW[sw.js]

    Reader --> MD[src/markdown-parser.mjs]
    MD --> Marked[vendor/marked.esm.mjs]
    Settings --> Carousel[src/preset-carousel.mjs]
    Reader --> Renderer[src/reader-renderer.mjs]
    Reader --> Nav[src/reader-navigation.mjs]
    Renderer --> MD
    TTSCtrl --> TTSCore[src/tts-core.mjs]
```

*Cross-cutting leaf modules `src/constants.mjs` and `src/utils.mjs` are imported across the graph and omitted from the diagram for clarity.*

## Bootstrap & Shared Context

1. **`index.html`** loads `style.css` and defers `script.js`.
2. **`script.js`** acts as a lightweight compatibility entry point that dynamically imports `./src/app.mjs` and invokes `init()`, displaying an error banner in `#statusMessage` if initialization fails.
3. **`src/app.mjs`** guards initialization per document via a `WeakSet` (`initializedDocuments`) so a document is never initialized twice while unit tests can safely initialize distinct mock documents. It:
   - Collects DOM references via `collectElements()` (`src/dom.mjs`).
   - Builds the shared state/runtime container via `createAppContext()` (`src/context.mjs`).
   - Instantiates `ui`, `tts`, `settings` (wired with `onSettingsSectionToggle` → `reader.syncMobileSheetHeight()`), and `reader` with explicit dependency injection (avoiding global singletons).
   - Registers `./sw.js` with `{ updateViaCache: 'none' }` (immediately if `document.readyState === 'complete'`, otherwise on `window` `load`).
   - Binds events, disables initial focusability on `#toolbar` and `#audioPlayerBar`, applies clean default values (`light` mode, preset `0` `Claude`, size `medium`, line height `1.85`, letter spacing `-0.015em`, margins `24px`, voice rate `1.0x`) along with their live UI readouts, and initializes Web Speech voices (`tts.initializeVoices()`).

### State Structure (`src/context.mjs`)

`createAppContext(els, doc)` separates state into two buckets:
- **`context.state`**: UI/interaction state (current text, active preset/mode, timers, carousel drag and swipe gesture tracking).
- **`context.runtime`**: Operational state split into `runtime.reader` (`activeRenderId`, `lastActiveElement`) and `runtime.tts` (voices, word spans/metadata, chunk queue, playback state machine, timers, monotonic `speechGeneration`, mobile/support flags).

## Module Reference (`src/`)

| Module | Responsibility |
| --- | --- |
| `app.mjs` | Composition root, default initialization, and service worker registration |
| `constants.mjs` | Character limit (`1,000,000`), valid fonts/sizes/themes, `THEME_COLORS`, 20 presets (`lightPresets`, `darkPresets`), and TTS timing/chunk/speed constants |
| `context.mjs` | Shared per-document `state` and `runtime` container |
| `dom.mjs` | Centralized DOM lookup (`collectElements`) |
| `markdown-parser.mjs` | Custom `Marked` instance, URL allowlisting, HTML escaping, heading ID slugification & deduplication, reserved ID protection, smart heading heuristics, and `enforceExtractedTextLimit()` |
| `preset-carousel.mjs` | Preset track animation, on-demand rAF drag physics, touch/mobile swipe gestures, gesture hint toast (`<Mode> · <desc>`), and keyboard shortcut eligibility |
| `reader-navigation.mjs` | Mobile bottom sheet dialog semantics (`role="dialog"`, `aria-modal="true"`), `--mobile-sheet-height` CSS variable sync, focus trap, scroll lock, and viewport resize synchronization |
| `reader-renderer.mjs` | Asynchronous, frame-budgeted Markdown token rendering with render-ID cancellation and threshold-gated loading overlay |
| `reader.mjs` | View switching (`enterReader`/`goBack`), scroll progress bar, desktop/tablet toolbar auto-hide/hover lock and tap-reveal guards, click-to-speak gating, and global keyboard handling |
| `settings.mjs` | Font, theme, `theme-color` meta sync, size, live typography readouts (`line-height`, `letter-spacing`, responsive margin cap), exclusive accordion toggling, and `.tts-interactive` class sync |
| `tts-core.mjs` | 190-character boundary chunking, voice deduplication/sorting/selection, and non-destructive DOM word tokenization |
| `tts-controller.mjs` | Web Speech API playback state machine, inline SVG play/pause icons, word highlighting, fallback estimation timer, desktop keep-alive, and page visibility/hide recovery |
| `ui.mjs` | Single-active-banner status routing (`#statusMessage` / `#readerStatusMessage`), loading overlay, debounced polite `aria-live` announcer (`#liveAnnouncer`), and `inert`/`tabindex` focusability management |
| `utils.mjs` | `escapeHtml`, `formatError`, numeric/index clamping, `getElementTarget`, `getScrollTop`, capability-based `isMobileDevice`, `getDoc`, `isListenSectionOpen`, and `cancelPendingRender` |

## Markdown Parsing & Security Pipeline

All pasted input flows through `enforceExtractedTextLimit()` (enforcing `MAX_EXTRACTED_TEXT_CHARS = 1_000_000`) and then `createMarkdownRenderer()` in `src/markdown-parser.mjs`:

- **Parser engine:** Uses vendored `marked` v15.0.12 (`vendor/marked.esm.mjs`) configured with `gfm: true`, `breaks: false`.
- **HTML neutralization:** The custom `html` renderer escapes raw HTML tokens with `escapeHtml()`, preventing script injection or arbitrary markup.
- **Link allowlist (`normalizeSafeLinkHref`):** Decodes HTML entities, trims whitespace, rejects ASCII control characters (`<= 0x1F`, `0x7F`), rejects protocol-relative URLs (`//...`), and only permits `http:`, `https:`, `ftp:`, `mailto:`, single-slash root-relative paths (`/...`), and fragment anchors (`#...`). Unsafe links render as plain anchor text; non-fragment links receive `target="_blank" rel="noopener noreferrer"`.
- **Image handling:** Markdown images render as `[Image: <escaped alt>]` so no external image requests occur.
- **Tables & task lists:** Tables are wrapped in `<div class="table-wrap">` for horizontal scrolling; GFM task list items render disabled checkboxes.
- **Heading IDs & Smart Headings:**
  - Single-line standalone all-caps paragraphs (4–55 chars) are promoted to `<h2>` unless excluded by false-positive guards (e.g., `NOTE`, `WARNING`, `CAUTION`, `PLEASE`, `DO NOT`, `NOTICE`, or short acronym joins like `CPU AND GPU`).
  - Headings receive Unicode-aware slugified IDs deduplicated per document (`-1`, `-2`, …) and checked against `RESERVED_DOM_IDS` so user content can never collide with app-shell element IDs.
- **CSP defense-in-depth:** `index.html` declares `default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'`.

## Incremental Rendering & Concurrency

`src/reader-renderer.mjs` prevents UI freezes on large documents:

- Each `renderTextAsync()` call increments `runtime.reader.activeRenderId`, invalidates any previous TTS tokenization, and defers tokenization via `setTimeout(..., 0)` so initial UI state settles cleanly.
- To avoid loader flicker on short pastes, the loading overlay is shown immediately only when input exceeds `LOADER_CHAR_THRESHOLD = 50_000` characters, or lazily if chunked rendering yields across multiple frames.
- Tokens are sliced and rendered incrementally via `insertAdjacentHTML('beforeend', html)` using a **12 ms** frame budget and a **30,000-character** per-frame cap, yielding via `requestAnimationFrame` (or `setTimeout(..., 0)` in non-browser environments).
- Every async step checks `renderId === runtime.reader.activeRenderId`. Calling `goBack()`, `clearText()`, or starting another render increments `activeRenderId`, immediately aborting in-flight work so stale DOM or callbacks cannot leak.

## Responsive Layout, Theming & Accessibility

- **20 Themes (`style.css` + `src/constants.mjs`):** `:root` defaults match the `Claude` preset (eliminating cold-load flash before JS executes). All 10 light and 10 dark presets define CSS custom properties (`--bg`, `--card`, `--text`, `--text2`, `--accent`, `--on-accent`, `--ui-positive`, `--ui-negative`, `--toolbar-bg`) with `color-mix()` tinting and a subtle SVG paper-grain overlay on `body::before` behind `#app` (`z-index: 0`). Contrast is verified in `tests/test_regressions.js` for WCAG AA (`>= 4.5:1`). Applying a preset also updates `<meta name="theme-color">`.
- **Responsive breakpoints (`style.css`):**
  - **Desktop (`> 960px`):** 3-column floating settings cards inside an auto-hiding fixed top shelf (exclusive accordion, 3.5 s idle timer paused on pointer hover or keyboard focus, revealed on top-edge mouse move `<= 80px`, guarded click/tap, or `Tab`). Tap-reveal ignores active text selections, `#` anchor links, `touchstart` scrolling, and active click-to-speak regions.
  - **Tablet (`641px–960px`):** 2-column dense settings grid with full-width active section and exclusive accordion.
  - **Mobile (`<= 640px`):** Floating action button (`#mobileFab`) toggles `#toolbar` as a modal bottom sheet (`role="dialog"`, `aria-modal="true"`) with scroll lock (`body.mobile-sheet-active`), backdrop/handle dismissal, dynamic `--mobile-sheet-height` syncing so the Close pill anchors cleanly above the sheet across accordion toggles and resizes, focus restoration (`runtime.reader.lastActiveElement`), and a keyboard `Tab`/`Shift+Tab` focus trap that includes the anchored Close pill.
- **Focusability, Status & Reduced Motion:** `ui.setContainerFocusable()` toggles both `inert` and saved `tabindex` values (and toggles `aria-hidden` on `#toolbar`), while `#audioPlayerBar` updates its own `aria-hidden` state via `app.mjs` and `tts-controller.mjs`. `ui.showStatus()` updates only the active view's status banner (`#readerStatusMessage` in reader mode, `#statusMessage` otherwise) and clears the inactive banner to prevent duplicate `aria-live` announcements. `@media (prefers-reduced-motion: reduce)` disables CSS transitions/animations, and TTS auto-scroll switches from `smooth` to `auto` when reduced motion is enabled or narration speed exceeds `1.5x`.

## Text-to-Speech (TTS) Engine

The TTS subsystem is split into pure helpers (`src/tts-core.mjs`) and the stateful controller (`src/tts-controller.mjs`):

- **Lazy DOM Tokenization (`tokenizeReaderDOM`):** Runs only when narration starts or click-to-speak is triggered (never on initial document render). It uses a `TreeWalker` to wrap words in `<span class="tts-word" data-word-idx="N">` while preserving nested inline markup, `<br>` boundaries, inter-word/trailing whitespace, and block separations (`\n\n`). Re-running tokenization unwraps existing `.tts-word` spans first so it is idempotent.
- **Click-to-Speak:** Gated by `isClickToSpeakEnabled()` (active only when TTS is playing/paused or the Speech settings section is expanded) and ignores active text selections, links, and buttons.
- **Chunking (`chunkText`):** Splits spoken text into chunks targeting `CHUNK_TARGET = 190` characters (avoiding browser utterance length/15-second drop limits), preferring sentence boundaries (`[.!?]`), then clause boundaries (`[,;:]`), then whitespace, and adjusting split points to avoid bisecting UTF-16 surrogate pairs.
- **Playback Concurrency:** Every start/restart/stop/mobile-pause increments `session.speechGeneration`; utterance callbacks (`onstart`, `onboundary`, `onend`, `onerror`) ignore stale generations.
- **Highlighting & Fallback:** Uses `utterance.onboundary` (`charIndex`) when supported, with an O(1) current/next-word fast path and binary search (`findWordIndexByChar`) for jumps. If a browser does not emit boundary events, a fallback timer (`BOUNDARY_FALLBACK_MS = 100`, `WORDS_PER_MIN = 180`) estimates progression.
- **Cross-Browser Resilience:**
  - Voice loading listens to `onvoiceschanged` and polls every `250ms` up to `5000ms`, deduplicating and sorting voices and matching the user's locale.
  - On desktop, a `10000ms` keep-alive calls `synth.pause(); synth.resume()` to work around Chromium speech stalls.
  - On touch-primary mobile devices (`isMobileDevice()`), pausing cancels the utterance and resuming restarts cleanly from `currentWordIndex`.
  - `visibilitychange` (when hidden) pauses active playback and flags `visibilityInterrupted` so resuming restarts cleanly from `currentWordIndex`. `pagehide` also pauses playback and starts a `15000ms` (`PAGEHIDE_CANCEL_TIMEOUT`) timer—cleared on `pageshow`, resume, or stop—that cancels pending speech and sets `speechCanceledWhileHidden`. On desktop, any pause lasting longer than `10000ms` likewise restarts cleanly from `currentWordIndex` on resume.

## Service Worker (`sw.js`)

- **Atomic precaching (`install`):** Precaches all 24 `APP_SHELL` URLs into `CACHE_NAME` (`reader-webapp-shell-v15`) with `{ cache: 'reload' }` and calls `self.skipWaiting()`.
- **Cache cleanup (`activate`):** Deletes stale caches matching `reader-webapp-*` and calls `self.clients.claim()`.
- **Fetch strategies:**
  - **Canonical navigations (`./`, `./index.html`):** Network-first (`cache: 'no-cache'`), mirroring successful responses under both `ROOT_URL` and `INDEX_URL`, falling back to the cached app shell when offline or when a non-OK response occurs.
  - **Canonical app-shell assets:** Stale-while-revalidate (serves cached asset immediately while refreshing in the background via `event.waitUntil()`).
  - **Everything else:** Passes through to the network untouched.

## Verification Layers

Automated checks in `.github/workflows/quality-checks.yml` span four layers:

1. **Static hygiene & lint:** Required-file, CSP, and no-CDN checks, ESM syntax/import/export validation (`scripts/check-syntax.js`), and pinned ESLint (`8.57.1`).
2. **PWA & service worker integrity:** Manifest, icon, and `APP_SHELL` module-graph completeness (`scripts/validate-pwa.js`) plus simulated SW install/activate/fetch tests (`tests/test_pwa.js`).
3. **Node unit, regression & stress suites:** Lightweight DOM-mocked (`tests/mock_dom.js`) unit, TTS controller, CSS/WCAG contrast/UI regression (`tests/test_regressions.js`), and large-document stress (`tests/test_empirical_stress.js`) tests.
4. **Headless browser E2E checks:** Deep desktop and mobile Playwright regression suite (`scripts/deep-playwright.js`) running against an in-process static server (`scripts/browser-smoke-utils.js`), verifying ES module requests, sanitization, carousel drag, typography, TTS lifecycle, offline SW reload, mobile bottom sheet flow, and FAB clearance.
