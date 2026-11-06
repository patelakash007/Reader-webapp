const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  browserEnvVars,
  ensureOutputDir,
  findBrowserExecutable,
  outputDir,
  rootDir,
  startStaticServer,
  waitForServer,
  writeJson
} = require('./browser-smoke-utils');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadPlaywright() {
  for (const packageName of ['playwright-core', 'playwright']) {
    try {
      return { packageName, module: require(packageName) };
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  return null;
}

function capturePageErrors(page, target) {
  page.on('console', message => {
    if (message.type() === 'error') target.push(message.text());
  });
  page.on('pageerror', error => {
    target.push(error.message);
  });
}

async function waitForText(page, selector, text) {
  await page.waitForFunction(
    ([targetSelector, expectedText]) => {
      const target = document.querySelector(targetSelector);
      return Boolean(target && target.textContent && target.textContent.includes(expectedText));
    },
    [selector, text]
  );
}

async function getHttpStatus(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });

    request.on('error', reject);
    request.setTimeout(3000, () => {
      request.destroy(new Error('Timed out waiting for HTTP status.'));
    });
  });
}

async function revealToolbar(page) {
  const isHidden = await page.locator('#toolbar.hidden-bar').count();
  if (!isHidden) return;

  await page.locator('#readerContent').click({ position: { x: 20, y: 20 } });
  await page.waitForFunction(() => !document.querySelector('#toolbar')?.classList.contains('hidden-bar'));
}

async function expandSettingsSection(page, sectionName) {
  await revealToolbar(page);
  const sectionSelector = `[data-settings-section="${sectionName}"]`;
  await page.waitForSelector(sectionSelector);
  const expanded = await page.locator(`${sectionSelector} .settings-section-toggle`).getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await page.click(`${sectionSelector} .settings-section-toggle`);
  }
  await page.waitForFunction(selector => {
    const section = document.querySelector(selector);
    const panel = section ? section.querySelector('.settings-section-panel') : null;
    return Boolean(section && panel && section.classList.contains('is-open') && !panel.hidden);
  }, sectionSelector);
}

async function runDeepPlaywrightChecks() {
  ensureOutputDir();
  const playwright = loadPlaywright();

  if (!playwright) {
    throw new Error('Deep Playwright checks require playwright-core or playwright.');
  }

  const browserExecutable = findBrowserExecutable();
  const localServer = await startStaticServer();
  const url = localServer.url;
  const screenshots = [];
  const results = [];
  let browser;

  try {
    await waitForServer(url);
    const malformedStatus = await getHttpStatus(`${url}%E0%A4%A`);
    assert(malformedStatus === 400, `Malformed local-server path returned ${malformedStatus}, expected 400.`);

    const launchOptions = { headless: true };
    if (browserExecutable) {
      launchOptions.executablePath = browserExecutable.path;
    } else if (playwright.packageName === 'playwright-core') {
      console.warn('No browser executable was detected for deep checks.');
      console.warn(`Set one of these env vars to force a Chromium-compatible executable: ${browserEnvVars.join(', ')}`);
    }

    browser = await playwright.module.chromium.launch(launchOptions);
    const context = await browser.newContext({
      viewport: { width: 1365, height: 900 },
      acceptDownloads: true
    });
    await context.addInitScript(() => {
      class MockSpeechSynthesisUtterance {
        constructor(text) {
          this.text = text;
          this.rate = 1;
          this.pitch = 1;
          this.voice = null;
          this.onstart = null;
          this.onboundary = null;
          this.onend = null;
          this.onerror = null;
        }
      }
      try {
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          value: MockSpeechSynthesisUtterance,
          configurable: true,
          writable: true
        });
      } catch (err) {
        window.SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
      }
      class MockSpeechSynthesis {
        constructor() {
          this.speaking = false;
          this.paused = false;
          this.pending = false;
          this.onvoiceschanged = null;
          this._voices = [
            { name: 'Playwright Test Voice', lang: 'en-US', voiceURI: 'pw-test-voice', default: true }
          ];
        }
        getVoices() {
          return this._voices;
        }
        speak(utterance) {
          this.speaking = true;
          this.paused = false;
          if (utterance) {
            this._currentUtterance = utterance;
            setTimeout(() => {
              if (this.speaking && utterance.onstart) utterance.onstart();
            }, 0);
          }
        }
        pause() {
          this.paused = true;
          this.speaking = false;
        }
        resume() {
          this.paused = false;
          this.speaking = true;
        }
        cancel() {
          this.speaking = false;
          this.paused = false;
        }
      }
      const mockSynth = new MockSpeechSynthesis();
      try {
        Object.defineProperty(window, 'speechSynthesis', {
          value: mockSynth,
          configurable: true,
          writable: true
        });
      } catch (err) {
        window.speechSynthesis = mockSynth;
      }
    });
    const page = await context.newPage();
    const browserErrors = [];
    capturePageErrors(page, browserErrors);

    await page.goto(url, { waitUntil: 'networkidle' });
    const title = await page.title();
    await page.waitForSelector('#app');
    assert(/Reader Webapp/i.test(title), `Unexpected page title: ${title}`);
    const srcDir = path.join(rootDir, 'src');
    const moduleFiles = [
      ...fs.readdirSync(srcDir).filter(f => f.endsWith('.mjs')).sort().map(f => `./src/${f}`),
      './vendor/marked.esm.mjs'
    ];
    const moduleStatuses = await page.evaluate(async files => Promise.all(files.map(async file => {
      const response = await fetch(file, { cache: 'no-store' });
      return { file, status: response.status };
    })), moduleFiles);
    assert(moduleStatuses.every(module => module.status === 200), `ES module asset check failed: ${JSON.stringify(moduleStatuses)}`);
    screenshots.push(path.join(outputDir, 'deep-initial.png'));
    await page.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });
    results.push('Initial app shell loaded.');

    await page.fill('#pasteArea', 'temporary text');
    await page.reload({ waitUntil: 'networkidle' });
    const restoredValue = await page.locator('#pasteArea').inputValue();
    assert(restoredValue === '', 'Paste textarea restored previous text after reload.');
    results.push('Input state resets after reload.');

    const maliciousMarkdown = [
      '# Alpha Heading',
      '',
      'HELLO SECTION',
      '',
      'Paragraph with **bold**, *emphasis*, `code`, [safe](https://example.com/path?q=1), and [bad](javascript:alert(1)).',
      '',
      'Inline code literal: `**not bold** and [not a link](https://example.com/inside)`.',
      '',
      '[query link](https://example.com/search?q=one&lang=en), [protocol relative](//example.com/nope), and [data link](data:text/html,<b>bad</b>).',
      '',
      '<script>window.__readerXss = 1;</script><img src=x onerror="window.__readerXss=2">',
      '',
      '```',
      '<b>raw code stays escaped</b>',
      '```',
      '',
      '- first item',
      '1. ordered item',
      '',
      '> quoted text'
    ].join('\n');

    await page.fill('#pasteArea', maliciousMarkdown);
    await page.click('#readBtn');
    await page.waitForSelector('#readerView.active');
    await waitForText(page, '#readerContent', 'Alpha Heading');
    screenshots.push(path.join(outputDir, 'deep-reader.png'));
    await page.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });

    const sanitize = await page.evaluate(() => ({
      xss: window.__readerXss || 0,
      scriptCount: document.querySelectorAll('#readerContent script').length,
      handlerCount: Array.from(document.querySelectorAll('#readerContent *'))
        .filter(element => Array.from(element.attributes).some(attribute => /^on/i.test(attribute.name))).length,
      javascriptLinks: document.querySelectorAll('#readerContent a[href^="javascript:"]').length,
      safeLinks: document.querySelectorAll('#readerContent a[href^="https://example.com/"]').length,
      queryLinkHref: document.querySelector('#readerContent a[href^="https://example.com/search"]')?.getAttribute('href') || '',
      protocolRelativeLinks: document.querySelectorAll('#readerContent a[href^="//"]').length,
      dataLinks: document.querySelectorAll('#readerContent a[href^="data:"]').length,
      inlineCodeText: Array.from(document.querySelectorAll('#readerContent p code'))
        .map(code => code.textContent || '')
        .find(text => text.includes('not bold')) || '',
      inlineCodeHasMarkup: Array.from(document.querySelectorAll('#readerContent p code'))
        .some(code => (code.textContent || '').includes('not bold') && Boolean(code.querySelector('strong, em, a'))),
      h1Count: document.querySelectorAll('#readerContent h1').length,
      h2Count: document.querySelectorAll('#readerContent h2').length,
      preText: document.querySelector('#readerContent pre code')?.textContent || ''
    }));
    assert(sanitize.xss === 0, 'Injected script or event handler executed.');
    assert(sanitize.scriptCount === 0, 'Script nodes rendered into reader content.');
    assert(sanitize.handlerCount === 0, 'Event handler attributes rendered into reader content.');
    assert(sanitize.javascriptLinks === 0, 'Unsafe javascript: markdown link rendered.');
    assert(sanitize.safeLinks === 2, 'Safe HTTPS markdown links did not render.');
    assert(sanitize.queryLinkHref.includes('?q=one&lang=en'), `Query-string link was corrupted: ${sanitize.queryLinkHref}`);
    assert(sanitize.protocolRelativeLinks === 0, 'Protocol-relative markdown link rendered.');
    assert(sanitize.dataLinks === 0, 'Unsafe data: markdown link rendered.');
    assert(sanitize.inlineCodeText.includes('**not bold** and [not a link](https://example.com/inside)'), 'Inline code text did not stay literal.');
    assert(!sanitize.inlineCodeHasMarkup, 'Inline code parsed nested markdown markup.');
    assert(sanitize.h1Count >= 1 && sanitize.h2Count >= 1, 'Markdown headings did not render.');
    assert(sanitize.preText.includes('<b>raw code stays escaped</b>'), 'Code block text did not stay literal.');
    results.push('Markdown rendering and sanitization passed.');

    const carouselBox = await page.locator('#presetWindow').boundingBox();
    assert(Boolean(carouselBox), 'Preset carousel was not measurable.');
    await page.evaluate(({ x, y, width }) => {
      const windowEl = document.querySelector('#presetWindow');
      windowEl.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        clientX: x + width - 24,
        clientY: y + 20
      }));
      window.dispatchEvent(new MouseEvent('mousemove', {
        bubbles: true,
        clientX: x + 24,
        clientY: y + 20
      }));
      window.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        clientX: x + 24,
        clientY: y + 20
      }));
      document.querySelector('.preset-card[data-index="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.querySelector('.preset-card[data-index="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, carouselBox);
    await page.waitForFunction(() => document.querySelector('#presetWindow')?.getAttribute('aria-label')?.includes('Stark'));
    results.push('Carousel drag suppression resets before later card clicks.');

    await expandSettingsSection(page, 'text');
    await page.locator('#lineHeightInput').fill('2.2');
    await page.locator('#lineHeightInput').dispatchEvent('input');
    await page.locator('#letterSpacingInput').fill('0.05');
    await page.locator('#letterSpacingInput').dispatchEvent('input');
    const typography = await page.evaluate(() => ({
      lineHeight: document.querySelector('#readerContent').style.lineHeight,
      letterSpacing: document.querySelector('#readerContent').style.letterSpacing,
      expanded: document.querySelector('[data-settings-section="text"] .settings-section-toggle')?.getAttribute('aria-expanded')
    }));
    assert(typography.lineHeight === '2.2', 'Line-height slider did not update reader style.');
    assert(typography.letterSpacing === '0.05em', 'Letter-spacing slider did not update reader style.');
    assert(typography.expanded === 'true', 'Settings button ARIA state did not expand.');
    results.push('Settings section controls passed.');

    await expandSettingsSection(page, 'listen');
    await page.locator('#voiceRateInput').fill('1.5');
    await page.locator('#voiceRateInput').dispatchEvent('input');
    await page.locator('#voiceRateInput').dispatchEvent('change');
    const ttsControls = await page.evaluate(() => {
      const rateVal = document.querySelector('#voiceRateVal')?.textContent;
      const speedBtn = document.querySelector('#audioSpeedBtn')?.textContent;
      const wordSpans = document.querySelectorAll('#readerContent .tts-word');
      return {
        rateVal,
        speedBtn,
        wordCount: wordSpans.length,
        hasWordIndices: Array.from(wordSpans).every(span => span.hasAttribute('data-word-idx')),
        listenExpanded: document.querySelector('[data-settings-section="listen"] .settings-section-toggle')?.getAttribute('aria-expanded')
      };
    });
    assert(ttsControls.rateVal === '1.5x', `Voice rate label did not update: ${ttsControls.rateVal}`);
    assert(ttsControls.speedBtn === '1.5x', `Audio bar speed button did not update: ${ttsControls.speedBtn}`);
    assert(ttsControls.wordCount > 0, 'No .tts-word spans found in reader content');
    assert(ttsControls.hasWordIndices, 'Word spans are missing data-word-idx attributes');
    assert(ttsControls.listenExpanded === 'true', 'Listen section did not expand');

    // Test TTS Play / Pause / Resume / Stop cycle
    await page.click('#ttsBtn');
    await page.waitForFunction(() => {
      const ttsBtn = document.querySelector('#ttsBtn');
      const playerBar = document.querySelector('#audioPlayerBar');
      return ttsBtn && ttsBtn.classList.contains('active') && playerBar && playerBar.classList.contains('active');
    });
    await page.click('#ttsBtn'); // Pause
    await page.waitForFunction(() => {
      const ttsBtn = document.querySelector('#ttsBtn');
      return ttsBtn && ttsBtn.textContent.includes('Resume');
    });
    await page.click('#ttsBtn'); // Resume
    await page.waitForFunction(() => {
      const ttsBtn = document.querySelector('#ttsBtn');
      return ttsBtn && ttsBtn.textContent.includes('Pause');
    });
    await page.click('#ttsStopBtn'); // Stop
    await page.waitForFunction(() => {
      const ttsBtn = document.querySelector('#ttsBtn');
      const stopBtn = document.querySelector('#ttsStopBtn');
      return ttsBtn && !ttsBtn.classList.contains('active') && stopBtn && stopBtn.disabled;
    });
    results.push('TTS audio controls, tokenization, and lifecycle passed.');

    await page.click('#backBtn');
    await page.waitForSelector('#inputView:not(.hidden)');
    results.push('Navigation back to input view passed.');

    const serviceWorkerReady = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration && registration.active);
    });
    assert(serviceWorkerReady, 'Service worker did not become ready.');
    await page.reload({ waitUntil: 'networkidle' });
    await context.setOffline(true);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app');
    assert(await page.locator('#pasteArea').isVisible(), 'Offline reload did not restore the app shell.');
    await context.setOffline(false);
    results.push('Service worker offline app shell passed.');

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors = [];
    capturePageErrors(mobilePage, mobileErrors);
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    await mobilePage.fill('#pasteArea', '# Mobile\n\nMobile controls test.');
    await mobilePage.click('#readBtn');
    await mobilePage.waitForSelector('#readerView.active');
    await mobilePage.click('#mobileFab');
    await mobilePage.waitForSelector('#toolbar.expanded');
    await mobilePage.waitForSelector('#settingsDrawer.active');
    await mobilePage.waitForFunction(() => {
      const toolbar = document.querySelector('#toolbar');
      const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : { top: 0 };
      const fab = document.querySelector('#mobileFab');
      const fabRect = fab ? fab.getBoundingClientRect() : null;
      return Boolean(fabRect && fabRect.width > 0 && fabRect.height > 0 && fabRect.bottom <= toolbarRect.top + 8);
    });
    await mobilePage.waitForTimeout(450);
    const mobileState = await mobilePage.evaluate(() => {
      const toolbar = document.querySelector('#toolbar');
      const toolbarRect = toolbar ? toolbar.getBoundingClientRect() : { top: 0 };
      const fab = document.querySelector('#mobileFab');
      const fabRect = fab ? fab.getBoundingClientRect() : null;
      const backdropTapTarget = document.elementFromPoint(
        window.innerWidth / 2,
        Math.max(24, toolbarRect.top / 2)
      );
      const sectionStates = Array.from(document.querySelectorAll('[data-settings-section]')).map(section => ({
        name: section.getAttribute('data-settings-section'),
        expanded: section.querySelector('.settings-section-toggle')?.getAttribute('aria-expanded'),
        hidden: section.querySelector('.settings-section-panel')?.hidden
      }));

      return {
        fabExpanded: document.querySelector('#mobileFab')?.getAttribute('aria-expanded'),
        fabVisible: Boolean(fabRect && fabRect.width > 0 && fabRect.height > 0),
        fabAboveSheet: Boolean(fabRect && fabRect.bottom <= toolbarRect.top + 8),
        fabRect: fabRect ? { top: fabRect.top, bottom: fabRect.bottom, left: fabRect.left, right: fabRect.right } : null,
        toolbarExpanded: toolbar?.classList.contains('expanded'),
        toolbarTop: toolbarRect.top,
        toolbarScrollTop: toolbar ? toolbar.scrollTop : 0,
        drawerExpanded: document.querySelector('#settingsDrawer')?.classList.contains('active'),
        sectionStates,
        bodyOverflow: getComputedStyle(document.body).overflow,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        backdropTapTargetId: backdropTapTarget ? backdropTapTarget.id : ''
      };
    });
    assert(mobileState.fabExpanded === 'true' && mobileState.toolbarExpanded && mobileState.drawerExpanded, 'Mobile sheet or settings state did not expand.');
    assert(mobileState.fabVisible, 'Mobile settings close pill was hidden while the sheet was open.');
    assert(mobileState.fabAboveSheet, `Mobile settings close pill overlapped the bottom sheet controls (fabBottom=${mobileState.fabRect?.bottom}, toolbarTop=${mobileState.toolbarTop}).`);
    assert(mobileState.toolbarTop >= 120, `Mobile sheet left too little tappable backdrop above it: top=${mobileState.toolbarTop}.`);
    assert(mobileState.toolbarScrollTop === 0, `Mobile settings drawer scrolled top controls away: scrollTop=${mobileState.toolbarScrollTop}.`);
    assert(mobileState.sectionStates.find(section => section.name === 'theme')?.expanded === 'true', 'Theme section was not open by default on mobile.');
    assert(mobileState.sectionStates.filter(section => section.name !== 'theme').every(section => section.expanded === 'false' && section.hidden), 'Non-theme mobile settings sections were not collapsed by default.');
    assert(mobileState.bodyOverflow === 'hidden', `Mobile sheet did not lock background scroll: overflow=${mobileState.bodyOverflow}.`);
    assert(mobileState.backdropTapTargetId === 'sheetBackdrop', `Mobile backdrop tap target was blocked by ${mobileState.backdropTapTargetId || 'nothing'}.`);
    assert(mobileState.bodyWidth <= mobileState.viewportWidth + 1, `Mobile layout overflowed horizontally: body=${mobileState.bodyWidth}, viewport=${mobileState.viewportWidth}`);

    await expandSettingsSection(mobilePage, 'text');
    const mobileTextSectionExpanded = await mobilePage.locator('[data-settings-section="text"] .settings-section-toggle').getAttribute('aria-expanded');
    assert(mobileTextSectionExpanded === 'true', 'Mobile Text section did not expand after tapping its header.');
    screenshots.push(path.join(outputDir, 'deep-mobile-settings.png'));
    await mobilePage.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });

    await mobilePage.mouse.click(Math.floor(mobileState.viewportWidth / 2), 48);
    await mobilePage.waitForFunction(() => {
      const toolbar = document.querySelector('#toolbar');
      const backdrop = document.querySelector('#sheetBackdrop');
      return toolbar && !toolbar.classList.contains('expanded') && backdrop && !backdrop.classList.contains('show');
    });
    await mobilePage.waitForTimeout(450);
    const mobileCollapsedState = await mobilePage.evaluate(() => ({
      fabExpanded: document.querySelector('#mobileFab')?.getAttribute('aria-expanded'),
      toolbarExpanded: document.querySelector('#toolbar')?.classList.contains('expanded'),
      textExpanded: document.querySelector('[data-settings-section="text"] .settings-section-toggle')?.getAttribute('aria-expanded'),
      backdropVisible: document.querySelector('#sheetBackdrop')?.classList.contains('show'),
      bodyOverflow: getComputedStyle(document.body).overflow
    }));
    assert(mobileCollapsedState.fabExpanded === 'false', 'Mobile sheet collapse left the settings FAB expanded.');
    assert(!mobileCollapsedState.toolbarExpanded, 'Mobile backdrop tap did not collapse the bottom sheet.');
    assert(mobileCollapsedState.textExpanded === 'false', 'Mobile sheet collapse did not reset expanded settings sections.');
    assert(!mobileCollapsedState.backdropVisible, 'Mobile backdrop tap left the backdrop visible.');
    assert(mobileCollapsedState.bodyOverflow !== 'hidden', 'Mobile sheet collapse left background scroll locked.');
    screenshots.push(path.join(outputDir, 'deep-mobile-collapsed.png'));
    await mobilePage.screenshot({ path: screenshots[screenshots.length - 1], fullPage: false });

    assert(mobileErrors.length === 0, `Mobile browser errors:\n${mobileErrors.join('\n')}`);
    await mobileContext.close();
    results.push('Mobile settings drawer interaction flow passed.');

    assert(browserErrors.length === 0, `Browser errors:\n${browserErrors.join('\n')}`);

    writeJson('deep-playwright.json', {
      mode: 'deep-playwright',
      url,
      title,
      playwrightPackage: playwright.packageName,
      browserExecutable: browserExecutable ? browserExecutable.path : null,
      browserSource: browserExecutable ? browserExecutable.source : 'playwright default',
      screenshots: screenshots.map(filePath => path.relative(process.cwd(), filePath)),
      results
    });

    console.log(`Deep Playwright checks passed using ${playwright.packageName}.`);
    console.log(browserExecutable
      ? `Browser executable: ${browserExecutable.path}`
      : 'Browser executable: Playwright default browser resolution');
    console.log(`Saved screenshots and logs under ${path.relative(process.cwd(), outputDir)}`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await localServer.close();
  }
}

runDeepPlaywrightChecks().catch(error => {
  console.error(error.stack || error.message);
  console.error('If Playwright browser launch failed, set BROWSER_EXE, PLAYWRIGHT_CHROMIUM_EXECUTABLE, or CHROMIUM_EXECUTABLE to a Chromium-compatible executable.');
  process.exit(1);
});
