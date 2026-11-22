# Reader Webapp

A lightweight, local-first browser reader for copied text and Markdown. Paste content into the app, choose a comfortable visual preset and typography setup, and optionally listen using your browser's text-to-speech engine.

**Live app:** https://patelakash007.github.io/Reader-webapp/

## Features

- **Text & GitHub-Flavored Markdown rendering.** Powered by a vendored local copy of `marked` (v15.0.12) with support for headings (`h1`–`h6` with deduplicated slugified anchor IDs), automatic smart promotion of standalone uppercase headings, paragraphs, emphasis, links, nested and task lists, blockquotes, horizontal rules, inline/fenced code, and horizontally scrollable tables.
- **Defensive sanitization by default.** Raw HTML is escaped and displayed as literal text, Markdown images render as `[Image: <alt>]` rather than fetching remote resources, and links only allow `http:`, `https:`, `ftp:`, `mailto:`, root-relative (`/`) paths, and `#` fragment anchors (`javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, protocol-relative `//`, and control characters are rejected). External links open with `rel="noopener noreferrer"`.
- **20 WCAG AA reading presets (10 Light, 10 Dark).**
  - **Light:** Claude *(default)*, Zen, Stark, Book, Classic, Kindle, GitHub, Amber, Newspaper, Lavender.
  - **Dark:** Night, Void, Carbon, Midnight, Obsidian, Dracula, Nord, Catppuccin, Forest, Ink.
  - Presets use local system font stacks (`sans`, `serif`, `mono`), meet WCAG AA contrast (`>= 4.5:1`), dynamically update the browser `theme-color`, and cycle seamlessly across Light and Dark modes.
- **Tunable typography & responsive reading layout.** Adjust text size (`S`, `M`, `L`, `XL`), line height (`1.4`–`2.6`), letter spacing (`-0.03em`–`0.15em`), and margins (`12px`–`80px`, capped on narrow viewports to preserve readability). Includes a top reading progress bar, an auto-hiding desktop toolbar, a 2-column tablet settings layout (`641px`–`960px`), and an accessible mobile bottom sheet (`<= 640px`) with focus trapping and scroll locking.
- **Browser Text-to-Speech (TTS).** Uses the Web Speech API with lazy non-destructive DOM word tokenization, active word highlighting, reduced-motion-aware auto-scrolling, click-to-speak (when TTS is active or the Speech panel is open), voice selection, speed controls (`0.5x`–`2.5x` slider and floating player speed chip cycling `0.8x`–`2.0x`), 190-character boundary chunking, and fallback timing when browsers do not emit word-boundary events. Voice availability and audio behavior depend on the browser and OS.
- **Incremental rendering for large pastes.** Accepts up to **1,000,000 characters** and renders Markdown tokens incrementally across animation frames so the UI remains responsive.
- **Installable offline-capable PWA.** Caches the static application shell via a service worker (`sw.js`) for offline reopening after the first successful visit.

### Deliberately out of scope

Reader Webapp is intentionally focused on ephemeral pasted text and Markdown. It does **not** include file uploads or PDF/DOCX extraction, an in-reader editor, bookmarks, exports, accounts, or saved reading sessions/preferences. Reloading or clearing the page resets content and settings.

## Usage, Controls & Shortcuts

1. Open the [live app](https://patelakash007.github.io/Reader-webapp/) (or run locally).
2. Paste plain text or Markdown into the input area and select **Read Text**.
3. Open **Reading Settings** (auto-hiding top bar on desktop/tablet, floating settings button on mobile) to switch themes, adjust typography, or open **Speech (TTS)**.

### Keyboard shortcuts & gestures

| Input | Action |
| --- | --- |
| `ArrowLeft` / `ArrowRight` | Cycle to the previous or next preset (wraps across Light and Dark modes; ignored while focused on interactive form controls) |
| `Enter` / `Space` *(on preset carousel)* | Re-apply the focused preset |
| `Tab` *(desktop reader)* | Reveals the top toolbar if hidden |
| `Escape` | Layered dismiss: closes the mobile settings sheet → blurs an active toolbar input → clears text selection → returns to the input view |
| Swipe left / right *(touch devices)* | Cycle presets seamlessly across Light and Dark modes (blocked on code blocks, tables, interactive controls, and active text selections) |
| Drag preset card | Drag horizontally in the preset carousel to switch presets |
| Click / tap a word | Start TTS narration from that word when Speech (TTS) is open or playback is active |

## Run Locally

This is a static ES-module web app with no build step or backend required.

```bash
git clone https://github.com/patelakash007/Reader-webapp.git
cd Reader-webapp
python3 -m http.server 8080
```

Open http://localhost:8080/ in your browser.

> Use a local HTTP server (or the hosted HTTPS deployment) when testing ES modules, service worker caching, or PWA installation. Opening `index.html` directly via `file://` is not supported for module loading or service workers.

## Project Layout

```text
Reader-webapp/
├── .github/workflows/quality-checks.yml  # CI hygiene, lint, PWA, unit, stress & Playwright suites
├── docs/
│   └── ARCHITECTURE.md                   # Detailed module, rendering, TTS & PWA architecture
├── icons/                                # Standard and maskable PWA icons (192px, 512px)
├── scripts/
│   ├── browser-smoke-utils.js            # Local static server & Chromium launcher helpers
│   ├── check-syntax.js                   # Syntax, ESM import & cross-module export checks
│   ├── deep-playwright.js                # Full end-to-end desktop, mobile, TTS & offline checks
│   ├── smoke-chromium.js                 # Lightweight headless Chromium DOM/screenshot smoke
│   ├── smoke-playwright.js               # Desktop & mobile smoke checks via Playwright
│   └── validate-pwa.js                   # Manifest, icon & sw.js APP_SHELL integrity checks
├── src/
│   ├── app.mjs                           # Application bootstrap & service worker registration
│   ├── constants.mjs                     # Limits, 20 presets, theme colors, fonts & TTS constants
│   ├── context.mjs                       # Shared app state and runtime session container
│   ├── dom.mjs                           # DOM element collection
│   ├── markdown-parser.mjs               # Marked config, sanitization, heading IDs & smart headings
│   ├── parser.mjs                        # Parser facade & character-limit enforcement
│   ├── preset-carousel.mjs               # Preset track drag, swipe gestures & keyboard helpers
│   ├── reader-navigation.mjs             # Mobile bottom sheet dialog, focus trap & resize sync
│   ├── reader-renderer.mjs               # Frame-budgeted incremental Markdown DOM rendering
│   ├── reader.mjs                        # Reader lifecycle, scroll progress & global events
│   ├── settings.mjs                      # Theme, font, typography & settings accordion controls
│   ├── storage.mjs                       # Targeted cleanup of legacy reader_* storage keys
│   ├── tts-controller.mjs                # Playback state machine, voice lifecycle & visibility handling
│   ├── tts-core.mjs                      # 190-char chunking, voice sorting & DOM tokenization
│   ├── tts.mjs                           # TTS module facade
│   ├── ui.mjs                            # Status banners, loader, live announcer & focusability
│   └── utils.mjs                         # Escaping, clamping, device detection & render cancellation
├── tests/
│   ├── mock_dom.js                       # Lightweight DOM mock for Node-based tests
│   ├── test_empirical_stress.js          # Large-document & high-volume highlight performance tests
│   ├── test_pwa.js                       # Service worker install, activate & fetch strategy tests
│   ├── test_reader.js                    # Parser, chunking, voice & tokenization unit tests
│   ├── test_regressions.js               # Comprehensive regression suite (Markdown, TTS, UI, A11y, CSS)
│   ├── test_storage.js                   # Legacy storage cleanup & origin-isolation tests
│   └── test_tts_controller.js            # TTS controller state machine & lifecycle tests
├── vendor/marked.esm.mjs                 # Vendored marked v15.0.12 ESM bundle
├── index.html                            # App shell markup & strict Content-Security-Policy
├── style.css                             # Themes, responsive layouts & reduced-motion styles
├── script.js                             # Deferred entry point importing src/app.mjs
├── sw.js                                 # Offline app-shell service worker
├── manifest.webmanifest                  # PWA web app manifest
├── .eslintrc.json                        # Pinned ESLint 8.57.1 configuration
├── package.json                          # Test/lint scripts and dev dependencies
├── CONTRIBUTING.md                       # Scope guidelines, checklists & PR workflow
├── LICENSE                               # MIT License
└── README.md
```

## Testing & Quality Checks

Node.js (v22 in CI) is required to run the automated test and lint suites. Install the pinned development dependencies (`eslint@8.57.1` and `playwright-core@1.60.0`) first:

```bash
npm ci
```

Run the core non-browser suite:

```bash
npm test
```

### Available npm scripts

| Command | What it checks |
| --- | --- |
| `npm test` | Runs syntax/import validation, PWA validation & SW behavior tests, unit tests, regressions, empirical stress tests, and storage isolation tests |
| `npm run test:syntax` | JavaScript syntax (`node --check`), ESM import targets/exports, and cross-module missing-import checks |
| `npm run test:pwa` | Web manifest, icon, `sw.js` `APP_SHELL` completeness, and service worker caching behavior |
| `npm run test:unit` | Core reader/TTS unit tests, TTS controller lifecycle tests, regression suite, and storage isolation tests |
| `npm run test:regressions` | Full regression suite and legacy storage cleanup tests |
| `npm run test:empirical` | Large-document parsing and high-volume word-highlight lookup benchmarks |
| `npm run test:storage` | Legacy browser-storage cleanup and same-origin key isolation tests |
| `npm run lint` | Pinned ESLint (`8.57.1`) checks across `script.js`, `sw.js`, `src/`, `scripts/`, and `tests/` |
| `npm run test:smoke` | Playwright desktop & mobile smoke tests, ES module fetch verification, and mobile FAB clearance |
| `npm run test:deep` | Deep Playwright end-to-end checks (sanitization, carousel drag, typography, TTS lifecycle, offline SW reload, mobile sheet flow) |
| `npm run test:chromium` | Lightweight headless Chromium DOM and screenshot smoke check (no Playwright required) |

### Running browser tests locally

Install Playwright's Chromium binary once:

```bash
npx playwright-core install --with-deps chromium
```

If you prefer an existing local Chromium, Chrome, or Edge executable, set `BROWSER_EXE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or `CHROMIUM_EXECUTABLE`. Browser test screenshots, HTML dumps, and JSON reports are written to `output/browser-smoke/` (gitignored).

## Privacy, Security & Offline Behavior

- **Local-only processing.** Pasted text stays in the browser; there is no application backend or analytics.
- **No persistence.** Reading text and settings are kept in memory only and reset on reload. On startup, [`cleanupLegacyBrowserStorage`](src/storage.mjs) removes known legacy `reader_*` keys from `localStorage` and `sessionStorage` while leaving any unrelated keys on the same origin intact.
- **Strict CSP & zero CDNs.** `index.html` enforces a strict `Content-Security-Policy` (`default-src 'self'`, `object-src 'none'`, `form-action 'none'`), and CI rejects any CDN URLs in application source files.
- **Service worker scope.** `sw.js` precaches the static application shell (HTML, CSS, JS/ESM modules, vendored Markdown parser, manifest, and icons) for offline reopening. It does not cache or persist pasted reading content. As with any web app, avoid entering sensitive data on untrusted devices or browser sessions.

## Further Documentation

- [Architecture Guide](docs/ARCHITECTURE.md) — Module graph, rendering pipeline, TTS internals, accessibility, and service worker lifecycle.
- [Contributing Guide](CONTRIBUTING.md) — Scope guardrails, development setup, maintenance checklists, and CI requirements.

## License

MIT. See [LICENSE](LICENSE).
