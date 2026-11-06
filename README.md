# Reader Webapp

A lightweight, local-first reader for copied text and Markdown. Paste content into the app, switch to a reading preset that feels comfortable, and optionally listen with your browser's text-to-speech engine.

**Live app:** https://patelakash007.github.io/reader-webapp/

## What it does

- **Reads pasted text and Markdown.** Supports headings, paragraphs, emphasis, links, lists, blockquotes, code, and other common Markdown structures.
- **Renders Markdown defensively.** Raw HTML is displayed as text, unsafe link targets are rejected, and Markdown images are represented by their alt text rather than loaded as images.
- **Offers 20 reading presets.** Choose from 10 light and 10 dark presets, and move between presets using the controls or supported swipe gestures.
- **Lets you tune typography.** Adjust text size, line height, letter spacing, and margins.
- **Includes browser text-to-speech (TTS).** Use available system voices, adjust the speech rate, and follow narration with word highlighting and automatic scrolling. Voice availability and audio behavior depend on the browser and device.
- **Works as an installable PWA.** On supported browsers, the app shell can be cached for offline reopening after the first successful visit.

The app accepts up to **1,000,000 characters** of pasted text.

### Deliberately out of scope

Reader Webapp is designed around pasted text and Markdown. It does **not** provide file uploads or PDF/DOCX extraction, an in-reader editor, bookmarks, exports, saved reading sessions, or persistent preferences. Clearing or reloading the app does not save your reading content or settings for later.

## Use the app

1. Open the [live app](https://patelakash007.github.io/reader-webapp/).
2. Paste text or Markdown into the input area.
3. Select **Read Text**.
4. Change the theme and typography in Reading Settings. Open the Speech (TTS) section to listen when your browser supports speech synthesis.

## Run locally

This is a static web app; there is no build step or backend required for normal use.

```bash
git clone https://github.com/patelakash007/reader-webapp.git
cd reader-webapp
python -m http.server 8080
```

Open http://localhost:8080/ in your browser.

Use a local server or the hosted app to test service-worker and PWA behavior. Opening `index.html` directly with a `file://` URL does not provide the same environment.

## Project layout

```text
reader-webapp/
├── .github/workflows/quality-checks.yml  # CI hygiene, unit, regression and browser tests
├── icons/                                # PWA icons
├── scripts/                              # Syntax, browser, and PWA test helpers
├── tests/                                # Unit, regression, stress, storage and PWA tests
├── src/
│   ├── app.mjs                           # Application initialization
│   ├── markdown-parser.mjs               # Markdown parsing and safe rendering
│   ├── reader.mjs                        # Reader flow and rendering coordination
│   ├── reader-renderer.mjs               # Incremental DOM rendering
│   ├── reader-navigation.mjs             # Reader and mobile settings navigation
│   ├── settings.mjs                      # Themes and typography settings
│   ├── tts-core.mjs                      # Speech text and tokenization helpers
│   ├── tts-controller.mjs                # Speech playback state and controls
│   └── ...                               # Shared state, UI and utility modules
├── vendor/marked.esm.mjs                 # Local Markdown parser
├── index.html                            # App shell and controls
├── style.css                             # App styles
├── script.js                             # Compatibility entry point
├── sw.js                                 # Service worker
├── manifest.webmanifest                  # PWA metadata
├── package.json                          # Test commands and dev dependency
└── README.md
```

## Tests

Node.js is required. Install the development dependency first:

```bash
npm ci
```

Run the main checks:

```bash
npm test
```

This runs syntax/import validation, PWA app-shell validation, PWA service worker behavior tests, unit and regression tests, empirical stress tests, and browser-storage cleanup regression tests. CI also runs the pinned ESLint check and browser smoke/deep-regression suites.

Additional checks are available:

| Command | What it checks |
| --- | --- |
| `npm run test:pwa` | PWA app-shell validation and service-worker behavior |
| `npm run test:regressions` | Regression test suite including storage isolation checks |
| `npm run test:smoke` | Browser smoke tests and basic reader interactions |
| `npm run test:deep` | Deeper browser regression checks |
| `npm run test:chromium` | Lightweight Chromium-only smoke test |
| `npm run test:storage` | Legacy browser-storage cleanup and data-isolation regression test |
| `npm run lint` | ESLint check using pinned ESLint 8.57.1 |

The browser tests need Playwright and a compatible browser executable. The scripts look for `BROWSER_EXE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or `CHROMIUM_EXECUTABLE` if a browser is not found automatically. CI installs Chromium and runs the browser checks.

Browser-test screenshots, HTML captures, and logs are written under `output/browser-smoke/` and are not intended as source files.

## Privacy and offline behavior

Pasted content is processed in the browser; the app has no application backend for receiving or storing reading text. Reading content and settings are not persisted across reloads. The app uses local assets and does not rely on third-party font or script CDNs.

The service worker caches the static application shell, including the HTML, styles, JavaScript modules, Markdown parser, manifest, and icons. It does not intentionally store pasted reading content as an offline document. Avoid entering sensitive information into any website unless you trust the device, browser session, and hosting environment.

## Contributing

Keep changes focused and consistent with the app's pasted-text/Markdown scope. Create a branch, run the relevant tests, inspect the diff, and open a pull request against `main`.

## License

MIT. See [LICENSE](LICENSE).
