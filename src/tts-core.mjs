import { CHUNK_TARGET } from './constants.mjs';

export function chunkText(text, baseOffset = 0, targetLen = CHUNK_TARGET) {
  const out = [];
  const len = text.length;
  let start = 0;
  while (start < len) {
    if (len - start <= targetLen) {
      out.push({ text: text.slice(start), start: baseOffset + start, end: baseOffset + len });
      break;
    }
    const end = start + targetLen;
    let splitAt = -1;

    // Prefer sentence boundaries [.!?] within comfortable window (>= start + 80)
    for (let i = Math.min(end, len - 1); i >= Math.max(start + 80, start); i -= 1) {
      if (/[.!?]/.test(text[i]) && (i + 1 === len || /\s/.test(text[i + 1]))) {
        splitAt = i + 1;
        break;
      }
    }

    // Next prefer clause boundaries [,;:]
    if (splitAt === -1) {
      for (let i = Math.min(end, len - 1); i >= Math.max(start + 80, start); i -= 1) {
        if (/[,;:]/.test(text[i]) && (i + 1 === len || /\s/.test(text[i + 1]))) {
          splitAt = i + 1;
          break;
        }
      }
    }

    // Fall back to any whitespace
    if (splitAt === -1) {
      for (let i = Math.min(end, len - 1); i > start; i -= 1) {
        if (/\s/.test(text[i])) {
          splitAt = i;
          break;
        }
      }
    }

    if (splitAt === -1) splitAt = end;
    out.push({ text: text.slice(start, splitAt), start: baseOffset + start, end: baseOffset + splitAt });
    start = splitAt;
    while (start < len && /\s/.test(text[start])) start += 1;
  }
  return out;
}

export function deduplicateAndSortVoices(list) {
  const seen = new Set();
  const unique = [];
  list.forEach(voice => {
    const key = `${voice.name}\0${voice.lang}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(voice);
    }
  });
  return unique.sort((a, b) => {
    if (a.default !== b.default) return a.default ? -1 : 1;
    const languageA = a.lang || '';
    const languageB = b.lang || '';
    if (languageA !== languageB) return languageA.localeCompare(languageB);
    return a.name.localeCompare(b.name);
  });
}

export function resolveVoiceIndex(voices, previousSelection, userLanguage = 'en-US') {
  let selectedIndex = -1;
  if (previousSelection) {
    selectedIndex = voices.findIndex((voice, index) => (
      voice.voiceURI === previousSelection ||
      String(index) === previousSelection
    ));
  }
  if (selectedIndex === -1) selectedIndex = voices.findIndex(voice => voice.lang === userLanguage);
  if (selectedIndex === -1) {
    const languageFamily = userLanguage.split('-')[0];
    selectedIndex = voices.findIndex(voice => voice.lang && voice.lang.split('-')[0] === languageFamily);
  }
  if (selectedIndex === -1) selectedIndex = voices.findIndex(voice => voice.default);
  if (selectedIndex === -1) selectedIndex = voices.length ? 0 : -1;
  return selectedIndex;
}

export function tokenizeReaderDOM(containerElement, documentObject = document) {
  const wordSpans = [];
  const wordMeta = [];
  if (!containerElement) return { spans: wordSpans, meta: wordMeta, text: '' };

  if (typeof containerElement.querySelectorAll === 'function') {
    const existingSpans = containerElement.querySelectorAll('.tts-word');
    if (existingSpans && existingSpans.length) {
      Array.from(existingSpans).forEach(span => {
        if (span.parentNode && typeof documentObject.createTextNode === 'function') {
          span.parentNode.replaceChild(documentObject.createTextNode(span.textContent || ''), span);
        }
      });
      if (typeof containerElement.normalize === 'function') containerElement.normalize();
    }
  }

  const filterShowText = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
  const filterAccept = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_ACCEPT : 1;
  const filterReject = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_REJECT : 2;
  const filterSkip = typeof NodeFilter !== 'undefined' ? NodeFilter.FILTER_SKIP : 3;

  const walker = documentObject.createTreeWalker(containerElement, filterShowText, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return filterSkip;
      const parent = node.parentElement;
      if (!parent) return filterSkip;
      const tag = parent.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style') return filterReject;
      return filterAccept;
    }
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  const wordPattern = /\S+/g;
  let lastBlockElement = null;
  const textParts = [];
  let currentLen = 0;
  let trailingWhitespace = false;
  let trailingNewlines = 0;

  textNodes.forEach(textNode => {
    const text = textNode.nodeValue;
    const parentBlock = textNode.parentElement
      ? textNode.parentElement.closest('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, th, tr, table')
      : null;

    if (parentBlock && lastBlockElement && parentBlock !== lastBlockElement) {
      if (trailingNewlines < 2) {
        const needed = 2 - trailingNewlines;
        const nls = '\n'.repeat(needed);
        textParts.push(nls);
        currentLen += needed;
        trailingNewlines = 2;
        trailingWhitespace = true;
      }
    } else if (currentLen > 0 && !trailingWhitespace && !/^\s/.test(text) && !/^[.,!?;:)\]}\u2019\u201D]/.test(text)) {
      textParts.push(' ');
      currentLen += 1;
      trailingWhitespace = true;
      trailingNewlines = 0;
    }
    lastBlockElement = parentBlock;

    const fragment = documentObject.createDocumentFragment();
    let lastIndex = 0;
    let match;
    wordPattern.lastIndex = 0;
    while ((match = wordPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const whitespace = text.slice(lastIndex, match.index);
        if (typeof documentObject.createTextNode === 'function') {
          fragment.appendChild(documentObject.createTextNode(whitespace));
        }
        textParts.push(whitespace);
        currentLen += whitespace.length;
        trailingWhitespace = /\s$/.test(whitespace);
        trailingNewlines = whitespace.endsWith('\n\n') ? 2 : (whitespace.endsWith('\n') ? 1 : 0);
      }
      const wordText = match[0];
      const span = documentObject.createElement('span');
      span.className = 'tts-word';
      const wordIndex = wordMeta.length;
      span.setAttribute('data-word-idx', String(wordIndex));
      span.textContent = wordText;
      fragment.appendChild(span);

      const wordStart = currentLen;
      textParts.push(wordText);
      currentLen += wordText.length;
      const wordEnd = currentLen;
      wordSpans.push(span);
      wordMeta.push({ index: wordIndex, text: wordText, start: wordStart, end: wordEnd, element: span });
      lastIndex = match.index + wordText.length;
      trailingWhitespace = false;
      trailingNewlines = 0;
    }
    if (lastIndex < text.length) {
      const trailing = text.slice(lastIndex);
      if (typeof documentObject.createTextNode === 'function') {
        fragment.appendChild(documentObject.createTextNode(trailing));
      }
      textParts.push(trailing);
      currentLen += trailing.length;
      trailingWhitespace = /\s$/.test(trailing);
      trailingNewlines = trailing.endsWith('\n\n') ? 2 : (trailing.endsWith('\n') ? 1 : 0);
    }
    if (textNode.parentNode) textNode.parentNode.replaceChild(fragment, textNode);
  });
  const fullSpokenText = textParts.join('');
  return { spans: wordSpans, meta: wordMeta, text: fullSpokenText };
}
