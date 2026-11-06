'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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
  assert.strictEqual(initialContext.state.textSource, 'paste', 'state.textSource must initialize to paste');
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

  const utf8Buffer = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
  assert.strictEqual(parser.decodeTextBuffer(utf8Buffer), 'Hello');
  const utf8BomBuffer = new Uint8Array([0xEF, 0xBB, 0xBF, 0x48, 0x69]);
  assert.strictEqual(parser.decodeTextBuffer(utf8BomBuffer), 'Hi');
  const utf16leBomBuffer = new Uint8Array([0xFF, 0xFE, 0x48, 0x00, 0x69, 0x00]);
  assert.strictEqual(parser.decodeTextBuffer(utf16leBomBuffer), 'Hi');
  const utf16beBomBuffer = new Uint8Array([0xFE, 0xFF, 0x00, 0x48, 0x00, 0x69]);
  assert.strictEqual(parser.decodeTextBuffer(utf16beBomBuffer), 'Hi');
  const win1252Buffer = new Uint8Array([0x93, 0x48, 0x69, 0x94]);
  assert.strictEqual(parser.decodeTextBuffer(win1252Buffer), '“Hi”');
  const parserInstance = parser.createParser(initialContext);
  assert.strictEqual(typeof parserInstance.enforceExtractedTextLimit, 'function');
  assert.strictEqual(typeof parserInstance.parseMarkdownToHtml, 'function');
  console.log('✓ Check 3: Text buffer decoding (UTF-8, BOMs, Windows-1252) and parser factory passed.');

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

  class MockNode {
    constructor(nodeType, nodeValue = null, tagName = null) {
      this.nodeType = nodeType;
      this.nodeValue = nodeValue;
      this.tagName = tagName;
      this.childNodes = [];
      this.parentNode = null;
      this.attributes = {};
      this.classList = {
        values: new Set(),
        add: value => this.classList.values.add(value),
        remove: value => this.classList.values.delete(value),
        has: value => this.classList.values.has(value)
      };
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
      this.childNodes = [new MockNode(3, value)];
      this.childNodes[0].parentNode = this;
    }
  }

  class MockDocument {
    createTextNode(text) { return new MockNode(3, text); }
    createElement(tag) { return new MockNode(1, null, tag.toUpperCase()); }
    createDocumentFragment() { return new MockNode(11); }
    createTreeWalker(root, showWhat, filter) {
      const nodes = [];
      const visit = node => {
        if (node.nodeType === 3) {
          if (!filter || filter.acceptNode(node) !== NodeFilter.FILTER_SKIP) nodes.push(node);
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
  assert(html.includes('<h1 id="heading-0">Heading</h1>'));
  assert(html.includes('<h2 id="heading-2">HELLO SECTION</h2>'));
  assert(html.includes('<strong>bold</strong>'));
  assert(html.includes('<em>emphasis</em>'));
  assert(html.includes('<a href="https://example.com" target="_blank" rel="noopener noreferrer">safe</a>'));
  assert(!html.includes('javascript:'));
  assert(html.includes('&lt;script&gt;literal&lt;/script&gt;'));
  assert(html.includes('<ol><li>ordered item</li></ol>'));
  console.log('✓ Check 6: Production Markdown rendering and sanitization passed.');

  assert.strictEqual(parser.getExtension('sample.MARKDOWN'), 'markdown');
  assert.strictEqual(parser.enforceExtractedTextLimit('valid text'), 'valid text');
  assert.throws(() => parser.enforceExtractedTextLimit('x'.repeat(1_000_001)), /too much extracted text/);
  console.log('✓ Check 7: Production file helpers and extracted-text limits passed.');

  assert.strictEqual(constants.lightPresets.length, 10);
  assert.strictEqual(constants.darkPresets.length, 10);
  assert.strictEqual(constants.VALID_THEMES.size, 20);
  const expectedLightNames = ['Claude', 'Zen', 'Stark', 'Book', 'Classic', 'Kindle', 'GitHub', 'Amber', 'Newspaper', 'Lavender'];
  const expectedDarkNames = ['Night', 'Void', 'Carbon', 'Midnight', 'Obsidian', 'Dracula', 'Nord', 'Catppuccin', 'Forest', 'Ink'];
  assert.deepStrictEqual(constants.lightPresets.map(preset => preset.name), expectedLightNames);
  assert.deepStrictEqual(constants.darkPresets.map(preset => preset.name), expectedDarkNames);
  [...constants.lightPresets, ...constants.darkPresets].forEach(preset => {
    assert(constants.VALID_THEMES.has(preset.theme));
    assert(preset.name && preset.font && preset.theme && preset.color && preset.desc);
  });
  console.log('✓ Check 8: Production preset and theme inventory passed.');

  console.log('----------------------------------------------------');
  console.log('ALL UNIT & INTEGRATION TESTS PASSED SUCCESSFULLY!');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
