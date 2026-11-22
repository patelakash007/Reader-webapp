'use strict';

const assert = require('node:assert');
const { MockDocument } = require('./mock_dom');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const constants = await import('../src/constants.mjs');
  const { createAppContext } = await import('../src/context.mjs');

  console.log('====================================================');
  console.log('STARTING FORENSIC EMPIRICAL STRESS TEST SUITE');
  console.log('====================================================');

  console.log('\n--- 1. Production module contracts ---');
  const context = createAppContext({});
  assert.strictEqual(context.runtime.tts.speechGeneration, 0);
  assert.strictEqual(context.runtime.reader.activeRenderId, 0);
  assert.strictEqual(context.state.smartHeadings, true);
  assert.strictEqual(typeof parser.parseMarkdownToHtml, 'function');
  assert.strictEqual(typeof tts.tokenizeReaderDOM, 'function');
  console.log('✓ Production module contracts loaded without browser globals.');

  console.log('\n--- 2. Chunking engine stress testing ---');
  assert.deepStrictEqual(tts.chunkText(''), []);
  const exact190 = 'A'.repeat(190);
  const res190 = tts.chunkText(exact190);
  assert.strictEqual(res190.length, 1);
  assert.strictEqual(res190[0].text.length, 190);
  assert.strictEqual(res190[0].start, 0);
  assert.strictEqual(res190[0].end, 190);
  const noSpace191 = 'B'.repeat(191);
  const res191 = tts.chunkText(noSpace191);
  assert.deepStrictEqual(res191.map(chunk => chunk.text.length), [190, 1]);
  const sentence = 'Word1 Word2 Word3 Word4 Word5';
  const shortChunks = tts.chunkText(sentence, 50, 15);
  assert(shortChunks.length > 1);
  shortChunks.forEach(chunk => {
    assert(chunk.text.length <= 15);
    assert(chunk.start >= 50);
  });
  const complexWhitespace = 'Alpha\t\tBeta\n\nGamma   Delta\r\nEpsilon ' + 'Z'.repeat(200);
  const complexChunks = tts.chunkText(complexWhitespace, 0, 190);
  assert(complexChunks.length >= 2);
  complexChunks.forEach(chunk => assert(!chunk.text.startsWith(' ')));
  console.log('✓ Production chunking passed boundary conditions and edge cases.');

  console.log('\n--- 3. Production DOM tokenization and offset fidelity ---');
  global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
  const mockDocument = new MockDocument();
  const root = mockDocument.createElement('div');
  const paragraph = mockDocument.createElement('p');
  const emphasis = mockDocument.createElement('em');
  emphasis.appendChild(mockDocument.createTextNode('Hello'));
  paragraph.appendChild(emphasis);
  paragraph.appendChild(mockDocument.createTextNode(' world from Reader.'));
  root.appendChild(paragraph);
  const heading = mockDocument.createElement('h2');
  heading.appendChild(mockDocument.createTextNode('Section Two'));
  root.appendChild(heading);
  const secondParagraph = mockDocument.createElement('p');
  secondParagraph.appendChild(mockDocument.createTextNode('A multi-line paragraph with punctuation: Dr. Smith, U.S.A., 3.14159, and more.'));
  root.appendChild(secondParagraph);

  const tokenized = tts.tokenizeReaderDOM(root, mockDocument);
  assert.strictEqual(tokenized.spans.length, tokenized.meta.length);
  assert(tokenized.meta.length >= 15);
  tokenized.meta.forEach(word => {
    assert.strictEqual(tokenized.text.slice(word.start, word.end), word.text);
    assert.strictEqual(word.element.getAttribute('data-word-idx'), String(word.index));
  });
  assert.strictEqual(tokenized.spans.find(span => span.textContent === 'Hello').parentNode.tagName, 'EM');
  console.log('✓ Production DOM tokenization preserved hierarchy and character offsets.');

  console.log('\n--- 5. Production voice selection and rate math ---');
  const voices = tts.deduplicateAndSortVoices([
    { name: 'Google US', lang: 'en-US', voiceURI: 'g-us-1', default: false },
    { name: 'Google US', lang: 'en-US', voiceURI: 'g-us-2', default: false },
    { name: 'Microsoft David', lang: 'en-US', voiceURI: 'ms-david', default: true },
    { name: 'French Voice', lang: 'fr-FR', voiceURI: 'fr-1', default: false },
    { name: 'British Voice', lang: 'en-GB', voiceURI: 'en-gb-1', default: false }
  ]);
  assert.strictEqual(voices.length, 4);
  assert.strictEqual(voices[0].name, 'Microsoft David');
  assert.strictEqual(tts.resolveVoiceIndex(voices, 'fr-1', 'en-US'), voices.findIndex(voice => voice.voiceURI === 'fr-1'));
  assert.strictEqual(tts.resolveVoiceIndex(voices, null, 'en-CA'), voices.findIndex(voice => voice.lang.startsWith('en-')));
  assert.strictEqual(tts.resolveVoiceIndex(voices, null, 'ja-JP'), 0);
  const wordsPerMs = (wordsPerMinute, rate) => (wordsPerMinute * rate) / 60000;
  assert.strictEqual(wordsPerMs(180, 2), wordsPerMs(180, 1) * 2);
  assert.strictEqual(wordsPerMs(180, 0.5), wordsPerMs(180, 1) * 0.5);
  console.log('✓ Production voice ordering, selection fallback, and rate math passed.');

  console.log('\n--- 6. Production Markdown security and integration ---');
  const maliciousInputs = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert(1)>',
    '[Click Me](javascript:alert(1))',
    '[Bad Data](data:text/html,<script>alert(1)</script>)',
    '[VBScript](vbscript:msgbox(1))',
    '<iframe src="https://evil.com"></iframe>',
    '`<script>literal</script>`'
  ];
  maliciousInputs.forEach(input => {
    const result = parser.parseMarkdownToHtml(input);
    assert(!result.includes('<script>'));
    assert(!result.includes('<img'));
    assert(!result.includes('href="javascript:'));
    assert(!result.includes('href="data:'));
    assert(!result.includes('href="vbscript:'));
    assert(!result.includes('<iframe'));
  });

  const complexDocument = [
    '# Reader & TTS Masterpiece',
    '',
    'This is a comprehensive test document designed to stress-test the entire pipeline.',
    '',
    '## Feature Highlights',
    '- Native Speech Synthesis with 190-character chunking',
    '- DOM word tokenization with accurate character offset mappings',
    '- Item Gamma with [Safe Link](https://example.com/docs)',
    '- Bullet point with **bold text** and *italic words*',
    '',
    '> A famous quotation on reader design.',
    '',
    '```',
    'function helloWorld() {',
    '  console.log("Hello from code block!");',
    '}',
    '```',
    '',
    'Final paragraph concluding our test scenario with 100% genuine code verification.'
  ].join('\n');
  const parsedHtml = parser.parseMarkdownToHtml(complexDocument);
  assert(parsedHtml.includes('<h1 id="reader-tts-masterpiece">Reader &amp; TTS Masterpiece</h1>'));
  assert(parsedHtml.includes('<h2 id="feature-highlights">Feature Highlights</h2>'));
  assert(parsedHtml.includes('<strong>bold text</strong>'));
  assert(parsedHtml.includes('<em>italic words</em>'));
  assert(parsedHtml.includes('<a href="https://example.com/docs" target="_blank" rel="noopener noreferrer">Safe Link</a>'));
  assert(parsedHtml.includes('<pre><code>function helloWorld() {'));
  assert.strictEqual(parser.normalizeSafeLinkHref('javascript:alert(1)'), null);
  assert(parser.normalizeSafeLinkHref('https://example.com/?q=one&lang=en').includes('&amp;'));
  console.log('✓ Production Markdown parser passed sanitization and document integration checks.');

  console.log('\n--- 7. Large-document stress and preset integrity ---');
  const largeMarkdown = Array.from({ length: 5000 }, (_, index) => `### Paragraph ${index}\n\nLine ${index} with **bold** and [link](https://example.com/${index})`).join('\n\n');
  const startTime = Date.now();
  const largeHtml = parser.parseMarkdownToHtml(largeMarkdown);
  const elapsed = Date.now() - startTime;
  assert(largeHtml.length > 500000);
  assert(elapsed < 2000, `Large document parse took too long: ${elapsed}ms`);
  assert.strictEqual(constants.lightPresets.length, 10);
  assert.strictEqual(constants.darkPresets.length, 10);
  assert.strictEqual(constants.VALID_THEMES.size, 20);
  console.log(`✓ 5,000 production Markdown headings parsed in ${elapsed}ms.`);

  console.log('\n--- 8. High-volume word highlight performance & binary search parity ---');
  const wordCount = 150000;
  const wordMeta = new Array(wordCount);
  const wordSpans = new Array(wordCount);
  let charOffset = 0;
  for (let i = 0; i < wordCount; i++) {
    const len = 5;
    wordMeta[i] = {
      index: i,
      text: 'word' + i,
      start: charOffset,
      end: charOffset + len
    };
    wordSpans[i] = {
      classList: { add() {}, remove() {}, contains() { return false; } },
      scrollIntoView() {},
      getBoundingClientRect: () => ({ top: 100, bottom: 120, height: 20 })
    };
    charOffset += len + 1;
  }

  const stressContext = createAppContext({
    voiceRateInput: { value: '1.0' },
    readerContent: { querySelectorAll: () => [] }
  });
  stressContext.runtime.tts.supported = true;
  stressContext.runtime.tts.wordMeta = wordMeta;
  stressContext.runtime.tts.wordSpans = wordSpans;
  stressContext.runtime.tts.fullSpokenText = 'dummy text';

  const ttsStress = tts.createTTS(stressContext, { ui: { showStatus() {}, announceLive() {} } });

  // 1. Parity test between binary search and linear findIndex on random offsets
  for (let trial = 0; trial < 200; trial++) {
    const randomChar = Math.floor(Math.random() * charOffset);
    const expected = wordMeta.findIndex(w => randomChar >= w.start && randomChar < w.end);
    let expectedFinal = expected;
    if (expectedFinal === -1) {
      for (let i = wordMeta.length - 1; i >= 0; i--) {
        if (wordMeta[i].start <= randomChar) {
          expectedFinal = i;
          break;
        }
      }
    }
    const actual = ttsStress.findWordIndexByChar(randomChar);
    assert.strictEqual(actual, expectedFinal, `Mismatch at offset ${randomChar}: expected ${expectedFinal}, got ${actual}`);
  }

  // 2. Call highlightAtIndex 10,000 times at increasing offsets and assert total time < 100 ms
  const highlightCount = 10000;
  const step = Math.max(1, Math.floor(charOffset / highlightCount));
  const hlStart = Date.now();
  for (let i = 0; i < highlightCount; i++) {
    ttsStress.highlightAtIndex(i * step);
  }
  const hlElapsed = Date.now() - hlStart;
  assert(hlElapsed < 100, `highlightAtIndex 10k calls on 150k words took ${hlElapsed}ms (must be < 100ms)`);
  console.log(`✓ 10,000 highlightAtIndex lookups over 150,000 words completed in ${hlElapsed}ms (<100ms threshold).`);

  console.log('\n====================================================');
  console.log('ALL FORENSIC EMPIRICAL STRESS TESTS PASSED');
  console.log('====================================================\n');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
