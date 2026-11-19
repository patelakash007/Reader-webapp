'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const utils = await import('../src/utils.mjs');
  const { createAppContext } = await import('../src/context.mjs');
  const { createReader } = await import('../src/reader.mjs');
  const { createSettings } = await import('../src/settings.mjs');

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
  const parentLiChildIndex = nestedListHtml.indexOf('child');
  const parentLiIndex = nestedListHtml.indexOf('parent');
  assert(parentLiChildIndex > parentLiIndex, 'Child should follow parent');
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

  const savedDoc = global.document;
  delete global.document;
  try {
    const entityXssHtml = parser.parseMarkdownToHtml('[XSS](javascript&#58;alert(1)) and [Hex](javascript&#x3a;alert(1))');
    assert(!entityXssHtml.includes('href="javascript:'), `Numeric entity XSS link was not blocked: ${entityXssHtml}`);
  } finally {
    if (savedDoc !== undefined) global.document = savedDoc;
  }

  const anchorHtml = parser.parseMarkdownToHtml('[Jump](#section-one)');
  assert(anchorHtml.includes('<a href="#section-one">Jump</a>'), `In-page anchor link should not force target=_blank: ${anchorHtml}`);
  assert(!anchorHtml.includes('target="_blank"'), `In-page anchor link must not open a new tab: ${anchorHtml}`);
  console.log('✓ GFM task lists, percent-encoded URLs, numeric entity checks, and anchor links verified.');

  console.log('\n--- 12. Async State Races: Back during render invalidation ---');
  const mockContext = createAppContext({
    readerContent: { textContent: '', insertAdjacentHTML() {} },
    readerView: { classList: { remove() {}, add() {}, contains: () => false } },
    inputView: { classList: { remove() {}, add() {} } },
    backBtn: { classList: { remove() {}, add() {} } },
    toolbar: { classList: { remove() {}, add() {}, contains: () => false } },
    wordCount: { classList: { remove() {}, add() {} } },
    focusRestore: { classList: { remove() {}, add() {} } },
    sheetBackdrop: { classList: { remove() {}, add() {} } },
    mobileFab: { classList: { remove() {}, add() {} }, setAttribute() {} },
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
    getFullscreenElement: () => null,
    setContainerFocusable() {}
  };
  const mockTTS = {
    getSession: () => ({ isSpeaking: false, wordMeta: [] }),
    stopTTS() {},
    tokenize() {}
  };
  const mockParser = {
    enforceExtractedTextLimit: t => t
  };
  const mockSettings = () => ({
    applyTextColor() {},
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
  global.SpeechSynthesisUtterance = FakeUtterance;

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
    { classList: { add() {}, remove() {} }, scrollIntoView() {} },
    { classList: { add() {}, remove() {} }, scrollIntoView() {} }
  ];
  multiChunkContext.runtime.tts.chunks = [
    { text: 'First sentence of speech.', start: 0, end: 25 },
    { text: 'Second sentence of speech.', start: 26, end: 52 },
    { text: 'Third sentence of speech.', start: 53, end: 78 }
  ];
  multiChunkContext.runtime.tts.chunkIndex = 0;

  const ttsEngine = tts.createTTS(multiChunkContext, { ui: mockUI });
  ttsEngine.restartFromWord(0);
  assert.strictEqual(multiChunkContext.runtime.tts.state, 'playing');

  await new Promise(resolve => setTimeout(resolve, 80));
  assert(chainingSynth.history.length >= 2, `Expected multi-chunk chaining, spoke ${chainingSynth.history.length} chunks`);
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
  ttsInvalidateContext.runtime.tts.wordSpans = [{ classList: { remove() {}, add() {} } }];
  ttsInvalidateContext.runtime.tts.fullSpokenText = 'old';
  ttsEngine2.invalidateTokenization();
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordMeta.length, 0, 'wordMeta must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.wordSpans.length, 0, 'wordSpans must be cleared');
  assert.strictEqual(ttsInvalidateContext.runtime.tts.fullSpokenText, '', 'fullSpokenText must be cleared');
  console.log('✓ TTS tokenization cache cleanly invalidated to prevent stale word highlights.');

  console.log('\n--- 19. DOM Tokenization: h4-h6 block boundary & safe NodeFilter ---');
  class MockNode {
    constructor(val, tag = null) {
      this.nodeValue = val;
      this.tagName = tag ? tag.toUpperCase() : '';
      this.parentElement = null;
      this.parentNode = null;
      this.childNodes = [];
    }
    appendChild(child) {
      child.parentElement = this;
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    setAttribute(_k, _v) {}
    replaceChild() {}
    closest(sel) {
      const tags = sel.split(',').map(s => s.trim().toUpperCase());
      let cur = this;
      while (cur) {
        if (tags.includes(cur.tagName)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
  }
  const mockContainer = new MockNode('', 'div');
  const h4 = new MockNode('', 'h4');
  const h4Text = new MockNode('Subheading Level 4');
  h4.appendChild(h4Text);
  mockContainer.appendChild(h4);
  const p = new MockNode('', 'p');
  const pText = new MockNode('Paragraph text directly beneath h4.');
  p.appendChild(pText);
  mockContainer.appendChild(p);

  const savedNodeFilter = global.NodeFilter;
  delete global.NodeFilter;
  try {
    const docWalk = {
      createTreeWalker(_root) {
        const nodes = [h4Text, pText];
        let i = -1;
        return {
          nextNode() {
            i++;
            if (i < nodes.length) { this.currentNode = nodes[i]; return true; }
            return false;
          }
        };
      },
      createElement(tag) { return new MockNode('', tag); },
      createTextNode(val) { return new MockNode(val); },
      createDocumentFragment() { return new MockNode(''); }
    };
    const tokRes = tts.tokenizeReaderDOM(mockContainer, docWalk);
    assert(tokRes.text.includes('Subheading Level 4\n\nParagraph text'), `h4 must be separated by \\n\\n from paragraph, got: ${JSON.stringify(tokRes.text)}`);
    console.log('✓ h4-h6 block boundaries preserved and missing global NodeFilter handled safely.');
  } finally {
    global.NodeFilter = savedNodeFilter;
  }

  console.log('\n--- 20. Mobile Settings Sheet: Dialog semantics & focus trap ---');
  let toolbarAttrs = {};
  const mockToolbar = {
    classList: {
      contains: cls => cls === 'expanded',
      add() {},
      remove() {}
    },
    setAttribute(k, v) { toolbarAttrs[k] = v; },
    removeAttribute(k) { delete toolbarAttrs[k]; },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  const sheetContext = createAppContext({
    toolbar: mockToolbar,
    sheetBackdrop: { classList: { add() {}, remove() {} } },
    mobileFab: { classList: { add() {}, remove() {} }, setAttribute() {}, focus() {} }
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
  const constants = await import('../src/constants.mjs');
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

  console.log('\n--- 24. TTS: Click-to-speak safeguards (unsupported, selection, links) ---');
  let clickHandler = null;
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
    voiceRateInput: { value: '1.0' }
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

  // Case 1: TTS unsupported -> do not tokenize
  clickContext.runtime.tts.supported = false;
  clickHandler({ target: { closest: () => null } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when TTS is unsupported');

  // Case 2: TTS supported, but user has an active text selection -> do not tokenize
  clickContext.runtime.tts.supported = true;
  global.window = {
    getSelection: () => ({ isCollapsed: false, toString: () => 'selected text' })
  };
  clickHandler({ target: { closest: () => null } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when text is selected');

  // Case 3: Target is a link -> do not tokenize
  global.window.getSelection = () => ({ isCollapsed: true, toString: () => '' });
  clickHandler({ target: { closest: sel => (sel.includes('a') ? {} : null) } });
  assert.strictEqual(tokenizedCount, 0, 'Should not tokenize when clicking a link');

  // Case 4: Valid click on text -> tokenizes and starts speech
  const wordSpan = {
    closest: sel => (sel === '.tts-word' ? wordSpan : null),
    hasAttribute: attr => attr === 'data-word-idx',
    getAttribute: attr => (attr === 'data-word-idx' ? '0' : null)
  };
  global.document = {
    elementFromPoint: () => wordSpan
  };
  clickHandler({
    target: { closest: () => null },
    clientX: 100,
    clientY: 200
  });
  assert.strictEqual(tokenizedCount, 1, 'Should tokenize on valid word click');
  assert.strictEqual(startedSpeechAt, 0, 'Should start speech at word index 0 on first click');
  console.log('✓ Reader click handler safeguards against unsupported TTS, active selection, links, and speaks on first click.');

  console.log('\n--- 26. Markdown: Multi-line ALL-CAPS paragraph does not collapse into single heading with newline (F-08) ---');
  const multiLineAllCaps = 'CHAPTER ONE\nTHE BEGINNING';
  const multiLineHtml = parser.parseMarkdownToHtml(multiLineAllCaps, true);
  assert(!multiLineHtml.includes('\n</h2>') && !multiLineHtml.includes('<h2 id="heading-0">CHAPTER ONE\nTHE BEGINNING</h2>'), 'Multi-line shouted paragraph should not become a single heading with a newline');
  assert(!multiLineHtml.match(/<h[1-6][^>]*>[^<]*\n[^<]*<\/h[1-6]>/), 'Headings must never contain raw newlines');
  assert(multiLineHtml.includes('<p>') && multiLineHtml.includes('CHAPTER ONE') && multiLineHtml.includes('THE BEGINNING'), 'Multi-line text should remain in a paragraph');

  const separateHeadings = 'CHAPTER ONE\n\nTHE BEGINNING';
  const separateHtml = parser.parseMarkdownToHtml(separateHeadings, true);
  const h2Count = (separateHtml.match(/<h2/g) || []).length;
  assert.strictEqual(h2Count, 2, `Expected 2 headings when separated by blank lines, got ${h2Count}: ${separateHtml}`);
  console.log('✓ Multi-line ALL-CAPS paragraph renders in <p> without collapsed raw newline heading.');

  console.log('\n--- 27. DOM Cleanup: goBack clears reader DOM and wordCount text (F-14) ---');
  const makeClassList2 = () => ({ add() {}, remove() {}, contains() { return false; }, toggle() {} });
  const backTestContent = { textContent: 'Previously rendered document DOM' };
  const backTestWordCount = { textContent: '1,234 words', classList: makeClassList2() };
  const backContext = createAppContext({
    readerContent: backTestContent,
    wordCount: backTestWordCount,
    readerView: { classList: makeClassList2() },
    inputView: { classList: makeClassList2() },
    backBtn: { classList: makeClassList2() },
    toolbar: { classList: makeClassList2() },
    focusRestore: { classList: makeClassList2() }
  });
  const backReader = createReader(backContext, {
    ui: mockUI,
    parser,
    tts: mockTTS,
    getSettings: mockSettings
  });
  backReader.goBack();
  assert.strictEqual(backTestContent.textContent, '', 'readerContent should be emptied when pressing Back');
  assert.strictEqual(backTestWordCount.textContent, '', 'wordCount text should be emptied when pressing Back');
  console.log('✓ goBack properly frees memory by clearing readerContent and wordCount.');

  console.log('\n--- 28. Markdown: CommonMark fidelity (F-07) ---');
  // Case 1: loose list should remain a single <ul>
  const looseListHtml = parser.parseMarkdownToHtml('- a\n\n- b');
  const ulMatches = looseListHtml.match(/<ul/g) || [];
  assert.strictEqual(ulMatches.length, 1, `Expected exactly 1 <ul> for loose list, got ${ulMatches.length}`);
  assert(looseListHtml.includes('<li>') && looseListHtml.includes('a') && looseListHtml.includes('b'));

  // Case 2: Setext heading (Title\n---) should render <h2>
  const setextHtml = parser.parseMarkdownToHtml('Title\n---');
  assert(setextHtml.includes('<h2') && setextHtml.includes('Title</h2>'), `Expected <h2> for setext heading, got: ${setextHtml}`);
  assert(!setextHtml.includes('<hr>'), `Setext heading must not be split into an <hr>`);

  // Case 3: ~~~ fence with blank line inside
  const tildeFenceHtml = parser.parseMarkdownToHtml('~~~\nfirst line\n\nsecond line\n~~~');
  const preMatches = tildeFenceHtml.match(/<pre>/g) || [];
  assert.strictEqual(preMatches.length, 1, `Expected 1 <pre> block for tilde fence with blank line, got ${preMatches.length}`);
  assert(tildeFenceHtml.includes('first line\n\nsecond line'), 'Fence content with blank line must be preserved intact');

  // Case 4: Indented code in list item
  const indentedCodeInList = '- item 1\n\n    ```\n    indented code\n    ```';
  const listCodeHtml = parser.parseMarkdownToHtml(indentedCodeInList);
  assert(listCodeHtml.includes('<ul>') && listCodeHtml.includes('<li>') && listCodeHtml.includes('<code>indented code'), `Expected indented code inside list item, got: ${listCodeHtml}`);

  // Case 5: GFM table followed by paragraph
  const tableMd = '| Head A | Head B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n\nFollowing paragraph text.';
  const tableHtml = parser.parseMarkdownToHtml(tableMd);
  assert(tableHtml.includes('<table>') && tableHtml.includes('Cell 1') && tableHtml.includes('<p>Following paragraph text.</p>'), `Table and paragraph should parse correctly: ${tableHtml}`);

  // Case 6: Blockquote with lazy continuation
  const lazyQuoteMd = '> line 1\nlazy continuation line 2';
  const lazyQuoteHtml = parser.parseMarkdownToHtml(lazyQuoteMd);
  const quoteCount = (lazyQuoteHtml.match(/<blockquote>/g) || []).length;
  assert.strictEqual(quoteCount, 1, `Expected 1 blockquote, got ${quoteCount}`);
  assert(lazyQuoteHtml.includes('line 1\nlazy continuation line 2') || (lazyQuoteHtml.includes('line 1') && lazyQuoteHtml.includes('lazy continuation line 2')), `Lazy continuation lines should belong to blockquote: ${lazyQuoteHtml}`);
  console.log('✓ CommonMark fidelity preserved across loose lists, setext headings, tilde fences, nested code, tables, and blockquotes.');

  console.log('\n--- 30. Parser: Text encoding detection and BOM sniffing (F-18) ---');
  // 1. Plain UTF-8
  const plainUtf8 = new TextEncoder().encode('UTF-8 standard text with emoji: 🚀');
  assert.strictEqual(parser.decodeTextBuffer(plainUtf8), 'UTF-8 standard text with emoji: 🚀');

  // 2. UTF-8 with BOM
  const utf8Bom = new Uint8Array([0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('UTF-8 text with BOM')]);
  assert.strictEqual(parser.decodeTextBuffer(utf8Bom), 'UTF-8 text with BOM');

  // 3. UTF-16LE with BOM
  const utf16le = new Uint8Array([0xFF, 0xFE, 0x48, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F, 0x00]); // "Hello"
  assert.strictEqual(parser.decodeTextBuffer(utf16le), 'Hello');

  // 4. UTF-16BE with BOM
  const utf16be = new Uint8Array([0xFE, 0xFF, 0x00, 0x48, 0x00, 0x65, 0x00, 0x6C, 0x00, 0x6C, 0x00, 0x6F]); // "Hello"
  assert.strictEqual(parser.decodeTextBuffer(utf16be), 'Hello');

  // 5. Windows-1252 (contains byte 0x93 which is invalid in UTF-8)
  const win1252Bytes = new Uint8Array([0x93, 0x53, 0x6D, 0x61, 0x72, 0x74, 0x20, 0x51, 0x75, 0x6F, 0x74, 0x65, 0x94]); // “Smart Quote”
  assert.strictEqual(parser.decodeTextBuffer(win1252Bytes), '“Smart Quote”');

  // 6. Empty buffer
  assert.strictEqual(parser.decodeTextBuffer(new Uint8Array(0)), '');
  console.log('✓ Text encoding detection handles UTF-8, BOMs (UTF-8, UTF-16LE, UTF-16BE), and Windows-1252 fallback.');

  console.log('\n--- 31. Settings: Desktop mouse drag theme guard (F-20) ---');
  const registeredEvents = [];
  const gestureEl = {
    addEventListener(evt) {
      registeredEvents.push(evt);
    },
    removeEventListener() {}
  };
  const origTouchPoints = global.navigator?.maxTouchPoints;
  const origUserAgent = global.navigator?.userAgent;
  Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 0, configurable: true, writable: true });
  Object.defineProperty(global.navigator, 'userAgent', { value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', configurable: true, writable: true });
  global.window = {
    addEventListener() {},
    removeEventListener() {}
  };

  const desktopSettingsContext = createAppContext({
    presetTrack: { classList: { toggle() {} } },
    lineHeightInput: { value: '1.85' },
    letterSpacingInput: { value: '0' },
    readerView: gestureEl
  });
  const desktopSettings = createSettings(desktopSettingsContext, {
    ui: mockUI,
    onResetToolbarTimer() {},
    isMobileSheetLayout: () => false
  });
  desktopSettings.attachGestureArea(gestureEl);

  assert(!registeredEvents.includes('mousedown'), 'Desktop should not attach mousedown listener for preset gesture');
  assert(!registeredEvents.includes('mouseup'), 'Desktop should not attach mouseup listener for preset gesture');
  assert(registeredEvents.includes('touchstart'), 'Touch listener should still be attached');

  // When mobile device is simulated
  registeredEvents.length = 0;
  Object.defineProperty(global.navigator, 'maxTouchPoints', { value: 5, configurable: true, writable: true });
  const mobileSettings = createSettings(desktopSettingsContext, {
    ui: mockUI,
    onResetToolbarTimer() {},
    isMobileSheetLayout: () => true
  });
  mobileSettings.attachGestureArea(gestureEl);
  assert(registeredEvents.includes('mousedown'), 'Mobile should attach mousedown listener for preset gesture');
  Object.defineProperty(global.navigator, 'maxTouchPoints', { value: origTouchPoints, configurable: true, writable: true });
  Object.defineProperty(global.navigator, 'userAgent', { value: origUserAgent, configurable: true, writable: true });
  console.log('✓ Desktop mouse drag preset handler safely guarded against accidental theme switching.');

  console.log('\n--- 34. PWA: sw.js precache excludes heavy PDF.js bundles (F-19) ---');
  const swCode = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8');
  assert(!swCode.includes("'./vendor/pdf.min.mjs'"), 'sw.js APP_SHELL must not precache vendor/pdf.min.mjs');
  assert(!swCode.includes("'./vendor/pdf.worker.min.mjs'"), 'sw.js APP_SHELL must not precache vendor/pdf.worker.min.mjs');
  assert(!swCode.includes("'./vendor/pdf.min.js'"), 'sw.js APP_SHELL must not precache vendor/pdf.min.js');
  assert(!swCode.includes("'./vendor/pdf.worker.min.js'"), 'sw.js APP_SHELL must not precache vendor/pdf.worker.min.js');
  assert(swCode.includes("staleWhileRevalidate"), 'sw.js must provide stale-while-revalidate runtime caching for vendor assets');
  console.log('✓ sw.js APP_SHELL precache excludes heavy PDF.js bundles.');

  console.log('\n--- 35. TTS: Fallback estimate timer execution with startingChunkIndex (F-06) ---');
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
    { classList: makeClassList2(), scrollIntoView() {} },
    { classList: makeClassList2(), scrollIntoView() {} }
  ];
  timerContext.runtime.tts.fullSpokenText = 'hello world';
  const estimateTTS = tts.createTTS(timerContext, { ui: mockUI });
  estimateTTS.startSpeech(0);
  assert(uttered, 'Utterance must be dispatched');
  uttered.onstart();
  await new Promise(r => setTimeout(r, 120));
  assert.strictEqual(timerContext.runtime.tts.state, 'playing');
  estimateTTS.stopTTS();
  console.log('✓ TTS startEstimateTimer runs without ReferenceError on startingChunkIndex.');

  console.log('\n--- 36. Presets: Swipe gesture transitions seamlessly between light and dark modes (F-22) ---');
  const swipeContext = createAppContext({
    presetWindow: { getBoundingClientRect: () => ({ width: 300 }), setAttribute() {} },
    presetTrack: { classList: makeClassList2(), querySelectorAll: () => [], style: {} },
    presetDots: { querySelectorAll: () => [] },
    themeSettingsSummary: { textContent: '' },
    gestureHint: { classList: makeClassList2() },
    gestureHintText: { textContent: '' },
    modeLight: { classList: makeClassList2(), setAttribute() {} },
    modeDark: { classList: makeClassList2(), setAttribute() {} },
    readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList2() }
  });
  const swipeSettings = createSettings(swipeContext, {
    ui: mockUI,
    onResetToolbarTimer: () => {},
    isMobileSheetLayout: () => false
  });
  // Start on last preset of Light mode (index 9: Lavender)
  swipeSettings.setMode('light', { presetIndex: 9 });
  assert.strictEqual(swipeContext.state.currentMode, 'light');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 9);
  assert.strictEqual(constants.lightPresets[9].name, 'Lavender');

  // Swipe next -> must transition to Dark mode preset 0 (Night)
  swipeSettings.nextPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'dark', 'Swiping next from last light preset must transition to dark mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 0, 'Swiping next from last light preset must start at index 0');
  assert.strictEqual(constants.darkPresets[0].name, 'Night');

  // Swipe prev -> must transition back to Light mode preset 9 (Lavender)
  swipeSettings.prevPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'light', 'Swiping prev from first dark preset must transition back to light mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, 9, 'Swiping prev from first dark preset must land on last light preset');

  // Start on first preset of Light mode (index 0: Claude)
  swipeSettings.setMode('light', { presetIndex: 0 });
  // Swipe prev -> must transition to Dark mode preset 9 (Ink)
  swipeSettings.prevPreset();
  assert.strictEqual(swipeContext.state.currentMode, 'dark', 'Swiping prev from first light preset must transition to dark mode');
  assert.strictEqual(swipeContext.state.currentPresetIndex, constants.darkPresets.length - 1, 'Swiping prev from first light preset must land on last dark preset');

  // Swipe next -> must transition to Light mode preset 0 (Claude)
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
  const carouselModule = await import('../src/preset-carousel.mjs');
  const carouselInstance = carouselModule.createPresetCarousel(swipeContext, {
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
  const touchCarousel = carouselModule.createPresetCarousel(swipeContext, {
    getPresets: () => constants.lightPresets,
    applyPreset: () => {},
    setMode: () => {}
  });
  let registeredTouchListeners = {};
  const mockGestureTarget = {
    addEventListener(type, cb) {
      registeredTouchListeners[type] = cb;
    }
  };
  touchCarousel.attachGestureArea(mockGestureTarget);
  assert(registeredTouchListeners.touchstart, 'touchstart must be registered');
  assert(registeredTouchListeners.touchend, 'touchend must be registered');

  // Simulate swipe left with clientX coordinates (100 -> 30, distanceX = -70px, elapsed = 200ms)
  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  registeredTouchListeners.touchend({
    changedTouches: [{ clientX: 30, clientY: 52 }],
    target: makeNodeWithClosest('p')
  });
  // Next preset should have been called, changing currentPresetIndex from 0 to 1
  assert.strictEqual(swipeContext.state.currentPresetIndex, 1, 'Valid horizontal clientX swipe must advance preset');

  // Simulate swipe right with screenX fallback (clientX undefined, 100 -> 180, distanceX = +80px)
  registeredTouchListeners.touchstart({
    touches: [{ screenX: 100, screenY: 50 }],
    target: makeNodeWithClosest('p')
  });
  registeredTouchListeners.touchend({
    changedTouches: [{ screenX: 180, screenY: 52 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.currentPresetIndex, 0, 'Valid horizontal screenX swipe right must return to prev preset');

  // Verify multi-touch cancellation in touchmove
  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.isGesture, true, 'isGesture must be true after single touchstart');
  registeredTouchListeners.touchmove({
    touches: [{ clientX: 120, clientY: 50 }, { clientX: 200, clientY: 50 }]
  });
  assert.strictEqual(swipeContext.state.isGesture, false, 'Multi-touch touchmove must cancel isGesture');

  // Verify touchcancel resets isGesture
  registeredTouchListeners.touchstart({
    touches: [{ clientX: 100, clientY: 50 }],
    target: makeNodeWithClosest('p')
  });
  assert.strictEqual(swipeContext.state.isGesture, true, 'isGesture must be true after touchstart');
  registeredTouchListeners.touchcancel();
  assert.strictEqual(swipeContext.state.isGesture, false, 'touchcancel must reset isGesture');
  console.log('✓ Touch coordinate resolution with clientX/screenX fallback verified.');

  console.log('\n--- 39. Presets: Carousel drag start and card click selection on presetWindow ---');
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
    getAttribute: (attr) => attr === 'aria-label' ? currentAriaLabel : null,
    setAttribute: (attr, val) => { if (attr === 'aria-label') currentAriaLabel = val; },
    getBoundingClientRect: () => ({ width: 300 }),
    closest: (sel) => sel.includes('#toolbar') ? { id: 'toolbar' } : null
  };
  const testCarouselContext = createAppContext({
    presetWindow: testPresetWindow,
    presetTrack: { classList: makeClassList2(), querySelectorAll: () => [], style: {} },
    presetDots: { innerHTML: '', querySelectorAll: () => [] },
    themeSettingsSummary: { textContent: '' },
    gestureHint: { classList: makeClassList2() },
    gestureHintText: { textContent: '' },
    modeLight: { classList: makeClassList2(), setAttribute() {}, addEventListener() {} },
    modeDark: { classList: makeClassList2(), setAttribute() {}, addEventListener() {} },
    readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList2(), addEventListener() {} }
  });
  const testCarouselSettings = createSettings(testCarouselContext, {
    ui: mockUI,
    onResetToolbarTimer: () => {},
    isMobileSheetLayout: () => false
  });
  testCarouselSettings.bindEvents();

  // Drag on presetWindow
  testPresetWindowListeners.mousedown({ clientX: 200, target: testPresetWindow });
  assert.strictEqual(testCarouselContext.state.isDraggingCarousel, true, 'mousedown on presetWindow must start carousel drag');
  testWindowListeners.mousemove({ clientX: 100 });
  testWindowListeners.mouseup();
  assert.strictEqual(testCarouselContext.state.isDraggingCarousel, false);
  assert(testCarouselContext.state.lastCarouselDragDistance > 5, 'lastCarouselDragDistance must reflect drag distance');

  // Suppressed card click
  const mockCard1 = {
    nodeType: 1,
    closest: (sel) => sel === '.preset-card' ? mockCard1 : (sel.includes('#toolbar') ? { id: 'toolbar' } : null),
    getAttribute: (attr) => attr === 'data-index' ? '1' : null
  };
  testPresetWindowListeners.click({ target: mockCard1 });
  assert.strictEqual(testCarouselContext.state.lastCarouselDragDistance, 0, 'click suppression must reset lastCarouselDragDistance');

  // Card 2 click applies preset 2 (Stark)
  const mockCard2 = {
    nodeType: 1,
    closest: (sel) => sel === '.preset-card' ? mockCard2 : (sel.includes('#toolbar') ? { id: 'toolbar' } : null),
    getAttribute: (attr) => attr === 'data-index' ? '2' : null
  };
  testPresetWindowListeners.click({ target: mockCard2 });
  assert.strictEqual(testCarouselContext.state.currentPresetIndex, 2, 'clicking preset card must apply preset index 2');
  assert(currentAriaLabel.includes('Stark'), 'aria-label must update to Stark');
  console.log('✓ Preset carousel drag and card click selection verified on presetWindow.');

  console.log('\n--- 40. DOM Tokenization: Preserves inter-word and trailing whitespace in DOM textContent ---');
  class MockDOMNode {
    constructor(nodeType, nodeValue = null, tagName = null) {
      this.nodeType = nodeType;
      this.nodeValue = nodeValue;
      this.tagName = tagName;
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = {};
      this.className = '';
    }
    get parentElement() {
      return this.nodeType === 1 ? this : this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.childNodes.push(child);
      return child;
    }
    replaceChild(newChild, oldChild) {
      const index = this.childNodes.indexOf(oldChild);
      if (index === -1) return;
      if (newChild.nodeType === 11) {
        const children = [...newChild.childNodes];
        children.forEach(child => { child.parentNode = this; });
        this.childNodes.splice(index, 1, ...children);
        newChild.childNodes = [];
      } else {
        newChild.parentNode = this;
        this.childNodes.splice(index, 1, newChild);
      }
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] || null; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
    closest(selector) {
      const tags = selector.split(',').map(value => value.trim().toUpperCase());
      let current = this;
      while (current) {
        if (current.tagName && tags.includes(current.tagName.toUpperCase())) return current;
        current = current.parentNode;
      }
      return null;
    }
    get textContent() {
      return this.nodeType === 3 ? this.nodeValue : this.childNodes.map(child => child.textContent).join('');
    }
    set textContent(value) {
      this.childNodes = [new MockDOMNode(3, value)];
      this.childNodes[0].parentNode = this;
    }
  }

  class MockDOMDoc {
    createTextNode(text) { return new MockDOMNode(3, text); }
    createElement(tag) { return new MockDOMNode(1, null, tag.toUpperCase()); }
    createDocumentFragment() { return new MockDOMNode(11); }
    createTreeWalker(root, showWhat, filter) {
      const nodes = [];
      const visit = node => {
        if (node.nodeType === 3) {
          if (!filter || filter.acceptNode(node) !== 3) nodes.push(node);
          return;
        }
        node.childNodes.forEach(visit);
      };
      visit(root);
      let index = -1;
      return {
        currentNode: null,
        nextNode() {
          index += 1;
          this.currentNode = nodes[index] || null;
          return Boolean(this.currentNode);
        }
      };
    }
  }

  const tokDoc = new MockDOMDoc();
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
  console.log('✓ Preserved inter-word and trailing whitespace in DOM textContent after tokenization.');

  console.log('\n--- 41. Presets: Default text color avoids clobbering CSS theme colors ---');
  [...constants.lightPresets, ...constants.darkPresets].forEach(preset => {
    assert.strictEqual(preset.color, 'default', `Preset ${preset.name} must use default color so CSS theme --reader-text-color applies`);
  });
  console.log('✓ All light and dark presets preserve CSS theme text colors.');

  console.log('\n--- 42. Carousel: Right-click and touchcancel do not stick drag loop ---');
  const dragGuardListeners = {};
  const dragGuardWindow = {
    nodeType: 1,
    addEventListener: (t, cb) => { dragGuardListeners[t] = cb; },
    getAttribute: () => '',
    setAttribute: () => {},
    getBoundingClientRect: () => ({ width: 300 }),
    closest: () => null
  };
  const dragGuardContext = createAppContext({
    presetWindow: dragGuardWindow,
    presetTrack: { classList: makeClassList2(), querySelectorAll: () => [], style: {} },
    presetDots: { innerHTML: '', querySelectorAll: () => [] },
    themeSettingsSummary: { textContent: '' },
    modeLight: { classList: makeClassList2(), setAttribute() {}, addEventListener() {} },
    modeDark: { classList: makeClassList2(), setAttribute() {}, addEventListener() {} },
    readerContent: { style: { setProperty() {}, removeProperty() {} }, classList: makeClassList2(), addEventListener() {} }
  });
  const dragGuardSettings = createSettings(dragGuardContext, {
    ui: mockUI,
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
  console.log('✓ Carousel drag ignores non-primary mouse buttons and cleans up on touchcancel.');

  console.log('\n--- 43. TTS: Short desktop resume estimate timer, paused settings changes, and external cancel ---');
  const ttsFixSpans = [
    { classList: makeClassList2(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) },
    { classList: makeClassList2(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) },
    { classList: makeClassList2(), scrollIntoView() {}, getBoundingClientRect: () => ({ top: 100, bottom: 120 }) }
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
    readerContent: { querySelectorAll: () => [], contains: () => true },
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
  console.log('✓ TTS desktop resume estimate timer, paused setting updates, and external cancel behavior verified.');

  console.log('\n--- 44. DOM Tokenization: Idempotency, table cell breaks, and trailing punctuation ---');
  class RichMockNode extends MockDOMNode {
    querySelectorAll(selector) {
      const results = [];
      const visit = node => {
        if (node !== this && node.nodeType === 1 && selector === '.tts-word' && node.className && node.className.split(/\s+/).includes('tts-word')) {
          results.push(node);
        }
        node.childNodes.forEach(visit);
      };
      visit(this);
      return results;
    }
  }
  const richDoc = {
    createTextNode: text => new RichMockNode(3, text),
    createElement: tag => new RichMockNode(1, null, tag.toUpperCase()),
    createDocumentFragment: () => new RichMockNode(11),
    createTreeWalker: tokDoc.createTreeWalker.bind(tokDoc)
  };
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
  console.log('✓ DOM tokenization idempotency, table cell breaks, and trailing punctuation verified.');

  console.log('\n====================================================');
  console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY');
  console.log('====================================================\n');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
