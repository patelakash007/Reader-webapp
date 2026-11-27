# Contributing to Reader Webapp

Thank you for contributing to Reader Webapp. This guide covers project scope boundaries, local verification, maintenance checklists, and pull request expectations.

## Scope & Design Principles

Reader Webapp is intentionally minimal and local-first:

- **In scope:** Pasted plain text and Markdown reading, defensive sanitization, visual/typography presets, accessibility, responsive layout, browser Web Speech API TTS, and offline app-shell caching.
- **Out of scope:** File uploads or PDF/DOCX extraction, in-reader text editing, bookmarks, exports, user accounts, backend services, external CDNs/fonts, or persisting user text/settings across reloads.

Keep changes focused, dependency-free at runtime (browser-native ES modules and CSS), and consistent with the strict Content Security Policy in `index.html`.

## Development Setup

1. Clone the repository and install pinned development dependencies (`eslint@8.57.1` and `playwright-core@1.60.0`):

   ```bash
   npm ci
   ```

2. Serve the app locally over HTTP (required for ES modules and service workers):

   ```bash
   python3 -m http.server 8080
   ```

3. For browser smoke and deep regression suites, install Playwright's Chromium binary:

   ```bash
   npx playwright-core install --with-deps chromium
   ```

   Alternatively, point to an existing Chromium, Chrome, or Edge executable with `BROWSER_EXE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, or `CHROMIUM_EXECUTABLE`.

## Verification & CI Parity

Pull requests and pushes to `main` run `.github/workflows/quality-checks.yml` on `ubuntu-24.04` with Node.js 22. Before opening a PR, run the same checks locally:

```bash
npm run test:syntax      # JS syntax + ESM import/export & missing-import verification
npm run lint             # Pinned ESLint 8.57.1 across script.js, sw.js, src/, scripts/, tests/
npm run test:pwa         # Manifest, icons, sw.js APP_SHELL completeness & SW unit tests
npm run test:unit        # Reader, TTS controller, regression & storage isolation suites
npm run test:empirical   # Large-document parsing & highlight lookup stress tests
npm run test:smoke       # Desktop & mobile Playwright smoke checks
npm run test:deep        # Deep Playwright E2E checks (XSS, carousel, TTS, offline SW, mobile sheet)
```

You can run all non-browser checks in one command with `npm test`, followed by `npm run lint`.

CI also checks that:
- Required repository files exist (`index.html`, `style.css`, `script.js`, `src/app.mjs`, `manifest.webmanifest`, `sw.js`, `README.md`, `LICENSE`, `vendor/marked.esm.mjs`).
- `index.html` contains a `Content-Security-Policy` meta tag.
- No CDN URLs (`cdn`, `cdnjs`, `unpkg`, `jsdelivr`) appear in `index.html`, `style.css`, `script.js`, or `src/`.

## Maintenance Checklists

When making changes in specific areas, remember these invariants (enforced by tests and CI):

### Adding, renaming, or editing app-shell files
- If you add or rename a module under `src/`, an icon, or another shell asset, update `APP_SHELL` in `sw.js` (`scripts/validate-pwa.js` automatically verifies the full `src/app.mjs` module graph against `APP_SHELL`).
- Whenever any file listed in `APP_SHELL` changes in a release-worthy way, bump `CACHE_NAME` in `sw.js` (e.g., `reader-webapp-shell-v14` → `v15`) so returning PWA clients receive updates atomically.

### Modifying HTML controls or element IDs (`index.html`)
- Add any new element IDs (including dynamically created ones such as `liveannouncer`) to `RESERVED_DOM_IDS` in `src/markdown-parser.mjs` (lowercase) so Markdown heading slugs cannot collide with app-shell elements.
- Ensure `<input type="range">` defaults align cleanly with their `min` and `step` attributes (checked by `tests/test_reader.js`), and keep live value readout elements synchronized on init and input.
- Keep ARIA attributes, `focus-visible` outlines, single-active-banner status routing, and keyboard focusability (`ui.setContainerFocusable`) intact.

### Modifying themes or styles (`style.css` / `src/constants.mjs`)
- Keep all 20 themes (`VALID_THEMES` and `THEME_COLORS` in `src/constants.mjs`, `.theme-*` rules in `style.css`) synchronized, and keep `:root` defaults and `manifest.webmanifest` aligned with the default `Claude` theme (`#faf8f5`) to prevent cold-load flash.
- Verify that every theme maintains **WCAG AA (`>= 4.5:1`)** contrast across text, accent, and status (`--ui-positive`, `--ui-negative`) colors (checked automatically in `tests/test_regressions.js`).
- Respect `@media (prefers-reduced-motion: reduce)` and mobile safe-area insets.

### Modifying Markdown parsing, TTS, or storage
- Preserve defensive sanitization (escaped raw HTML, allowlisted link schemes, alt-text-only images).
- Keep TTS DOM tokenization lazy and idempotent, and increment `session.speechGeneration` on state transitions that invalidate queued utterances.
- Do not write user content or settings to `localStorage`, `sessionStorage`, IndexedDB, or cookies.

## Pull Request Process

1. Create a focused branch from `main`.
2. Add or update unit/regression tests in `tests/` (or Playwright assertions in `scripts/`) for behavior changes and bug fixes.
3. Update `README.md`, `docs/ARCHITECTURE.md`, or `CONTRIBUTING.md` if user-facing behavior, scripts, checklists, or module architecture changes.
4. Ensure all checks pass and review `git diff` to confirm no temporary artifacts (`output/browser-smoke/`, screenshots, logs) are staged.
5. Open a pull request against `main` with a clear summary of the changes and verification results.
