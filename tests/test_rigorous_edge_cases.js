'use strict';

const assert = require('node:assert/strict');

(async () => {
  const { parseMarkdownToHtml, normalizeSafeLinkHref } = await import('../src/markdown-parser.mjs');
  const { chunkText } = await import('../src/tts-core.mjs');
  const { MAX_EXTRACTED_TEXT_CHARS } = await import('../src/constants.mjs');
  const { cleanupLegacyBrowserStorage } = await import('../src/storage.mjs');
  const { createTTS } = await import('../src/tts-controller.mjs');
  const { createAppContext } = await import('../src/context.mjs');

  console.log('=== RIGOROUS BOUNDARY & STRESS TESTS ===\n');

  // Test 1: Max paste limit boundary handling
  console.log('--- 1. Input Capacity & Max Character Boundaries ---');
  assert.equal(MAX_EXTRACTED_TEXT_CHARS, 1000000, 'MAX_EXTRACTED_TEXT_CHARS must be exactly 1,000,000');

  // Verify parsing of a large character document (500k chars repetition of mixed paragraphs)
  const paragraph = 'This is a test paragraph with **bold**, *italics*, and [links](https://example.com).\n\n';
  const repeatCount = Math.floor(500000 / paragraph.length);
  const largeText = paragraph.repeat(repeatCount);
  const startTime = Date.now();
  const parsedLarge = parseMarkdownToHtml(largeText);
  const duration = Date.now() - startTime;
  assert(parsedLarge.length > 0, 'Parsed markdown output must not be empty');
  console.log(`✓ 500k character markdown parsed safely in ${duration}ms`);

  // Test 2: Aggressive XSS & Security Vectors
  console.log('\n--- 2. Aggressive XSS & Markdown Sanitization Vectors ---');
  const maliciousVectors = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(document.cookie)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox("XSS")',
    '<a href="javascript:alert(1)">Click</a>',
    '[Click me](javascript:alert(1))',
    '[Click me](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)',
    '[Click me](vbscript:alert(1))',
    '![image](https://evil.com/image.png)',
    '![image](javascript:alert(1))',
    '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>'
  ];

  for (const vector of maliciousVectors) {
    const rendered = parseMarkdownToHtml(vector);
    // Raw HTML tags must either be escaped (&lt;script...&gt;) or stripped, never executed as live tags
    assert(!/<script\b/i.test(rendered), `Sanitization failed on unescaped script tag: ${vector}`);
    assert(!/<img\b[^>]*\bonerror=/i.test(rendered), `Sanitization failed on unescaped onerror handler: ${vector}`);
    assert(!/<[^>]+\bonload=/i.test(rendered), `Sanitization failed on unescaped onload handler: ${vector}`);
    assert(!/href=["']?\s*javascript:/i.test(rendered), `Sanitization failed on javascript: URI: ${vector}`);
    assert(!/href=["']?\s*data:text\/html/i.test(rendered), `Sanitization failed on data: URI: ${vector}`);
    assert(!/href=["']?\s*vbscript:/i.test(rendered), `Sanitization failed on vbscript: URI: ${vector}`);
    assert(!/<img\b/i.test(rendered), `Images should not render active <img> tags: ${vector}`);
  }

  assert.equal(normalizeSafeLinkHref('javascript:alert(1)'), null);
  assert.equal(normalizeSafeLinkHref('data:text/html;base64,abc'), null);
  assert.equal(normalizeSafeLinkHref('vbscript:run()'), null);
  assert.equal(normalizeSafeLinkHref('https://example.com/safe'), 'https://example.com/safe');
  assert.equal(normalizeSafeLinkHref('/local/path'), '/local/path');
  assert.equal(normalizeSafeLinkHref('#heading'), '#heading');
  console.log('✓ All aggressive XSS and dangerous URL injection vectors sanitized cleanly');

  // Test 3: Unicode Edge Cases, RTL, Surrogate Pairs & ZWNJ
  console.log('\n--- 3. Complex Unicode, RTL, Combining Marks, and Surrogate Pairs ---');
  const unicodeSample = 'مرحبا بالعالم! 𠜎 𠜱 𠝹 𠱓 𠱸 👨‍👩‍👧‍👦 🏳️‍🌈 \u200B\u200C\u200D\uFEFF Test \u0000 NULL \uD83D\uDE00';
  const parsedUnicode = parseMarkdownToHtml(unicodeSample);
  assert(parsedUnicode.length > 0, 'Unicode text should parse without error');

  // Verify TTS chunking with surrogate pairs and emoji sequences does not slice across code points
  const emojiChunks = chunkText(unicodeSample.repeat(20));
  for (const chunk of emojiChunks) {
    assert(!/[\uD800-\uDBFF]$/.test(chunk.text), 'Chunk must not end with a high surrogate orphan');
    assert(/^[\uDC00-\uDFFF]/.test(chunk.text) === false, 'Chunk must not start with a low surrogate orphan');
  }
  console.log('✓ Unicode, RTL, surrogate pairs, and zero-width characters handled cleanly');

  // Test 4: TTS Chunking Boundary Conditions
  console.log('\n--- 4. TTS Chunking Boundary Conditions ---');
  // Chunks of exact 190 characters
  const exact190 = 'A'.repeat(190);
  const chunksExact = chunkText(exact190);
  assert.equal(chunksExact.length, 1);
  assert.equal(chunksExact[0].text.length, 190);

  const exact191 = 'A'.repeat(191);
  const chunks191 = chunkText(exact191);
  assert.equal(chunks191.length, 2);
  assert.equal(chunks191[0].text.length, 190);
  assert.equal(chunks191[1].text.length, 1);

  // Mixed punctuation chunking
  const punctuationText = 'Sentence one! Sentence two? Sentence three... Sentence four; and sentence five, which is longer.';
  const punctChunks = chunkText(punctuationText);
  assert(punctChunks.length > 0);
  console.log('✓ TTS chunk boundary edge cases validated');

  // Test 5: Storage Cleanup Resiliency with malformed objects
  console.log('\n--- 5. Storage Cleanup Edge Case Resilience ---');
  const dummyWindow = {
    localStorage: {
      length: 1,
      key: () => null,
      getItem: () => null,
      removeItem: () => { throw new Error('Unwritable storage'); }
    },
    sessionStorage: {
      length: 0,
      key: () => null,
      getItem: () => null,
      removeItem: () => {}
    }
  };
  const origWindow = globalThis.window;
  globalThis.window = dummyWindow;
  try {
    // Should safely catch any internal storage errors without throwing unhandled exceptions
    cleanupLegacyBrowserStorage();
    console.log('✓ Storage cleanup handles throws from faulty storage cleanly');
  } finally {
    globalThis.window = origWindow;
  }

  // Test 6: TTS Controller Rapid State Transitions
  console.log('\n--- 6. TTS Controller Rapid State Transitions ---');
  let speakCalls = 0;
  let cancelCalls = 0;
  let _pauseCalls = 0;
  let _resumeCalls = 0;

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
  globalThis.SpeechSynthesisUtterance = FakeUtterance;

  class RigorousSynth {
    constructor() {
      this.speaking = false;
      this.paused = false;
      this.pending = false;
    }
    speak(utterance) {
      speakCalls++;
      this.speaking = true;
      if (utterance.onstart) utterance.onstart();
    }
    cancel() {
      cancelCalls++;
      this.speaking = false;
      this.paused = false;
    }
    pause() {
      _pauseCalls++;
      this.paused = true;
    }
    resume() {
      _resumeCalls++;
      this.paused = false;
    }
    getVoices() {
      return [];
    }
  }

  const mockSynthesis = new RigorousSynth();
  const context = createAppContext({
    readerContent: { querySelectorAll: () => [], contains: () => true },
    voiceRateInput: { value: '1.0' }
  });
  context.runtime.tts.supported = true;
  context.runtime.tts.synth = mockSynthesis;
  context.runtime.tts.wordMeta = [{ index: 0, text: 'Hello', start: 0, end: 5 }];
  context.runtime.tts.wordSpans = [{ classList: { add() {}, remove() {}, contains: () => false }, scrollIntoView() {} }];
  context.runtime.tts.fullSpokenText = 'Hello';

  const ttsController = createTTS(context, { ui: { showStatus() {}, announceLive() {} } });

  // Rapidly toggle play/pause/resume/stop
  for (let i = 0; i < 50; i++) {
    ttsController.startSpeech(0);
    ttsController.pauseSpeech();
    ttsController.resumeSpeech();
    ttsController.stopTTS();
  }

  assert(speakCalls > 0, 'TTS controller should have invoked speak');
  assert(cancelCalls > 0, 'TTS controller should have invoked cancel');
  assert.equal(context.runtime.tts.state, 'idle', 'TTS controller final state must be idle');
  console.log(`✓ Rapid TTS state transitions (50 cycles) executed safely (speak: ${speakCalls}, cancel: ${cancelCalls})`);

  console.log('\n========================================');
  console.log('ALL RIGOROUS BOUNDARY & STRESS TESTS PASSED!');
  console.log('========================================');
})().catch(err => {
  console.error('Rigorous edge cases failed:', err);
  process.exit(1);
});
