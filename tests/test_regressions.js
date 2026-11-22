'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { MockDocument } = require('./mock_dom');

function restoreSnapshots(snapshots) {
  snapshots.forEach(([key, descriptor]) => {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  });
}

function withSavedGlobals(keys, fn) {
  const snapshots = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(() => restoreSnapshots(snapshots));
    }
    restoreSnapshots(snapshots);
    return result;
  } catch (err) {
    restoreSnapshots(snapshots);
    throw err;
  }
}

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const utils = await import('../src/utils.mjs');
  const constants = await import('../src/constants.mjs');
  const { createAppContext } = await import('../src/context.mjs');
  const { createReader } = await import('../src/reader.mjs');
  const { createSettings } = await import('../src/settings.mjs');
  const { createPresetCarousel } = await import('../src/preset-carousel.mjs');
  const { createUI } = await import('../src/ui.mjs');
  const { init } = await import('../src/app.mjs');

  const makeClassList = (initial = []) => {
    const values = new Set(initial);
    return {
      add: (...cls) => cls.forEach(c => values.add(c)),
      remove: (...cls) => cls.forEach(c => values.delete(c)),
      contains: cls => values.has(cls),
      toggle: (cls, force) => {
        if (force === true) { values.add(cls); return true; }
        if (force === false) { values.delete(cls); return false; }
        if (values.has(cls)) { values.delete(cls); return false; }
        values.add(cls);
        return true;
      }
    };
  };

  console.log('====================================================');
  console.log('RUNNING REGRESSION TEST SUITE');
  console.log('====================================================');

  console.log('\n--- 1. Markdown: Nested emphasis ---');
  const nestedEmphasis = '**bold *and italic* inside**';
  const nestedHtml = parser.parseMarkdownToHtml(nestedEmphasis);
  assert(
    nestedHtml.includes('<strong>bold <em>and italic</em> inside</strong>') ||
    nestedHtml.includes('<strong>bold <em>and italic</em></strong>'),
    `Nested emphasis failed: ${nestedHtml}`
  );
  assert(!nestedHtml.includes('**bold'), `Unparsed asterisks remained in nested emphasis: ${nestedHtml}`);
  console.log('✓ Nested emphasis correctly preserved.');

  console.log('\n--- 2. Markdown: Spaced asterisks must remain literal ---');
  const mathText = '2 * 3 * 4 = 24';
  const mathHtml = parser.parseMarkdownToHtml(mathText);
  assert(mathHtml.includes('2 * 3 * 4 = 24'), `Math text was mutated: ${mathHtml}`);
  assert(!mathHtml.includes('<em>'), `Spaced asterisks became emphasis: ${mathHtml}`);
  console.log('✓ Spaced asterisks remained literal mathematical text.');

  console.log('\n--- 3. Markdown: Nested lists ---');
  const nestedListMd = [
    '- parent',
    '  - child',
    '    - grandchild'
  ].join('\n');
  const nestedListHtml = parser.parseMarkdownToHtml(nestedListMd);
  assert(nestedListHtml.includes('parent'), 'Parent list item missing');
  assert(nestedListHtml.includes('child'), 'Child list item missing');
  assert(nestedListHtml.includes('grandchild'), 'Grandchild list item missing');
  assert(nestedListHtml.indexOf('child') > nestedListHtml.indexOf('parent'), 'Child should follow parent');
  const ulCount = (nestedListHtml.match(/<ul/g) || []).length;
  assert(ulCount >= 2, `Nested lists should have multiple list levels, found ${ulCount}`);
  console.log('✓ Nested lists preserved hierarchy.');

  console.log('\n--- 4. Markdown: Multi-line blockquotes ---');
  const blockquoteMd = [
    '> line one',
    '> line two'
  ].join('\n');
  const blockquoteHtml = parser.parseMarkdownToHtml(blockquoteMd);
  const blockquoteTagCount = (blockquoteHtml.match(/<blockquote/g) || []).length;
  assert.strictEqual(blockquoteTagCount, 1, `Expected exactly 1 blockquote tag for multi-line quote, got ${blockquoteTagCount}: ${blockquoteHtml}`);
  assert(blockquoteHtml.includes('line one'), 'Missing line one in blockquote');
  assert(blockquoteHtml.includes('line two'), 'Missing line two in blockquote');
  console.log('✓ Multi-line blockquotes produce one logical blockquote.');

  console.log('\n--- 5. Markdown: Ordered-list starting number ---');
  const orderedListMd = [
    '3. Three',
    '4. Four'
  ].join('\n');
  const orderedListHtml = parser.parseMarkdownToHtml(orderedListMd);
  assert(orderedListHtml.includes('<ol start="3">'), `Expected <ol start="3">, got: ${orderedListHtml}`);
  assert(orderedListHtml.includes('<li>Three</li>'), 'Missing item Three');
  assert(orderedListHtml.includes('<li>Four</li>'), 'Missing item Four');
  console.log('✓ Ordered-list starting number 3 preserved.');

  console.log('\n--- 6. Markdown: Soft line breaks within paragraph ---');
  const softBreakMd = [
    'Line one of the paragraph',
    'Line two of the same paragraph'
  ].join('\n');
  const softBreakHtml = parser.parseMarkdownToHtml(softBreakMd);
  const pCount = (softBreakHtml.match(/<p/g) || []).length;
  assert.strictEqual(pCount, 1, `Soft breaks should remain within 1 paragraph, got ${pCount}: ${softBreakHtml}`);
  assert(softBreakHtml.includes('Line one of the paragraph'), 'Missing line one');
  assert(softBreakHtml.includes('Line two of the same paragraph'), 'Missing line two');
  console.log('✓ Soft line breaks do not create independent paragraphs.');

  console.log('\n--- 7. Markdown: Image syntax fallback ---');
  const imageMd = '![alt text](https://example.com/image.png)';
  const imageHtml = parser.parseMarkdownToHtml(imageMd);
  assert(!imageHtml.includes('!<a'), `Accidental !<a ...> rendering detected: ${imageHtml}`);
  assert(!imageHtml.includes('<img'), `Remote image should not be loaded: ${imageHtml}`);
  assert(imageHtml.includes('[Image: alt text]'), `Expected safe fallback [Image: alt text], got: ${imageHtml}`);
  console.log('✓ Image syntax renders safe fallback [Image: alt text].');

  console.log('\n--- 8. Markdown: Smart Heading false positives ---');
  const uppercaseLine = 'NASA AND FBI';
  const falsePositiveHtml = parser.parseMarkdownToHtml(uppercaseLine, true);
  assert(!falsePositiveHtml.includes('<h1') && !falsePositiveHtml.includes('<h2') && !falsePositiveHtml.includes('<h3'),
    `Acronym conjunction line became a heading: ${falsePositiveHtml}`);
  assert(falsePositiveHtml.includes('NASA AND FBI'), 'Content was lost');

  const genuineHeading = [
    '',
    'EXECUTIVE SUMMARY',
    '',
    'This is the body text.'
  ].join('\n');
  const genuineHtml = parser.parseMarkdownToHtml(genuineHeading, true);
  assert(genuineHtml.includes('<h2') && genuineHtml.includes('EXECUTIVE SUMMARY'),
    `Genuine smart heading was not recognized: ${genuineHtml}`);
  console.log('✓ Smart Heading correctly distinguishes false positives from genuine headings.');

  console.log('\n--- 9. Markdown: Semantic heading levels h1 through h6 ---');
  const allHeadingsMd = [
    '# H1',
    '## H2',
    '### H3',
    '#### H4',
    '##### H5',
    '###### H6'
  ].join('\n\n');
  const allHeadingsHtml = parser.parseMarkdownToHtml(allHeadingsMd);
  assert(allHeadingsHtml.includes('<h1'), 'Missing H1');
  assert(allHeadingsHtml.includes('<h2'), 'Missing H2');
  assert(allHeadingsHtml.includes('<h3'), 'Missing H3');
  assert(allHeadingsHtml.includes('<h4'), 'H4 was collapsed or missing');
  assert(allHeadingsHtml.includes('<h5'), 'H5 was collapsed or missing');
  assert(allHeadingsHtml.includes('<h6'), 'H6 was collapsed or missing');
  console.log('✓ Semantic heading levels h1 through h6 preserved.');

  console.log('\n--- 10. Security: Dangerous URL and XSS rejection ---');
  const dangerousUrls = [
    '[XSS 1](javascript:alert(1))',
    '[XSS 2](javascript%3Aalert(1))',
    '[XSS 3](vbscript:msgbox(1))',
    '[XSS 4](data:text/html,<script>alert(1)</script>)',
    '[XSS 5](//evil.com/phish)',
    '[XSS 6](java\0script:alert(1))',
    '[XSS 7](javascript&#58;alert(1))'
  ];
  dangerousUrls.forEach(input => {
    const output = parser.parseMarkdownToHtml(input);
    assert(!output.includes('href="javascript:'), `Dangerous javascript href found in: ${output}`);
    assert(!output.includes('href="vbscript:'), `Dangerous vbscript href found in: ${output}`);
    assert(!output.includes('href="data:'), `Dangerous data href found in: ${output}`);
    assert(!output.includes('href="//'), `Dangerous protocol-relative href found in: ${output}`);
  });

  const rawHtmlInput = '<script>alert(1)</script><img src=x onerror=alert(1)>';
  const sanitizedHtml = parser.parseMarkdownToHtml(rawHtmlInput);
  assert(!sanitizedHtml.includes('<script>'), 'Unescaped script tag found');
  assert(!sanitizedHtml.includes('<img'), 'Unescaped img tag found');
  assert(sanitizedHtml.includes('&lt;script&gt;'), 'Script tag was not escaped');
  console.log('✓ Dangerous URL schemes and raw HTML injections cleanly neutralized.');

  console.log('\n--- 11. Markdown: Task lists, percent-encoded URLs, numeric entities, and anchor links ---');
  const taskListMd = '- [x] Done task\n- [ ] Open task';
  const taskListHtml = parser.parseMarkdownToHtml(taskListMd);
  assert(taskListHtml.includes('<input checked="" disabled="" type="checkbox"> Done task'), `Checked task checkbox missing: ${taskListHtml}`);
  assert(taskListHtml.includes('<input disabled="" type="checkbox"> Open task'), `Unchecked task checkbox missing: ${taskListHtml}`);

  const encodedUrlMd = '[C++ Wiki](https://en.wikipedia.org/wiki/C%2B%2B) and [Space](https://example.com/a%20b?q=1%262)';
  const encodedUrlHtml = parser.parseMarkdownToHtml(encodedUrlMd);
  assert(encodedUrlHtml.includes('href="https://en.wikipedia.org/wiki/C%2B%2B"'), `Percent-encoded URL was double-encoded: ${encodedUrlHtml}`);
  assert(encodedUrlHtml.includes('href="https://example.com/a%20b?q=1%262"'), `Query percent-encoding was corrupted: ${encodedUrlHtml}`);

  withSavedGlobals(['document'], () => {
    delete global.document;
    const entityXssHtml = parser.parseMarkdownToHtml('[XSS](javascript&#58;alert(1)) and [Hex](javascript&#x3a;alert(1))');
    assert(!entityXssHtml.includes('href="javascript:'), `Numeric entity XSS link was not blocked: ${entityXssHtml}`);
  });

  const anchorHtml = parser.parseMarkdownToHtml('[Jump](#section-one)');
  assert(anchorHtml.includes('<a href="#section-one">Jump</a>'), `In-page anchor link should not force target=_blank: ${anchorHtml}`);
  assert(!anchorHtml.includes('target="_blank"'), `In-page anchor link must not open a new tab: ${anchorHtml}`);
  console.log('✓ GFM task lists, percent-encoded URLs, numeric entity checks, and anchor links verified.');

  console.log('\n--- 12. Async State Races: Back during render invalidation ---');
  const mockContext = createAppContext({
    readerContent: { textContent: '', insertAdjacentHTML() {} },
    readerView: { classList: makeClassList() },
    inputView: { classList: makeClassList() },
    backBtn: { classList: makeClassList() },
    toolbar: { classList: makeClassList() },
    sheetBackdrop: { classList: makeClassList() },
    mobileFab: { classList: makeClassList(), setAttribute() {} },
    progressBar: { style: {} },
    pasteArea: { value: '' },
    clearBtn: { style: {} }
  });

  let enterReaderCalled = false;
  const mockUI = {
    showLoader() {},
    hideLoader() {},
    clearStatus() {},
    showStatus() {},
    announceLive() {},
    setContainerFocusable() {}
  };
  const mockTTS = {
    getSession: () => ({ isSpeaking: false, wordMeta: [] }),
    stopTTS() {},
    invalidateTokenization() {},
    tokenize() {}
  };
  const mockParser = {
    enforceExtractedTextLimit: t => t
  };
  const mockSettings = () => ({
    resetSettingsSections() {}
  });

  const reader = createReader(mockContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTS,
    getSettings: mockSettings
  });

  const initialRenderId = mockContext.runtime.reader.activeRenderId;
  reader.renderTextAsync('Some document text', () => {
    enterReaderCalled = true;
  });

  reader.goBack();
  assert(
    mockContext.runtime.reader.activeRenderId > initialRenderId,
    'goBack must increment activeRenderId to cancel pending render'
  );

  await new Promise(resolve => setTimeout(resolve, 80));
  assert.strictEqual(enterReaderCalled, false, 'enterReader must NOT be called by stale render after goBack()');
  console.log('✓ Back during render invalidates active render and prevents enterReader().');

  console.log('\n--- 13. TTS: Multi-chunk progression with synthetic engine ---');
  class FakeUtterance {
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
  class ChainingFakeSynth {
    constructor() {
      this.history = [];
      this.speaking = false;
    }
    speak(utterance) {
      this.speaking = true;
      this.history.push(utterance.text);
      process.nextTick(() => {
        if (utterance.onstart) utterance.onstart();
        if (utterance.onboundary) utterance.onboundary({ name: 'word', charIndex: 0 });
        process.nextTick(() => {
          if (utterance.onend) utterance.onend();
        });
      });
    }
    cancel() {
      this.speaking = false;
    }
  }

  await withSavedGlobals(['SpeechSynthesisUtterance'], async () => {
    global.SpeechSynthesisUtterance = FakeUtterance;
    const multiChunkContext = createAppContext({
      voiceRateInput: { value: '1.0' },
      readerContent: { querySelectorAll: () => [], contains: () => true }
    });
    const chainingSynth = new ChainingFakeSynth();
    multiChunkContext.runtime.tts.supported = true;
    multiChunkContext.runtime.tts.synth = chainingSynth;
    const sentenceA = 'First sentence of speech that is long enough to exceed the chunk target in our reader app. ';
    const sentenceB = 'Second sentence of speech that continues the narration across multiple speech chunks. ';
    const sentenceC = 'Third sentence of speech completing the multi-chunk playback progression test cleanly.';
    multiChunkContext.runtime.tts.fullSpokenText = sentenceA + sentenceB + sentenceC;
    multiChunkContext.runtime.tts.wordMeta = [
      { index: 0, text: 'First', start: 0, end: 5 },
      { index: 1, text: 'Second', start: sentenceA.length, end: sentenceA.length + 6 }
    ];
    multiChunkContext.runtime.tts.wordSpans = [
      { classList: makeClassList(), scrollIntoView() {} },
      { classList: makeClassList(), scrollIntoView() {} }
    ];
    const ttsEngine = tts.createTTS(multiChunkContext, { ui: mockUI });
    ttsEngine.restartFromWord(0);
    assert.strictEqual(multiChunkContext.runtime.tts.state, 'playing');
    await new Promise(resolve => setTimeout(resolve, 80));
    assert(chainingSynth.history.length >= 2, `Expected multi-chunk chaining, spoke ${chainingSynth.history.length} chunks`);
    ttsEngine.stopTTS();
  });
  console.log('✓ TTS multi-chunk progression chained successfully.');

  console.log('\n--- 14. TTS: Capability-based Mobile Detection ---');
  assert.strictEqual(typeof utils.isMobileDevice, 'function', 'isMobileDevice utility should be exported');
  assert.strictEqual(utils.isMobileDevice(), false, 'Headless Node should not be detected as mobile');
  console.log('✓ Capability-based mobile detection verified.');

  console.log('\n--- 15. Markdown: Unique Heading IDs for multiple headings in block ---');
  const multiHeadings = '# First Heading\n\n## Second Heading';
  const multiHeadingsHtml = parser.parseMarkdownToHtml(multiHeadings);
  const idMatches = multiHeadingsHtml.match(/id="([^"]+)"/g);
  assert(idMatches && idMatches.length >= 2, `Expected at least 2 IDs, got: ${idMatches}`);
  assert.notStrictEqual(idMatches[0], idMatches[1], `Heading IDs collided: ${idMatches[0]} === ${idMatches[1]}`);
  console.log('✓ Heading IDs within parsed document are distinct.');

  console.log('\n--- 18. TTS: Tokenization invalidation on rerender / setting change ---');
  const ttsInvalidateContext = createAppContext({
    readerContent: { textContent: '', querySelectorAll: () => [], insertAdjacentHTML() {} }
  });
  const ttsEngine2 = tts.createTTS(ttsInvalidateContext, { ui: mockUI });
  ttsInvalidateContext.runtime.tts.wordMeta = [{ index: 0, text: 'old', start: 0, end: 3 }];
  ttsInvalidateContext.runtime.tts.wordSpans = [{ classList: makeClassList() }];
  ttsInvalidateContext.runtime.tts.fullSpokenText = 'old';
  ttsEngine2.invalidateTokenization();
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordMeta.length, 0, 'wordMeta must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordSpans.length, 0, 'wordSpans must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.fullSpokenText, '', 'fullSpokenText must be cleared');
  console.log('✓ TTS tokenization cache cleanly invalidated to prevent stale word highlights.');

  console.log('\n--- 19. DOM Tokenization: h4-h6 block boundary & safe NodeFilter ---');
  const mockDoc19 = new MockDocument();
  const mockContainer = mockDoc19.createElement('div');
  const h4 = mockDoc19.createElement('h4');
  const h4Text = mockDoc19.createTextNode('Subheading Level 4');
  h4.appendChild(h4Text);
  mockContainer.appendChild(h4);
  const p = mockDoc19.createElement('p');
  const pText = mockDoc19.createTextNode('Paragraph text directly beneath h4.');
  p.appendChild(pText);
  mockContainer.appendChild(p);

  withSavedGlobals(['NodeFilter'], () => {
    delete global.NodeFilter;
    const tokRes = tts.tokenizeReaderDOM(mockContainer, mockDoc19);
    assert(tokRes.text.includes('Subheading Level 4\n\nParagraph text'), `h4 must be separated by \\n\\n from paragraph, got: ${JSON.stringify(tokRes.text)}`);
  });
  console.log('✓ h4-h6 block boundaries preserved and missing global NodeFilter handled safely.');

  console.log('\n--- 20. Mobile Settings Sheet: Dialog semantics & focus trap ---');
  let toolbarAttrs = {};
  const mockToolbar = {
    classList: makeClassList(['expanded']),
    setAttribute(k, v) { toolbarAttrs[k] = v; },
    removeAttribute(k) { delete toolbarAttrs[k]; },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const sheetContext = createAppContext({
    toolbar: mockToolbar,
    sheetBackdrop: { classList: makeClassList() },
    mobileFab: { classList: makeClassList(), setAttribute() {}, focus() {} }
  });
  const sheetReader = createReader(sheetContext, {
    ui: mockUI,
    parser: mockParser,
    tts: mockTTS,
    getSettings: mockSettings
  });
  sheetReader.expandMobileSheet();
  assert.strictEqual(toolbarAttrs.role, 'dialog', 'Expanded sheet must have role="dialog"');
  assert.strictEqual(toolbarAttrs['aria-modal'], 'true', 'Expanded sheet must have aria-modal="true"');
  assert.strictEqual(toolbarAttrs['aria-label'], 'Reading Settings', 'Expanded sheet must have aria-label');
  sheetReader.collapseMobileSheet();
  assert.strictEqual(toolbarAttrs.role, undefined, 'Collapsed sheet must remove role');
  assert.strictEqual(toolbarAttrs['aria-modal'], undefined, 'Collapsed sheet must remove aria-modal');
  console.log('✓ Mobile settings sheet conforms to dialog accessibility semantics.');

  console.log('\n--- 21. Typography: Honest system stacks in presets ---');
  assert(constants.VALID_FONTS.has('serif'), 'VALID_FONTS must include serif');
  assert(constants.VALID_FONTS.has('sans'), 'VALID_FONTS must include sans');
  assert(constants.VALID_FONTS.has('mono'), 'VALID_FONTS must include mono');
  constants.lightPresets.forEach(preset => {
    assert(['sans', 'serif', 'mono', 'system'].includes(preset.font), `Preset ${preset.name} has non-honest font stack: ${preset.font}`);
  });
  constants.darkPresets.forEach(preset => {
    assert(['sans', 'serif', 'mono', 'system'].includes(preset.font), `Preset ${preset.name} has non-honest font stack: ${preset.font}`);
  });
  console.log('✓ All preset fonts map honestly to system font stacks (sans, serif, mono).');

  console.log('\n--- 24. TTS: Click-to-speak safeguards (idle, selection, links, active/open listen) ---');
  withSavedGlobals(['window', 'document'], () => {
    let clickHandler = null;
    const listenSectionEl = {
      getAttribute: attr => (attr === 'data-settings-section' ? 'listen' : null),
      classList: makeClassList()
    };
    const mockReaderContent = {
      addEventListener(evt, fn) {
        if (evt === 'click') clickHandler = fn;
      },
      removeEventListener() {},
      contains() { return true; },
      querySelectorAll() { return []; }
    };
    const clickContext = createAppContext({
      readerContent: mockReaderContent,
      voiceRateInput: { value: '1.0' },
      settingsSections: [listenSectionEl]
    });
    let tokenizedCount = 0;
    let startedSpeechAt = null;
    const mockTTSController = {
      getSession: () => clickContext.runtime.tts,
      tokenize() {
        tokenizedCount += 1;
        clickContext.runtime.tts.wordMeta = [{ index: 0, text: 'hello', start: 0, end: 5 }];
      },
      startSpeech(idx) {
        startedSpeechAt = idx;
      },
      stopTTS() {}
    };
    const readerInstance = createReader(clickContext, {
      ui: mockUI,
      parser: mockParser,
      tts: mockTTSController,
      getSettings: mockSettings
    });
    readerInstance.bindEvents();
    assert(typeof clickHandler === 'function', 'Click handler should be attached');

    const wordSpan = {
      closest: sel => (sel === '.tts-word' ? wordSpan : null),
      hasAttribute: attr => attr === 'data-word-idx',
      getAttribute: attr => (attr === 'data-word-idx' ? '0' : null)
    };
    global.window = {
      getSelection: () => ({ isCollapsed: true, toString: () => '' })
    };
    global.document = {
      elementFromPoint: () => wordSpan
    };

    // Case 1: TTS unsupported -> do not tokenize
    clickContext.runtime.tts.supported = false;
    clickHandler({ target: wordSpan, clientX: 100, clientY: 200 });
    assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when TTS is unsupported');

    // Case 2: TTS supported, idle and listen section closed -> do NOT start surprise speech
    clickContext.runtime.tts.supported = true;
    clickHandler({ target: wordSpan, clientX: 100, clientY: 200 });
    assert.strictEqual(tokenizedCount, 0, 'Should not tokenize or start speech when TTS is idle and Speech section is closed');
    assert.strictEqual(startedSpeechAt, null, 'Idle reading click must not trigger speech');

    // Case 3: Listen section open, but user has active text selection -> do not tokenize
    listenSectionEl.classList.add('is-open');
    global.window.getSelection = () => ({ isCollapsed: false, toString: () => 'selected text' });
    clickHandler({ target: { closest: () => null } });
    assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when text is selected');

    // Case 4: Listen section open, target is a link -> do not tokenize
    global.window.getSelection = () => ({ isCollapsed: true, toString: () => '' });
    clickHandler({ target: { closest: sel => (sel.includes('a') ? {} : null) } });
    assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when clicking a link');

    // Case 5: Listen section open, valid click on text -> tokenizes and starts speech
    clickHandler({ target: { closest: () => null }, clientX: 100, clientY: 200 });
    assert.strictEqual(tokenizedCount, 1, 'Should tokenize on valid word click when Speech section is open');
    assert.strictEqual(startedSpeechAt, 0, 'Should start speech at word index 0');

    // Case 6: Listen section closed, TTS actively speaking -> clicking word jumps to it
    listenSectionEl.classList.remove('is-open');
    clickContext.runtime.tts.isSpeaking = true;
    startedSpeechAt = null;
    clickHandler({ target: wordSpan, clientX: 100, clientY: 200 });
    assert.strictEqual(startedSpeechAt, 0, 'Clicking a word while TTS is active should jump speech');
  });
  console.log('✓ Reader click handler safely guards silent reading and speaks when TTS is armed or active.');

  console.log('\n--- 26. Markdown: Multi-line ALL-CAPS paragraph does not collapse into single heading with newline (F-08) ---');
  const multiLineAllCaps = 'CHAPTER ONE\nTHE BEGINNING';
  const multiLineHtml = parser.parseMarkdownToHtml(multiLineAllCaps, true);
  assert(!multiLineHtml.includes('\n</h2>') && !multiLineHtml.includes('CHAPTER ONE\nTHE BEGINNING</h2>'), 'Multi-line shouted paragraph should not become a single heading with a newline');
  assert(!multiLineHtml.match(/<h[1-6][^>]*>[^<]*\n[^<]*<\/h[1-6]>/), 'Headings must never contain raw newlines');
  assert(multiLineHtml.includes('<p>') && multiLineHtml.includes('CHAPTER ONE') && multiLineHtml.includes('THE BEGINNING'), 'Multi-line text should remain in a paragraph');

  const separateHeadings = 'CHAPTER ONE\n\nTHE BEGINNING';
  const separateHtml = parser.parseMarkdownToHtml(separateHeadings, true);
  const h2Count = (separateHtml.match(/<h2/g) || []).length;
  assert.strictEqual(h2Count, 2, `Expected 2 headings when separated by blank lines, got ${h2Count}: ${separateHtml}`);
  console.log('✓ Multi-line ALL-CAPS paragraph renders in <p> without collapsed raw newline heading.');

  console.log('\n--- 27. DOM Cleanup: goBack clears reader DOM (F-14) ---');
  const backTestContent = { textContent: 'Previously rendered document DOM' };
  const backContext = createAppContext({
    readerContent: backTestContent,
    readerView: { classList: makeClassList() },
    inputView: { classList: makeClassList() },
    backBtn: { classList: makeClassList() },
    toolbar: { classList: makeClassList() }
  });
  const backReader = createReader(backContext, {
    ui: mockUI,
    parser,
    tts: mockTTS,
    getSettings: mockSettings
  });
  backReader.goBack();
  assert.strictEqual(backTestContent.textContent, '', 'readerContent should be emptied when pressing Back');
  console.log('✓ goBack properly frees memory by clearing readerContent.');

  console.log('\n--- 28. Markdown: CommonMark fidelity (F-07) ---');
  const looseListHtml = parser.parseMarkdownToHtml('- a\n\n- b');
  const ulMatches = looseListHtml.match(/<ul/g) || [];
  assert.strictEqual(ulMatches.length, 1, `Expected exactly 1 <ul> for loose list, got ${ulMatches.length}`);
  assert(looseListHtml.includes('<li>') && looseListHtml.includes('a') && looseListHtml.includes('b'));

  const setextHtml = parser.parseMarkdownToHtml('Title\n---');
  assert(setextHtml.includes('<h2') && setextHtml.includes('Title</h2>'), `Expected <h2> for setext heading, got: ${setextHtml}`);
  assert(!setextHtml.includes('<hr>'), 'Setext heading must not be split into an <hr>');

  const tildeFenceHtml = parser.parseMarkdownToHtml('~~~\nfirst line\n\nsecond line\n~~~');
  const preMatches = tildeFenceHtml.match(/<pre>/g) || [];
  assert.strictEqual(preMatches.length, 1, `Expected 1 <pre> block for tilde fence with blank line, got ${preMatches.length}`);
  assert(tildeFenceHtml.includes('first line\n\nsecond line'), 'Fence content with blank line must be preserved intact');

  const indentedCodeInList = '- item 1\n\n    ```\n    indented code\n    ```';
  const listCodeHtml = parser.parseMarkdownToHtml(indentedCodeInList);
  assert(listCodeHtml.includes('<ul>') && listCodeHtml.includes('<li>') && listCodeHtml.includes('<code>indented code'), `Expected indented code inside list item, got: ${listCodeHtml}`);

  const tableMd = '| Head A | Head B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n\nFollowing paragraph text.';
  const tableHtml = parser.parseMarkdownToHtml(tableMd);
  assert(tableHtml.includes('<table>') && tableHtml.includes('Cell 1') && tableHtml.includes('<p>Following paragraph text.</p>'), `Table and paragraph should parse correctly: ${tableHtml}`);

  const lazyQuoteMd = '> line 1\nlazy continuation line 2';
  const lazyQuoteHtml = parser.parseMarkdownToHtml(lazyQuoteMd);
  const quoteCount = (lazyQuoteHtml.match(/<blockquote>/g) || []).length;
  assert.strictEqual(quoteCount, 1, `Expected 1 blockquote, got ${quoteCount}`);
  assert(lazyQuoteHtml.includes('line 1\nlazy continuation line 2') || (lazyQuoteHtml.includes('line 1') && lazyQuoteHtml.includes('lazy continuation line 2')), `Lazy continuation lines should belong to blockquote: ${lazyQuoteHtml}`);
  console.log('✓ CommonMark fidelity preserved across loose lists, setext headings, tilde fences, nested code, tables, and blockquotes.');

  console.log('\n--- 31. Settings: Desktop mouse drag theme guard (F-20) ---');
  withSavedGlobals(['window', 'navigator'], () => {
    const registeredEvents = [];
    const gestureEl = {
      addEventListener(evt) {
        registeredEvents.push(evt);
      },
      removeEventListener() {}
    };
    const origTouchPoints = global.navigator?.maxTouchPoints;
    const origUserAgent = global.navigator?.userAgent;
    try {
      Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
      Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true, writable: true });
      global.window = {
        addEventListener() {},
        removeEventListener() {}
      };

      const desktopSettingsContext = createAppContext({
        presetTrack: { classList: makeClassList() },
        lineHeightInput: { value: '1.85' },
        letterSpacingInput: { value: '0' },
        readerView: gestureEl
      });
      const desktopSettings = createSettings(desktopSettingsContext, {
        onResetToolbarTimer() {},
        isMobileSheetLayout: () => false
      });
      desktopSettings.attachGestureArea(gestureEl);

      assert(!registeredEvents.includes('mousedown'), 'Desktop should not attach mousedown listener for preset gesture');
      assert(!registeredEvents.includes('mouseup'), 'Desktop should not attach mouseup listener for preset gesture');
      assert(registeredEvents.includes('touchstart'), 'Touch listener should still be attached');

      registeredEvents.length = 0;
      Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 5, configurable: true, writable: true });
      const mobileSettings = createSettings(desktopSettingsContext, {
        onResetToolbarTimer() {},
        isMobileSheetLayout: () => true
      });
      mobileSettings.attachGestureArea(gestureEl);
      assert(registeredEvents.includes('mousedown'), 'Mobile should attach mousedown listener for preset gesture');
    } finally {
      if (global.navigator) {
        Object.defineProperty(global.navigator, 'maxTouchPoints', { value: origTouchPoints, configurable: true, writable: true });
        Object.defineProperty(global.navigator, 'userAgent', { value: origUserAgent, configurable: true, writable: true });
      }
    }
  });
  console.log('✓ Desktop mouse drag preset handler safely guarded against accidental theme switching.');

  console.log('\n--- 34. PWA: sw.js precache excludes heavy PDF.js bundles (F-19) ---');
  const swCode = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert(!swCode.includes("'./vendor/pdf.min.mjs'"), 'sw.js APP_SHELL must not precache vendor/pdf.min.mjs');
  assert(!swCode.includes("'./vendor/pdf.worker.min.mjs'"), 'sw.js APP_SHELL must not precache vendor/pdf.worker.min.mjs');
  assert(!swCode.includes("'./vendor/pdf.min.js'"), 'sw.js APP_SHELL must not precache vendor/pdf.min.js');
  assert(!swCode.includes("'./vendor/pdf.worker.min.js'"), 'sw.js APP_SHELL must not precache vendor/pdf.worker.min.js');
  assert(swCode.includes('staleWhileRevalidate'), 'sw.js must provide stale-while-revalidate runtime caching for vendor assets');
  console.log('✓ sw.js APP_SHELL precache excludes heavy PDF.js bundles.');

  console.log('\n--- 35. TTS: Fallback estimate timer execution with startingChunkIndex (F-06) ---');
  await withSavedGlobals(['SpeechSynthesisUtterance'], async () => {
    global.SpeechSynthesisUtterance = FakeUtterance;
    const timerContext = createAppContext({
      voiceRateInput: { value: '1.0' },
      readerContent: { querySelectorAll: () => [], contains: () => true }
    });
    timerContext.runtime.tts.supported = true;
    let uttered = null;
    timerContext.runtime.tts.synth = {
      speak(u) { uttered = u; },
      cancel() {},
      pause() {},
      resume() {}
    };
    timerContext.runtime.tts.wordMeta = [
      { start: 0, end: 5, index: 0 },
      { start: 6, end: 11, index: 1 }
    ];
    timerContext.runtime.tts.wordSpans = [
      { classList: makeClassList(), scrollIntoView() {} },
      { classList: makeClassList(), scrollIntoView() {} }
    ];
    timerContext.runtime.tts.fullSpokenText = 'hello world';
    const estimateTTS = tts.createTTS(timerContext, { ui: mockUI });
    estimateTTS.startSpeech(0);
    assert(uttered, 'Utterance must be dispatched');
    uttered.onstart();
    await new Promise(r => setTimeout(r, 120));
    assert.strictEqual(timerContext.runtime.tts.state, 'playing');
    estimateTTS.stopTTS();
  });
  console.log('✓ TTS startEstimateTimer runs without ReferenceError on startingChunkIndex.');

  console.log('\n--- 36. Presets: Swipe gesture transitions seamlessly between light and dark modes (F-22) ---');
  const swipeContext = createAppContext({
    presetWindow: { getBoundingClientRect: () => ({ width: 300 }), setAttribute() {} },
    presetTrack: { classList: makeClassList(), querySelectorAll: () => [], style: {} },
    presetDots: { querySelectorAll: () => [] },
    themeSettingsSummary: { textContent: '' },
    gestureHint: { classList: makeClassList() },
    gestureHintText: { textContent: '' },
    modeLight: { classList: makeClassList(), setAttribute() {} },
    modeDark: { classList: makeClassList(), setAttribute() {} },
    readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList() }
  });
  const swipeSettings = createSettings(swipeContext, {
    onResetToolbarTimer: () => {},
    isMobileSheetLayout: () => false
  });
  swipeSettings.setMode('light', { presetIndex: 9 });
  assert.strictEqual(swipeContext.state.currentMode, 'light');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 9);
  assert.strictEqual(constants.lightPresets[9].name, 'Lavender');

  swipeSettings.nextPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'dark', 'Swiping next from last light preset must transition to dark mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 0, 'Swiping next from last light preset must start at index 0');
  assert.strictEqual(constants.darkPresets[0].name, 'Night');

  swipeSettings.prevPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'light', 'Swiping prev from first dark preset must transition back to light mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 9, 'Swiping prev from first dark preset must land on last light preset');

  swipeSettings.setMode('light', { presetIndex: 0 });
  swipeSettings.prevPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'dark', 'Swiping prev from first light preset must transition to dark mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, constants.darkPresets.length - 1, 'Swiping prev from first light preset must land on last dark preset');

  swipeSettings.nextPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'light', 'Swiping next from last dark preset must transition to light mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 0);
  console.log('✓ Preset swipe gestures seamlessly cycle through all presets across light and dark modes.');

  console.log('\n--- 37. Gestures: Control boundaries protected from accidental swipe gestures ---');
  const makeNodeWithClosest = tagOrId => ({
    nodeType: 1,
    closest(selector) {
      const parts = selector.split(',').map(s => s.trim().toLowerCase());
      return parts.some(p => p === tagOrId.toLowerCase()) ? this : null;
    }
  });
  const carouselInstance = createPresetCarousel(swipeContext, {
    getPresets: () => constants.lightPresets,
    applyPreset: () => {}
  });
  assert.strictEqual(carouselInstance.isBlockedGestureTarget(makeNodeWithClosest('#toolbar')), true, '#toolbar must be blocked');
  assert.strictEqual(carouselInstance.isBlockedGestureTarget(makeNodeWithClosest('.audio-player-bar')), true, '.audio-player-bar must be blocked');
  assert.strictEqual(carouselInstance.isBlockedGestureTarget(makeNodeWithClosest('#backBtn')), true, '#backBtn must be blocked');
  assert.strictEqual(carouselInstance.isBlockedGestureTarget(makeNodeWithClosest('button')), true, 'button must be blocked');
  assert.strictEqual(carouselInstance.isBlockedGestureTarget(makeNodeWithClosest('p')), false, 'paragraph text must not be blocked');
  console.log('✓ Controls, back button, audio player, and toolbar are protected against gesture interception.');

  console.log('\n--- 38. Gestures: Touch coordinate resolution with clientX/screenX fallback ---');
  const touchCarousel = createPresetCarousel(swipeContext, {
    getPresets: () => constants.lightPresets,
    applyPreset: () => {},
    setMode: () => {}
  });
  const registeredTouchListeners = {};
  const mockGestureTarget = {
    addEventListener(type, cb) {
      registeredTouchListeners[type] = cb;
    }
  };
  touchCarousel.attachGestureArea(mockGestureTarget);
  assert(registeredTouchListeners.touchstart, 'touchstart must be registered');
  assert(registeredTouchListeners.touchend, 'touchend must be registered');

  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  registeredTouchListeners.touchend({
    changedTouches: [{ clientX: 30, clientY: 52 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.currentPresetIndex, 1, 'Valid horizontal clientX swipe must advance preset');

  registeredTouchListeners.touchstart({
    touches: [{ screenX: 100, screenY: 50 }],
    target: makeNodeWithClosest('p')
  });
  registeredTouchListeners.touchend({
    changedTouches: [{ screenX: 180, screenY: 52 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.currentPresetIndex, 0, 'Valid horizontal screenX swipe right must return to prev preset');

  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.isGesture, true, 'isGesture must be true after single touchstart');
  registeredTouchListeners.touchmove({
    touches: [{ clientX: 120, clientY: 50 }, { clientX: 200, clientY: 50 }]
  });
  assert.strictEqual(swipeContext.state.isGesture, false, 'Multi-touch touchmove must cancel isGesture');

  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.isGesture, true, 'isGesture must be true after touchstart');
  registeredTouchListeners.touchcancel();
  assert.strictEqual(swipeContext.state.isGesture, false, 'touchcancel must reset isGesture');
  console.log('✓ Touch coordinate resolution with clientX/screenX fallback verified.');

  console.log('\n--- 39. Presets: Carousel drag start and card click selection on presetWindow ---');
  withSavedGlobals(['window', 'document'], () => {
    let currentAriaLabel = '';
    const testPresetWindowListeners = {};
    const testWindowListeners = {};
    global.window = {
      addEventListener: (t, cb) => { testWindowListeners[t] = cb; },
      removeEventListener: () => {},
      getSelection: () => null,
      requestAnimationFrame: () => {}
    };
    global.document = {
      addEventListener: () => {},
      querySelectorAll: () => []
    };
    const testPresetWindow = {
      nodeType: 1,
      addEventListener: (t, cb) => { testPresetWindowListeners[t] = cb; },
      getAttribute: attr => (attr === 'aria-label' ? currentAriaLabel : null),
      setAttribute: (attr, val) => { if (attr === 'aria-label') currentAriaLabel = val; },
      getBoundingClientRect: () => ({ width: 300 }),
      closest: sel => (sel.includes('#toolbar') ? { id: 'toolbar' } : null)
    };
    const testCarouselContext = createAppContext({
      presetWindow: testPresetWindow,
      presetTrack: { classList: makeClassList(), querySelectorAll: () => [], style: {} },
      presetDots: { innerHTML: '', querySelectorAll: () => [] },
      themeSettingsSummary: { textContent: '' },
      gestureHint: { classList: makeClassList() },
      gestureHintText: { textContent: '' },
      modeLight: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      modeDark: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList(), addEventListener() {} }
    });
    const testCarouselSettings = createSettings(testCarouselContext, {
      onResetToolbarTimer: () => {},
      isMobileSheetLayout: () => false
    });
    testCarouselSettings.bindEvents();

    testPresetWindowListeners.mousedown({ clientX: 200, target: testPresetWindow });
    assert.strictEqual(testCarouselContext.state.isDraggingCarousel, true, 'mousedown on presetWindow must start carousel drag');
    testWindowListeners.mousemove({ clientX: 100 });
    testWindowListeners.mouseup();
    assert.strictEqual(testCarouselContext.state.isDraggingCarousel, false);
    assert(testCarouselContext.state.lastCarouselDragDistance > 5, 'lastCarouselDragDistance must reflect drag distance');

    const mockCard1 = {
      nodeType: 1,
      closest: sel => (sel === '.preset-card' ? mockCard1 : (sel.includes('#toolbar') ? { id: 'toolbar' } : null)),
      getAttribute: attr => (attr === 'data-index' ? '1' : null)
    };
    testPresetWindowListeners.click({ target: mockCard1 });
    assert.strictEqual(testCarouselContext.state.lastCarouselDragDistance, 0, 'click suppression must reset lastCarouselDragDistance');

    const mockCard2 = {
      nodeType: 1,
      closest: sel => (sel === '.preset-card' ? mockCard2 : (sel.includes('#toolbar') ? { id: 'toolbar' } : null)),
      getAttribute: attr => (attr === 'data-index' ? '2' : null)
    };
    testPresetWindowListeners.click({ target: mockCard2 });
    assert.strictEqual(testCarouselContext.state.currentPresetIndex, 2, 'clicking preset card must apply preset index 2');
    assert(currentAriaLabel.includes('Stark'), 'aria-label must update to Stark');
  });
  console.log('✓ Preset carousel drag and card click selection verified on presetWindow.');

  console.log('\n--- 40. DOM Tokenization: Preserves inter-word and trailing whitespace in DOM textContent ---');
  withSavedGlobals(['NodeFilter'], () => {
    global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
    const tokDoc = new MockDocument();
    const tokH1 = tokDoc.createElement('h1');
    tokH1.appendChild(tokDoc.createTextNode('Smoke Test'));
    const tokP = tokDoc.createElement('p');
    tokP.appendChild(tokDoc.createTextNode('Reader Webapp renders '));
    const tokStrong = tokDoc.createElement('strong');
    tokStrong.appendChild(tokDoc.createTextNode('Markdown'));
    tokP.appendChild(tokStrong);
    tokP.appendChild(tokDoc.createTextNode(' text in browser smoke checks.'));
    const tokContainer = tokDoc.createElement('div');
    tokContainer.appendChild(tokH1);
    tokContainer.appendChild(tokP);

    const tokResult = tts.tokenizeReaderDOM(tokContainer, tokDoc);
    assert(tokContainer.textContent.includes('Smoke Test'), `DOM textContent must preserve spaces between words, got: ${tokContainer.textContent}`);
    assert(tokContainer.textContent.includes('Reader Webapp renders Markdown text in browser smoke checks.'), `DOM textContent must preserve spaces around formatted spans, got: ${tokContainer.textContent}`);
    assert.strictEqual(tokResult.spans.length, 11, `Expected 11 word spans, got: ${tokResult.spans.length}`);
    assert(tokResult.spans.every(span => span.hasAttribute('data-word-idx')), 'All word spans must have data-word-idx');
  });
  console.log('✓ Preserved inter-word and trailing whitespace in DOM textContent after tokenization.');

  console.log('\n--- 41. Presets: Themes control reader colors without inline color overrides ---');
  let inlineColorAssigned = false;
  const presetColorContext = createAppContext({
    presetTrack: { classList: makeClassList(), style: {}, querySelectorAll: () => [] },
    presetWindow: { setAttribute() {} },
    themeSettingsSummary: { textContent: '' },
    readerContent: {
      classList: makeClassList(),
      style: {
        setProperty(name) { if (name === '--reader-text-color') inlineColorAssigned = true; },
        removeProperty() {}
      }
    }
  });
  const presetColorSettings = createSettings(presetColorContext, {
    onResetToolbarTimer() {},
    isMobileSheetLayout: () => false
  });
  [...constants.lightPresets, ...constants.darkPresets].forEach(preset => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(preset, 'color'), false, `Preset ${preset.name} must not define redundant color property`);
  });
  presetColorSettings.setMode('light', { presetIndex: 0, resetTimer: false });
  presetColorSettings.setMode('dark', { presetIndex: 0, resetTimer: false });
  assert.strictEqual(inlineColorAssigned, false, 'Presets must not override CSS theme --reader-text-color inline');
  console.log('✓ All light and dark presets preserve CSS theme text colors.');

  console.log('\n--- 42. Carousel: Right-click and touchcancel do not stick drag loop ---');
  withSavedGlobals(['window', 'document'], () => {
    const dragGuardListeners = {};
    const dragGuardWindow = {
      nodeType: 1,
      addEventListener: (t, cb) => { dragGuardListeners[t] = cb; },
      getAttribute: () => '',
      setAttribute: () => {},
      getBoundingClientRect: () => ({ width: 300 }),
      closest: () => null
    };
    global.window = {
      addEventListener() {},
      removeEventListener() {},
      getSelection: () => null,
      requestAnimationFrame: () => {}
    };
    global.document = {
      addEventListener() {},
      querySelectorAll: () => []
    };
    const dragGuardContext = createAppContext({
      presetWindow: dragGuardWindow,
      presetTrack: { classList: makeClassList(), querySelectorAll: () => [], style: {} },
      presetDots: { innerHTML: '', querySelectorAll: () => [] },
      themeSettingsSummary: { textContent: '' },
      modeLight: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      modeDark: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList(), addEventListener() {} }
    });
    const dragGuardSettings = createSettings(dragGuardContext, {
      onResetToolbarTimer: () => {},
      isMobileSheetLayout: () => false
    });
    dragGuardSettings.bindEvents();
    dragGuardListeners.mousedown({ button: 2, clientX: 150, target: dragGuardWindow });
    assert.strictEqual(dragGuardContext.state.isDraggingCarousel, false, 'Right-click must not start carousel drag');
    dragGuardListeners.touchstart({ touches: [{ clientX: 150 }], target: dragGuardWindow });
    assert.strictEqual(dragGuardContext.state.isDraggingCarousel, true, 'Touch start should begin carousel drag');
    dragGuardListeners.touchcancel();
    assert.strictEqual(dragGuardContext.state.isDraggingCarousel, false, 'touchcancel must end carousel drag');
  });
  console.log('✓ Carousel drag ignores non-primary mouse buttons and cleans up on touchcancel.');

  console.log('\n--- 43. TTS: Short desktop resume estimate timer, paused settings changes, and external cancel ---');
  await withSavedGlobals(['SpeechSynthesisUtterance'], async () => {
    global.SpeechSynthesisUtterance = FakeUtterance;
    const ttsFixSpans = [
      { classList: makeClassList(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) },
      { classList: makeClassList(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) },
      { classList: makeClassList(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) }
    ];
    let ttsFixUtterance = null;
    const ttsFixSynth = {
      speakCalls: 0,
      cancelCalls: 0,
      resumeCalls: 0,
      speak(u) {
        this.speakCalls += 1;
        ttsFixUtterance = u;
      },
      pause() {},
      resume() { this.resumeCalls += 1; },
      cancel() { this.cancelCalls += 1; },
      getVoices() { return []; }
    };
    const ttsFixRateInput = { value: '1.0', addEventListener() {} };
    const ttsFixContext = createAppContext({
      readerContent: { classList: makeClassList(), querySelectorAll: () => [], contains: () => true },
      voiceRateInput: ttsFixRateInput,
      voiceRateVal: { textContent: '1.0x' },
      audioSpeedBtn: { textContent: '1.0x', addEventListener() {} }
    });
    ttsFixContext.runtime.tts.supported = true;
    ttsFixContext.runtime.tts.isMobile = false;
    ttsFixContext.runtime.tts.synth = ttsFixSynth;
    ttsFixContext.runtime.tts.wordMeta = [
      { index: 0, text: 'Alpha', start: 0, end: 5, element: ttsFixSpans[0] },
      { index: 1, text: 'Beta', start: 6, end: 10, element: ttsFixSpans[1] },
      { index: 2, text: 'Gamma', start: 11, end: 16, element: ttsFixSpans[2] }
    ];
    ttsFixContext.runtime.tts.wordSpans = ttsFixSpans;
    ttsFixContext.runtime.tts.fullSpokenText = 'Alpha Beta Gamma';
    const ttsFixController = tts.createTTS(ttsFixContext, { ui: mockUI });
    ttsFixController.startSpeech(0);
    assert(ttsFixUtterance, 'Initial utterance should be created');
    ttsFixUtterance.onstart();
    assert(ttsFixContext.runtime.tts.estimateTimer, 'Estimate timer should start when no boundary fired');
    ttsFixController.pauseSpeech();
    assert.strictEqual(ttsFixContext.runtime.tts.estimateTimer, null, 'Pause must clear estimate timer');
    ttsFixController.resumeSpeech();
    assert(ttsFixContext.runtime.tts.estimateTimer, 'Short desktop resume without boundary events must restart estimate timer');

    ttsFixController.pauseSpeech();
    const speaksBeforeSpeedChange = ttsFixSynth.speakCalls;
    ttsFixController.cycleVoiceSpeed();
    assert.strictEqual(ttsFixContext.runtime.tts.visibilityInterrupted, true, 'Speed change while paused must mark utterance dirty');
    ttsFixController.resumeSpeech();
    assert.strictEqual(ttsFixSynth.speakCalls, speaksBeforeSpeedChange + 1, 'Resuming after speed change while paused must restart utterance');

    ttsFixContext.runtime.tts.chunks = [
      { text: 'Chunk one.', start: 0, end: 10 },
      { text: 'Chunk two.', start: 11, end: 21 }
    ];
    ttsFixContext.runtime.tts.chunkIndex = 0;
    const speaksBeforeCancelError = ttsFixSynth.speakCalls;
    ttsFixUtterance.onerror({ error: 'canceled' });
    assert.strictEqual(ttsFixContext.runtime.tts.state, 'idle', 'External canceled error should stop playback cleanly');
    assert.strictEqual(ttsFixSynth.speakCalls, speaksBeforeCancelError, 'External canceled error must not skip ahead to next chunk');
  });
  console.log('✓ TTS desktop resume estimate timer, paused setting updates, and external cancel behavior verified.');

  console.log('\n--- 44. DOM Tokenization: Idempotency, table cell breaks, and trailing punctuation ---');
  withSavedGlobals(['NodeFilter'], () => {
    global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
    const richDoc = new MockDocument();
    const richContainer = richDoc.createElement('div');
    const pWithPunct = richDoc.createElement('p');
    const boldWord = richDoc.createElement('strong');
    boldWord.appendChild(richDoc.createTextNode('bold'));
    pWithPunct.appendChild(boldWord);
    pWithPunct.appendChild(richDoc.createTextNode('.'));
    richContainer.appendChild(pWithPunct);

    const tbl = richDoc.createElement('table');
    const row = richDoc.createElement('tr');
    const th = richDoc.createElement('th');
    th.appendChild(richDoc.createTextNode('Header'));
    const td = richDoc.createElement('td');
    td.appendChild(richDoc.createTextNode('Value'));
    row.appendChild(th);
    row.appendChild(td);
    tbl.appendChild(row);
    richContainer.appendChild(tbl);

    const firstPass = tts.tokenizeReaderDOM(richContainer, richDoc);
    assert(firstPass.text.includes('bold.'), `Trailing punctuation after inline element must not gain an extra space: ${JSON.stringify(firstPass.text)}`);
    assert(firstPass.text.includes('Header\n\nValue'), `Table cells must have block pauses: ${JSON.stringify(firstPass.text)}`);

    const secondPass = tts.tokenizeReaderDOM(richContainer, richDoc);
    assert.strictEqual(secondPass.spans.length, firstPass.spans.length, 'Re-running tokenizeReaderDOM must be idempotent');
    assert.strictEqual(secondPass.text, firstPass.text, 'Re-running tokenizeReaderDOM must preserve exact spoken text');
  });
  console.log('✓ DOM tokenization idempotency, table cell breaks, and trailing punctuation verified.');

  console.log('\n--- 45. Layout Sync: Mobile bottom sheet clears hidden-bar & resize transitions cleanly ---');
  withSavedGlobals(['window', 'document'], () => {
    let isMobile = false;
    const bodyClasses = makeClassList();
    const toolbarAttrsSync = {};
    const fabAttrs = {};
    const focusHistory = [];
    const toolbarEl = {
      classList: makeClassList(['hidden-bar']),
      scrollTop: 42,
      setAttribute(k, v) { toolbarAttrsSync[k] = v; },
      removeAttribute(k) { delete toolbarAttrsSync[k]; },
      querySelectorAll: () => [],
      addEventListener() {},
      removeEventListener() {},
      contains: () => false
    };
    global.window = {
      matchMedia: () => ({ matches: isMobile }),
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    };
    global.document = {
      body: { classList: bodyClasses },
      activeElement: null,
      contains: () => false,
      addEventListener() {}
    };

    const resizeContext = createAppContext({
      readerView: { classList: makeClassList(['active']) },
      toolbar: toolbarEl,
      sheetBackdrop: { classList: makeClassList() },
      mobileFab: {
        classList: makeClassList(['reader-active']),
        setAttribute(k, v) { fabAttrs[k] = v; },
        focus() {}
      }
    });
    const syncReader = createReader(resizeContext, {
      ui: {
        ...mockUI,
        setContainerFocusable(_el, enabled) { focusHistory.push(enabled); }
      },
      parser: mockParser,
      tts: mockTTS,
      getSettings: mockSettings
    });

    // Desktop auto-hide -> resize to mobile -> expand sheet
    isMobile = true;
    syncReader.syncLayoutOnResize();
    assert.strictEqual(toolbarEl.classList.contains('hidden-bar'), false, 'Resizing to mobile must remove desktop hidden-bar class');
    toolbarEl.classList.add('hidden-bar');
    syncReader.expandMobileSheet();
    assert.strictEqual(toolbarEl.classList.contains('hidden-bar'), false, 'expandMobileSheet must remove hidden-bar');
    assert.strictEqual(toolbarEl.classList.contains('expanded'), true, 'expandMobileSheet must add expanded');
    assert.strictEqual(bodyClasses.contains('mobile-sheet-active'), true);

    // Resize from mobile expanded sheet -> desktop (>640px)
    isMobile = false;
    syncReader.syncLayoutOnResize();
    assert.strictEqual(toolbarEl.classList.contains('expanded'), false, 'Resizing to desktop must clear mobile expanded state');
    assert.strictEqual(toolbarAttrsSync.role, undefined, 'Resizing to desktop must remove dialog role');
    assert.strictEqual(toolbarAttrsSync['aria-modal'], undefined, 'Resizing to desktop must remove aria-modal');
    assert.strictEqual(bodyClasses.contains('mobile-sheet-active'), false, 'Resizing to desktop must unlock body scroll');
    assert.strictEqual(fabAttrs['aria-expanded'], 'false', 'Resizing to desktop must reset mobile FAB state');
    assert.strictEqual(focusHistory.at(-1), true, 'Desktop toolbar must be focusable after transition');
    if (resizeContext.state.toolbarTimer) clearTimeout(resizeContext.state.toolbarTimer);
  });
  console.log('✓ Mobile/desktop layout resize sync and sheet expansion state verified.');

  console.log('\n--- 46. Desktop Toolbar & Escape: Hover lock after click + Escape hierarchy ---');
  await withSavedGlobals(['window', 'document'], async () => {
    const toolbarHandlers = {};
    const docHandlers = {};
    const scheduledTimers = [];
    let blurred = false;
    let selectionCleared = false;
    const selectEl = {
      tagName: 'SELECT',
      blur() { blurred = true; }
    };
    const toolbarEl = {
      classList: makeClassList(),
      addEventListener(evt, cb) { toolbarHandlers[evt] = cb; },
      contains: el => el === selectEl
    };
    const readerViewEl = { classList: makeClassList(['active']) };
    const inputViewEl = { classList: makeClassList(['hidden']) };
    let currentSelection = { isCollapsed: true, removeAllRanges() { selectionCleared = true; } };
    global.window = {
      matchMedia: () => ({ matches: false }),
      setTimeout(fn) {
        const id = scheduledTimers.length + 1;
        scheduledTimers.push({ id, fn, cleared: false });
        return id;
      },
      clearTimeout(id) {
        const entry = scheduledTimers.find(t => t.id === id);
        if (entry) entry.cleared = true;
      },
      getSelection: () => currentSelection,
      addEventListener() {}
    };
    global.document = {
      activeElement: null,
      addEventListener(evt, cb) { docHandlers[evt] = cb; }
    };

    const hoverCtx = createAppContext({
      readerView: readerViewEl,
      inputView: inputViewEl,
      toolbar: toolbarEl,
      backBtn: { classList: makeClassList(), addEventListener() {} },
      pasteArea: { value: '', addEventListener() {} }
    });
    const hoverReader = createReader(hoverCtx, {
      ui: mockUI,
      parser: mockParser,
      tts: mockTTS,
      getSettings: () => ({ resetSettingsSections() {}, canUseGlobalPresetShortcut: () => false })
    });
    hoverReader.bindEvents();

    // Hover + click inside toolbar must NOT schedule auto-hide while pointer remains over toolbar
    toolbarHandlers.mouseenter();
    toolbarHandlers.click();
    assert.strictEqual(scheduledTimers.filter(t => !t.cleared).length, 0, 'Clicking inside hovered toolbar must not schedule auto-hide');

    // Leaving toolbar resumes auto-hide and hides toolbar when timer fires
    toolbarHandlers.mouseleave();
    const activeTimer = scheduledTimers.filter(t => !t.cleared).at(-1);
    assert(activeTimer, 'Leaving toolbar must schedule auto-hide timer');
    activeTimer.fn();
    assert.strictEqual(toolbarEl.classList.contains('hidden-bar'), true, 'Toolbar must hide after mouseleave timeout');

    // Escape hierarchy:
    // 1. Focused <select> inside toolbar -> blur instead of closing reader
    global.document.activeElement = selectEl;
    docHandlers.keydown({ key: 'Escape' });
    assert.strictEqual(blurred, true, 'Escape on focused toolbar select should blur it');
    assert.strictEqual(readerViewEl.classList.contains('active'), true, 'Escape on toolbar select must not exit reader');

    // 2. Non-collapsed text selection -> clear selection instead of closing reader
    global.document.activeElement = null;
    currentSelection = { isCollapsed: false, removeAllRanges() { selectionCleared = true; } };
    docHandlers.keydown({ key: 'Escape' });
    assert.strictEqual(selectionCleared, true, 'Escape with selection should clear selection');
    assert.strictEqual(readerViewEl.classList.contains('active'), true, 'Escape clearing selection must not exit reader');

    // 3. Otherwise -> exit reader
    currentSelection = { isCollapsed: true, removeAllRanges() {} };
    docHandlers.keydown({ key: 'Escape' });
    assert.strictEqual(readerViewEl.classList.contains('active'), false, 'Plain Escape should exit reader view');
    assert.strictEqual(inputViewEl.classList.contains('hidden'), false, 'Plain Escape should restore input view');
  });
  console.log('✓ Desktop toolbar hover persistence and Escape priority verified.');

  console.log('\n--- 47. Carousel: Drag wraps across light/dark modes and window.blur cancels drag ---');
  withSavedGlobals(['window', 'document'], () => {
    const winListeners = {};
    const pwListeners = {};
    global.window = {
      addEventListener: (t, cb) => { winListeners[t] = cb; },
      removeEventListener: () => {},
      getSelection: () => null,
      requestAnimationFrame: () => {}
    };
    global.document = {
      addEventListener: () => {},
      querySelectorAll: () => []
    };
    const wrapWindow = {
      nodeType: 1,
      addEventListener: (t, cb) => { pwListeners[t] = cb; },
      getAttribute: () => '',
      setAttribute: () => {},
      getBoundingClientRect: () => ({ width: 300 }),
      closest: () => null
    };
    const wrapContext = createAppContext({
      presetWindow: wrapWindow,
      presetTrack: { classList: makeClassList(), querySelectorAll: () => [], style: {} },
      presetDots: { innerHTML: '', querySelectorAll: () => [] },
      themeSettingsSummary: { textContent: '' },
      gestureHint: { classList: makeClassList() },
      gestureHintText: { textContent: '' },
      modeLight: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      modeDark: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
      readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList(), addEventListener() {} }
    });
    const wrapSettings = createSettings(wrapContext, {
      onResetToolbarTimer: () => {},
      isMobileSheetLayout: () => false
    });
    wrapSettings.bindEvents();
    wrapSettings.setMode('light', { presetIndex: 9, resetTimer: false });
    pwListeners.mousedown({ button: 0, clientX: 250, target: wrapWindow });
    winListeners.mousemove({ clientX: 50 });
    winListeners.mouseup();
    assert.strictEqual(wrapContext.state.currentMode, 'dark', 'Dragging past last light preset must wrap to dark mode');
    assert.strictEqual(wrapContext.state.currentPresetIndex, 0, 'Dragging past last light preset must select dark index 0');

    // Dragging past first dark preset wraps back to last light preset
    pwListeners.mousedown({ button: 0, clientX: 50, target: wrapWindow });
    winListeners.mousemove({ clientX: 250 });
    winListeners.mouseup();
    assert.strictEqual(wrapContext.state.currentMode, 'light', 'Dragging past first dark preset must wrap back to light mode');
    assert.strictEqual(wrapContext.state.currentPresetIndex, 9, 'Dragging past first dark preset must land on last light preset');

    // Window blur ends active drag cleanly
    pwListeners.mousedown({ button: 0, clientX: 150, target: wrapWindow });
    assert.strictEqual(wrapContext.state.isDraggingCarousel, true);
    winListeners.blur();
    assert.strictEqual(wrapContext.state.isDraggingCarousel, false, 'window.blur must stop active carousel drag');
  });
  console.log('✓ Carousel drag mode-crossing and window.blur cleanup verified.');

  console.log('\n--- 48. Markdown: Slugified heading IDs, deduplication, and reserved DOM ID guard ---');
  const tocMd = [
    '# App',
    '',
    '# Intro & Overview',
    '',
    '## Summary',
    '',
    '## Summary',
    '',
    '[Jump](#intro-overview)'
  ].join('\n');
  const tocHtml = parser.parseMarkdownToHtml(tocMd);
  assert(tocHtml.includes('<h1 id="app-1">App</h1>'), `Reserved DOM ID "app" must be avoided, got: ${tocHtml}`);
  assert(tocHtml.includes('<h1 id="intro-overview">Intro &amp; Overview</h1>'), `Heading slug must match anchor link, got: ${tocHtml}`);
  assert(tocHtml.includes('<h2 id="summary">Summary</h2>') && tocHtml.includes('<h2 id="summary-1">Summary</h2>'), `Duplicate heading slugs must disambiguate cleanly: ${tocHtml}`);
  assert(tocHtml.includes('<a href="#intro-overview">Jump</a>'), 'Anchor link must match heading slug');
  console.log('✓ Slugified heading IDs, duplicates, and reserved app-shell ID collisions verified.');

  console.log('\n--- 49. TTS Core: Inline spacing, <br> handling, and UTF-16 surrogate-pair chunking ---');
  withSavedGlobals(['NodeFilter'], () => {
    global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
    const spDoc = new MockDocument();
    const spRoot = spDoc.createElement('div');

    const pParens = spDoc.createElement('p');
    pParens.appendChild(spDoc.createTextNode('('));
    const bParens = spDoc.createElement('strong');
    bParens.appendChild(spDoc.createTextNode('bold'));
    pParens.appendChild(bParens);
    pParens.appendChild(spDoc.createTextNode(')'));
    spRoot.appendChild(pParens);

    const pSplitWord = spDoc.createElement('p');
    const bUn = spDoc.createElement('strong');
    bUn.appendChild(spDoc.createTextNode('un'));
    pSplitWord.appendChild(bUn);
    pSplitWord.appendChild(spDoc.createTextNode('believable'));
    spRoot.appendChild(pSplitWord);

    const pSpacedInline = spDoc.createElement('p');
    const sHello = spDoc.createElement('strong');
    sHello.appendChild(spDoc.createTextNode('Hello'));
    const eWorld = spDoc.createElement('em');
    eWorld.appendChild(spDoc.createTextNode('world'));
    pSpacedInline.appendChild(sHello);
    pSpacedInline.appendChild(spDoc.createTextNode(' '));
    pSpacedInline.appendChild(eWorld);
    spRoot.appendChild(pSpacedInline);

    const pBr = spDoc.createElement('p');
    pBr.appendChild(spDoc.createTextNode('Line one'));
    pBr.appendChild(spDoc.createElement('br'));
    pBr.appendChild(spDoc.createTextNode('Line two'));
    spRoot.appendChild(pBr);

    const spResult = tts.tokenizeReaderDOM(spRoot, spDoc);
    assert(spResult.text.includes('(bold)'), `Parentheses around inline tag must not get extra spaces: ${JSON.stringify(spResult.text)}`);
    assert(spResult.text.includes('unbelievable'), `Split inline word must not get extra space: ${JSON.stringify(spResult.text)}`);
    assert(spResult.text.includes('Hello world'), `Whitespace node between inline elements must remain a space: ${JSON.stringify(spResult.text)}`);
    assert(spResult.text.includes('Line one\nLine two'), `<br> must insert newline break: ${JSON.stringify(spResult.text)}`);
  });

  const emojiStr = 'a'.repeat(189) + '🚀' + 'b'.repeat(20);
  const emojiChunks = tts.chunkText(emojiStr, 0, 190);
  assert.strictEqual(emojiChunks.length, 2);
  assert.strictEqual(emojiChunks[0].text.length, 189, 'chunkText must not bisect a UTF-16 surrogate pair');
  assert(emojiChunks[1].text.startsWith('🚀'), 'Surrogate pair emoji must stay intact in the next chunk');
  console.log('✓ Inline spacing, <br> breaks, and surrogate-pair chunking verified.');

  console.log('\n--- 50. CSS & CSP: WCAG AA (>=4.5:1) theme contrast, zero legacy tints, CSP & mobile rules ---');
  const styleCss = fs.readFileSync(path.join(__dirname, '../style.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  assert(!styleCss.includes('154, 53, 36') && !styleCss.includes('154,53,36'), 'style.css must not hardcode cream terracotta rgba(154, 53, 36, ...)');
  assert(!/\.preset-arrow:active\s*\{[^}]*#fff\b/i.test(styleCss), '.preset-arrow:active must use var(--on-accent) instead of #fff');
  assert(styleCss.includes('.sr-only'), 'style.css must define .sr-only for #liveAnnouncer');
  assert(!styleCss.includes('force-hidden') && !styleCss.includes('--reader-focus-offset'), 'Dead CSS rules must be removed');
  assert(indexHtml.includes("style-src 'self';") && indexHtml.includes("form-action 'none'"), 'CSP must disallow unsafe-inline styles and form submissions');

  function parseHex(hex) {
    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
  }
  function relativeLuminance([r, g, b]) {
    const f = v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrastRatio(c1, c2) {
    const l1 = relativeLuminance(parseHex(c1));
    const l2 = relativeLuminance(parseHex(c2));
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  const themeDefaults = { '--on-accent': '#ffffff', '--ui-negative': '#b91c1c', '--ui-positive': '#206024' };
  const themeMatches = [...styleCss.matchAll(/\.theme-([a-z]+)\s*\{([^}]+)\}/g)];
  assert.strictEqual(themeMatches.length, 20, `Expected 20 themes in style.css, found ${themeMatches.length}`);
  themeMatches.forEach(([, name, body]) => {
    const vars = { ...themeDefaults };
    for (const [, k, v] of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+)/g)) vars[k] = v.trim();
    Object.keys(vars).forEach(k => { if (vars[k] === 'var(--bg)') vars[k] = vars['--bg']; });
    const checks = [
      ['text/bg', vars['--text'], vars['--bg']],
      ['text/card', vars['--text'], vars['--card']],
      ['text2/bg', vars['--text2'], vars['--bg']],
      ['text2/card', vars['--text2'], vars['--card']],
      ['accent/bg', vars['--accent'], vars['--bg']],
      ['accent/card', vars['--accent'], vars['--card']],
      ['on-accent/accent', vars['--on-accent'], vars['--accent']],
      ['ui-positive/card', vars['--ui-positive'], vars['--card']],
      ['ui-negative/card', vars['--ui-negative'], vars['--card']]
    ];
    checks.forEach(([label, fg, bg]) => {
      const ratio = contrastRatio(fg, bg);
      assert(ratio >= 4.5, `Theme "${name}" failed WCAG AA contrast on ${label} (${fg} vs ${bg}): ${ratio.toFixed(2)}:1`);
    });
  });
  assert(styleCss.includes('scroll-margin-top: var(--reader-toolbar-offset)'), 'Headings must declare scroll-margin-top to avoid toolbar occlusion');
  assert(styleCss.includes('.reader-content .table-wrap') && !/\.reader-content table\s*\{[^}]*display:\s*block/i.test(styleCss), 'Tables must scroll via .table-wrap instead of display:block');
  assert(/<main>[\s\S]*id="inputView"[\s\S]*id="readerView"[\s\S]*<\/main>/.test(indexHtml), 'Both input and reader views must live inside a persistent <main> landmark');
  console.log('✓ All 20 CSS themes pass >= 4.5:1 WCAG AA contrast and CSP hardening checks.');

  console.log('\n--- 51. App Init: WeakSet guard supports distinct documents without double-init ---');
  withSavedGlobals(['window', 'document'], () => {
    global.window = {
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
      matchMedia: () => ({ matches: false }),
      getSelection: () => null
    };
    const makeInitDoc = () => {
      const docEl = { style: { setProperty() {} }, clientHeight: 800, scrollHeight: 800 };
      const bodyEl = { classList: makeClassList(), appendChild() {} };
      const elsById = {
        pasteArea: { value: '', addEventListener() {}, style: {} },
        clearBtn: { style: {}, addEventListener() {} },
        toolbar: { classList: makeClassList(), style: {}, querySelectorAll: () => [], addEventListener() {} },
        audioPlayerBar: { classList: makeClassList(), style: {}, querySelectorAll: () => [], setAttribute() {} },
        readerContent: { classList: makeClassList(), style: {}, querySelectorAll: () => [], addEventListener() {} },
        lineHeightInput: { value: '', addEventListener() {} },
        letterSpacingInput: { value: '', addEventListener() {} },
        marginInput: { value: '', addEventListener() {} },
        voiceRateInput: { value: '', addEventListener() {} },
        voiceRateVal: { textContent: '' },
        audioSpeedBtn: { textContent: '', addEventListener() {} },
        modeLight: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
        modeDark: { classList: makeClassList(), setAttribute() {}, addEventListener() {} },
        presetTrack: { classList: makeClassList(), style: {}, querySelectorAll: () => [] },
        presetDots: { querySelectorAll: () => [] },
        presetWindow: { setAttribute() {}, addEventListener() {} },
        themeSettingsSummary: { textContent: '' }
      };
      return {
        readyState: 'loading',
        documentElement: docEl,
        body: bodyEl,
        getElementById: id => elsById[id] || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener() {}
      };
    };

    const docA = makeInitDoc();
    const docB = makeInitDoc();
    global.document = docA;
    const first = init(docA);
    assert(first && first.reader && first.tts, 'First init(docA) must return initialized modules');
    assert.strictEqual(init(docA), undefined, 'Second init(docA) on same document must be a no-op');
    const second = init(docB);
    assert(second && second.reader, 'init(docB) on a distinct mock document must initialize cleanly');
  });
  console.log('✓ App init WeakSet guard verified across distinct documents.');

  console.log('\n--- 52. TTS: <br> before inline formatting, paused external cancel, invalid charIndex, and voice lookup ---');
  withSavedGlobals(['NodeFilter', 'SpeechSynthesisUtterance', 'document'], () => {
    global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
    const brDoc = new MockDocument();
    const brRoot = brDoc.createElement('article');
    const brP = brDoc.createElement('p');
    brP.appendChild(brDoc.createTextNode('First line'));
    brP.appendChild(brDoc.createElement('br'));
    const brStrong = brDoc.createElement('strong');
    brStrong.appendChild(brDoc.createTextNode('Second line'));
    brP.appendChild(brStrong);
    brRoot.appendChild(brP);
    const brTok = tts.tokenizeReaderDOM(brRoot, brDoc);
    assert.strictEqual(brTok.text, 'First line\nSecond line', `<br> before inline element must insert newline, got: ${JSON.stringify(brTok.text)}`);

    global.SpeechSynthesisUtterance = class MockUtterance {
      constructor(text) {
        this.text = text;
        this.rate = 1;
        this.pitch = 1;
      }
    };
    global.document = { hidden: false, addEventListener() {}, createElement: () => ({}) };
    let lastUtterance = null;
    let speakCount = 0;
    let resumeCount = 0;
    const cancelSynth = {
      speaking: false,
      paused: false,
      speak(u) {
        speakCount += 1;
        this.speaking = true;
        lastUtterance = u;
        if (u.onstart) u.onstart();
      },
      pause() { this.paused = true; },
      resume() { resumeCount += 1; this.paused = false; },
      cancel() { this.speaking = false; this.paused = false; },
      getVoices: () => [
        { name: 'Voice Zero', lang: 'en-US', voiceURI: 'v0', default: true },
        { name: 'Voice One', lang: 'en-US', voiceURI: 'v1', default: false }
      ]
    };
    const voiceSelectEl = { value: '1_removed_uri', innerHTML: '', appendChild() {} };
    const ctx52 = createAppContext({
      readerContent: { classList: makeClassList(), querySelectorAll: () => [], contains: () => true },
      voiceRateInput: { value: '1.0' },
      voiceSelect: voiceSelectEl
    });
    ctx52.runtime.tts.supported = true;
    ctx52.runtime.tts.synth = cancelSynth;
    ctx52.runtime.tts.isMobile = false;
    ctx52.runtime.tts.voices = cancelSynth.getVoices();
    ctx52.runtime.tts.wordSpans = [
      { classList: makeClassList(), scrollIntoView() {} },
      { classList: makeClassList(), scrollIntoView() {} }
    ];
    ctx52.runtime.tts.wordMeta = [
      { index: 0, text: 'Hello', start: 0, end: 5 },
      { index: 1, text: 'world', start: 6, end: 11 }
    ];
    ctx52.runtime.tts.fullSpokenText = 'Hello world';
    const ctrl52 = tts.createTTS(ctx52, { ui: mockUI });

    ctrl52.startSpeech(0);
    // Voice URI starting with digit must fall back to index 0, not parseInt('1_removed_uri') === 1
    assert.strictEqual(lastUtterance.voice.voiceURI, 'v0', 'Removed voiceURI starting with digit must not parseInt-match another voice');

    // Invalid onboundary charIndex must not disable fallback estimate timer
    assert(ctx52.runtime.tts.estimateTimer, 'Estimate timer should be running before valid boundary event');
    lastUtterance.onboundary({ name: 'word', charIndex: undefined });
    assert.strictEqual(ctx52.runtime.tts.chunkHasBoundary, false, 'Invalid charIndex must not mark chunkHasBoundary');
    assert(ctx52.runtime.tts.estimateTimer, 'Invalid charIndex must not stop estimate timer');

    // External cancel while paused must force restartFromWord on resume instead of dead synth.resume()
    ctrl52.pauseSpeech();
    assert.strictEqual(ctx52.runtime.tts.state, 'paused');
    lastUtterance.onerror({ error: 'canceled' });
    assert.strictEqual(ctx52.runtime.tts.visibilityInterrupted, true, 'External cancel while paused must mark session dirty');
    const speaksBeforeResume = speakCount;
    ctrl52.resumeSpeech();
    assert.strictEqual(speakCount, speaksBeforeResume + 1, 'Resuming after external cancel while paused must restart utterance');
    assert.strictEqual(resumeCount, 0, 'Resuming after external cancel while paused must not call dead synth.resume()');
    ctrl52.stopTTS();
  });
  console.log('✓ TTS <br>+inline separation, paused cancel recovery, charIndex guard, and voice fallback verified.');

  console.log('\n--- 53. UI/A11y: Dynamic theme-color, toolbar inert/aria-hidden, mobile Close FAB trap, and tap/timer guards ---');
  withSavedGlobals(['window', 'document'], () => {
    const metaAttrs = { content: '#faf8f5' };
    const docListeners = {};
    const bodyClasses = makeClassList();
    let clearedTimerIds = [];
    let activeEl = null;
    const mockDoc53 = {
      body: { classList: bodyClasses },
      documentElement: { style: { setProperty() {} } },
      get activeElement() { return activeEl; },
      querySelector: sel => (sel === 'meta[name="theme-color"]'
        ? { setAttribute(k, v) { metaAttrs[k] = v; } }
        : null),
      querySelectorAll: () => [],
      addEventListener(evt, fn) { docListeners[evt] = fn; },
      removeEventListener(evt, fn) { if (docListeners[evt] === fn) delete docListeners[evt]; },
      contains: () => true
    };
    global.document = mockDoc53;
    global.window = {
      matchMedia: () => ({ matches: true }),
      setTimeout: () => 777,
      clearTimeout: id => { clearedTimerIds.push(id); },
      getSelection: () => null,
      addEventListener() {}
    };

    const handleBtn = { focused: false, offsetParent: {}, focus() { this.focused = true; activeEl = this; }, dataset: {}, hasAttribute: () => false, setAttribute() {}, removeAttribute() {} };
    const fabBtn = { focused: false, offsetParent: {}, classList: makeClassList(['reader-active']), setAttribute() {}, addEventListener() {}, contains: () => false, focus() { this.focused = true; activeEl = this; } };
    const toolbarAttrs = {};
    const toolbarEl = {
      inert: false,
      scrollTop: 0,
      classList: makeClassList(),
      setAttribute(k, v) { toolbarAttrs[k] = v; },
      removeAttribute(k) { delete toolbarAttrs[k]; },
      querySelectorAll: () => [handleBtn],
      addEventListener() {},
      removeEventListener() {},
      contains: el => el === handleBtn
    };
    const audioBarEl = { contains: el => el === 'audio-child' };
    const ctx53 = createAppContext({
      readerView: { classList: makeClassList(['active']) },
      inputView: { classList: makeClassList(['hidden']) },
      toolbar: toolbarEl,
      backBtn: { classList: makeClassList(), contains: () => false, addEventListener() {} },
      sheetBackdrop: { classList: makeClassList(), contains: () => false, addEventListener() {} },
      mobileFab: fabBtn,
      audioPlayerBar: audioBarEl,
      pasteArea: { value: '', addEventListener() {} },
      presetTrack: { classList: makeClassList(), style: {}, querySelectorAll: () => [] },
      presetDots: { querySelectorAll: () => [] },
      presetWindow: { setAttribute() {}, addEventListener() {} },
      themeSettingsSummary: { textContent: '' }
    }, mockDoc53);

    const settings53 = createSettings(ctx53, { onResetToolbarTimer() {}, isMobileSheetLayout: () => true });
    settings53.setMode('dark', { presetIndex: 1, resetTimer: false }); // Void (#000000)
    assert.strictEqual(metaAttrs.content, '#000000', 'Switching to Void dark theme must update meta[name=theme-color] to #000000');

    const ui53 = createUI(ctx53);
    const reader53 = createReader(ctx53, {
      ui: ui53,
      parser: mockParser,
      tts: mockTTS,
      getSettings: () => settings53
    });
    reader53.bindEvents();

    // Expanding mobile sheet includes active mobileFab ("Close") in Tab focus trap
    reader53.expandMobileSheet();
    assert.strictEqual(handleBtn.focused, true, 'First visible control inside sheet should receive focus');
    assert.strictEqual(toolbarEl.inert, false, 'Expanded sheet must not be inert');
    assert.strictEqual(toolbarAttrs['aria-hidden'], undefined, 'Expanded sheet must not be aria-hidden');

    // Shift+Tab from first element wraps to mobileFab ("Close")
    let prevented = false;
    activeEl = handleBtn;
    docListeners.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
    assert.strictEqual(prevented, true, 'Shift+Tab on first focusable must wrap inside dialog');
    assert.strictEqual(fabBtn.focused, true, 'Mobile Close FAB must be reachable in dialog focus trap');

    // Collapsing sheet sets inert and aria-hidden
    reader53.collapseMobileSheet();
    assert.strictEqual(toolbarEl.inert, true, 'Collapsed sheet must be inert');
    assert.strictEqual(toolbarAttrs['aria-hidden'], 'true', 'Collapsed sheet must set aria-hidden=true');

    // goBack clears pending toolbarTimer
    ctx53.state.toolbarTimer = 777;
    reader53.goBack();
    assert(clearedTimerIds.includes(777), 'goBack must clear pending toolbarTimer');
    assert.strictEqual(ctx53.state.toolbarTimer, null, 'goBack must null out state.toolbarTimer');

    // Clicking anchor links or audioPlayerBar must not reveal desktop toolbar
    global.window.matchMedia = () => ({ matches: false });
    ctx53.els.readerView.classList.add('active');
    toolbarEl.classList.add('hidden-bar');
    docListeners.click({ target: 'audio-child' });
    assert.strictEqual(toolbarEl.classList.contains('hidden-bar'), true, 'Clicking audioPlayerBar must not reveal top toolbar');
    docListeners.click({ target: { nodeType: 1, closest: sel => (sel === 'a[href^="#"]' ? {} : null) } });
    assert.strictEqual(toolbarEl.classList.contains('hidden-bar'), true, 'Clicking an in-page anchor link must not reveal top toolbar');
  });
  console.log('✓ Dynamic theme-color, toolbar inert/aria-hidden, mobile Close FAB trap, and tap/timer guards verified.');

  console.log('\n--- 54. Markdown: Tables render inside scrollable .table-wrap container ---');
  const wrappedTableHtml = parser.parseMarkdownToHtml('| A | B |\n|---|---|\n| 1 | 2 |');
  assert(wrappedTableHtml.includes('<div class="table-wrap"><table>') && wrappedTableHtml.includes('</table></div>'), `Tables must be wrapped in .table-wrap: ${wrappedTableHtml}`);
  console.log('✓ Markdown tables render inside .table-wrap container.');

  console.log('\n====================================================');
  console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY');
  console.log('====================================================\n');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
