'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { MockDocument } = require('./mock_dom');

(async () => {
  const parser = await import('../src/parser.mjs');
  const tts = await import('../src/tts.mjs');
  const constants = await import('../src/constants.mjs');
  const { createAppContext } = await import('../src/context.mjs');
  const scriptSource = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

  console.log('--- Running Reader & TTS Unit and Integration Tests ---');

  const rangeInputs = [...indexSource.matchAll(/<input\b[^>]*\btype="range"[^>]*>/g)];
  assert(rangeInputs.length > 0, 'Reader settings should declare range inputs');
  rangeInputs.forEach(([markup]) => {
    const attributes = Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
    const min = Number(attributes.min);
    const step = Number(attributes.step);
    const value = Number(attributes.value);
    assert(Number.isFinite(min) && Number.isFinite(step) && step > 0 && Number.isFinite(value), `Range input must declare finite min, step, and value: ${markup}`);
    const stepOffset = (value - min) / step;
    assert(Math.abs(stepOffset - Math.round(stepOffset)) < 1e-8, `Range input default ${value} must align with step ${step} from min ${min}: ${markup}`);
  });
  console.log('✓ Check 0: Range input defaults align with their declared steps.');

  assert(!scriptSource.includes('.substr('), 'script.js should not contain deprecated String.prototype.substr calls');
  assert(scriptSource.includes("import('./src/app.mjs')"), 'script.js should dynamically import the ES module application entry');
  assert(!scriptSource.includes('speechGeneration'), 'speech session state should not leak into the compatibility shim');
  const initialContext = createAppContext({});
  assert.strictEqual(initialContext.state.smartHeadings, true, 'state.smartHeadings must initialize to true');
  assert.strictEqual(initialContext.runtime.reader.activeRenderId, 0, 'activeRenderId must initialize to 0');
  console.log('✓ Check 1: Compatibility entry and module contract validation passed.');

  const short = 'This is a short sample sentence.';
  const shortChunks = tts.chunkText(short);
  assert.deepStrictEqual(shortChunks, [{ text: short, start: 0, end: short.length }]);

  const paragraph = 'The quick brown fox jumps over the lazy dog repeatedly to test long character chunking in our unified reading application. Every sentence is split cleanly on word boundaries so that speech synthesis engines never hit the Chromium 15-second audio drop limit.';
  const longChunks = tts.chunkText(paragraph, 100, 190);
  assert(longChunks.length > 1, 'Long text should produce multiple chunks');
  longChunks.forEach(chunk => {
    assert(chunk.text.length <= 190, `Chunk length ${chunk.text.length} exceeds 190 target`);
    assert(chunk.start >= 100, 'Base offset was not applied correctly');
    assert.strictEqual(chunk.end, chunk.start + chunk.text.length, 'Chunk start + length should equal chunk end');
    assert(!/^\s/.test(chunk.text), 'Chunk should not start with leading whitespace');
  });

  const giantChunks = tts.chunkText('A'.repeat(250));
  assert.deepStrictEqual(giantChunks.map(chunk => chunk.text.length), [190, 60]);
  console.log('✓ Check 2: 190-character chunking algorithm passed.');

  const parserInstance = parser.createParser();
  assert.strictEqual(typeof parserInstance.enforceExtractedTextLimit, 'function');
  assert.strictEqual(typeof parserInstance.parseMarkdownToHtml, 'function');
  console.log('✓ Check 3: Parser factory contract passed.');

  const mockVoices = [
    { name: 'Google US English', lang: 'en-US', voiceURI: 'google-en-us', default: false },
    { name: 'Google US English', lang: 'en-US', voiceURI: 'google-en-us-dup', default: false },
    { name: 'Alex', lang: 'en-US', voiceURI: 'alex', default: true },
    { name: 'Anna', lang: 'de-DE', voiceURI: 'anna', default: false }
  ];
  const sorted = tts.deduplicateAndSortVoices(mockVoices);
  assert.strictEqual(sorted.length, 3);
  assert.strictEqual(sorted[0].name, 'Alex');
  assert.strictEqual(tts.resolveVoiceIndex(sorted, 'anna', 'en-US'), sorted.findIndex(v => v.voiceURI === 'anna'));
  assert.strictEqual(tts.resolveVoiceIndex(sorted, 'non-existent', 'de-DE'), sorted.findIndex(v => v.lang === 'de-DE'));
  console.log('✓ Check 4: Production voice deduplication and selection passed.');

  global.NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
  const documentObject = new MockDocument();
  const article = documentObject.createElement('article');
  const heading = documentObject.createElement('h1');
  heading.appendChild(documentObject.createTextNode('Chapter One'));
  article.appendChild(heading);
  const paragraphNode = documentObject.createElement('p');
  paragraphNode.appendChild(documentObject.createTextNode('This is '));
  const strong = documentObject.createElement('strong');
  strong.appendChild(documentObject.createTextNode('bold text'));
  paragraphNode.appendChild(strong);
  paragraphNode.appendChild(documentObject.createTextNode(' and a link.'));
  article.appendChild(paragraphNode);

  const tokenized = tts.tokenizeReaderDOM(article, documentObject);
  assert.strictEqual(tokenized.spans.length, tokenized.meta.length);
  assert(tokenized.meta.length >= 9);
  tokenized.meta.forEach(word => {
    assert.strictEqual(tokenized.text.slice(word.start, word.end), word.text);
    assert.strictEqual(word.element.getAttribute('data-word-idx'), String(word.index));
  });
  assert.strictEqual(tokenized.spans.find(span => span.textContent === 'bold').parentNode.tagName, 'STRONG');
  console.log('✓ Check 5: Production DOM word tokenization and offset mapping passed.');

  const markdown = [
    '# Heading',
    '',
    'HELLO SECTION',
    '',
    'Paragraph with **bold**, *emphasis*, `code`, [safe](https://example.com), and [bad](javascript:alert(1)).',
    '',
    '```',
    '<script>literal</script>',
    '```',
    '',
    '- first item',
    '1. ordered item',
    '',
    '> quoted text'
  ].join('\n');
  const html = parser.parseMarkdownToHtml(markdown);
  assert(html.includes('<h1 id="heading">Heading</h1>'));
  assert(html.includes('<h2 id="hello-section">HELLO SECTION</h2>'));
  assert(html.includes('<strong>bold</strong>'));
  assert(html.includes('<em>emphasis</em>'));
  assert(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">safe</a>'));
  assert(!html.includes('javascript:'));
  assert(html.includes('&lt;script&gt;literal&lt;/script&gt;'));
  assert(html.includes('<ol><li>ordered item</li></ol>'));
  console.log('✓ Check 6: Production Markdown rendering and sanitization passed.');

  assert.strictEqual(parser.enforceExtractedTextLimit('valid text'), 'valid text');
  assert.throws(() => parser.enforceExtractedTextLimit('x'.repeat(1_000_001)), /too much extracted text/);
  console.log('✓ Check 7: Extracted-text limit validation passed.');

  assert.strictEqual(constants.lightPresets.length, 10);
  assert.strictEqual(constants.darkPresets.length, 10);
  assert.strictEqual(constants.VALID_THEMES.size, 20);
  const expectedLightNames = ['Claude', 'Zen', 'Stark', 'Book', 'Classic', 'Kindle', 'GitHub', 'Amber', 'Newspaper', 'Lavender'];
  const expectedDarkNames = ['Night', 'Void', 'Carbon', 'Midnight', 'Obsidian', 'Dracula', 'Nord', 'Catppuccin', 'Forest', 'Ink'];
  assert.deepStrictEqual(constants.lightPresets.map(preset => preset.name), expectedLightNames);
  assert.deepStrictEqual(constants.darkPresets.map(preset => preset.name), expectedDarkNames);
  [...constants.lightPresets, ...constants.darkPresets].forEach(preset => {
    assert(constants.VALID_THEMES.has(preset.theme));
    assert(preset.name && preset.font && preset.theme && preset.desc);
  });
  console.log('✓ Check 8: Production preset and theme inventory passed.');

  console.log('----------------------------------------------------');
  console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY!');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
