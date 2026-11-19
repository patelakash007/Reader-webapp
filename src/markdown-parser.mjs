import { escapeHtml } from './utils.mjs';
import { Marked } from '../vendor/marked.esm.mjs';

function decodeHtmlAttributeValue(value) {
  if (typeof document === 'undefined') {
    return String(value)
      .replace(/&#(\d+);/g, (match, dec) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : match;
      })
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : match;
      })
      .replace(/&(?:amp|lt|gt|quot|apos|#039|#x27);/gi, entity => ({
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&#039;': "'",
        '&#x27;': "'"
      }[entity.toLowerCase()] || entity));
  }
  const decoder = document.createElement('textarea');
  decoder.innerHTML = value;
  return decoder.value;
}

export function normalizeSafeLinkHref(escapedUrl) {
  if (!escapedUrl || typeof escapedUrl !== 'string') return null;
  const cleanUrl = decodeHtmlAttributeValue(escapedUrl).trim();
  if (!cleanUrl || /[\u0000-\u001F\u007F]/.test(cleanUrl)) return null;

  const unsafeSchemeRegex = /^(javascript|data|vbscript|file|blob):/i;
  const safeSchemeRegex = /^(https?|ftp|mailto):/i;
  if (cleanUrl.startsWith('//')) return null;
  const isRootRelative = cleanUrl.startsWith('/') && !cleanUrl.startsWith('//');
  const isSafe = (safeSchemeRegex.test(cleanUrl) || isRootRelative || cleanUrl.startsWith('#')) && !unsafeSchemeRegex.test(cleanUrl);
  if (!isSafe) return null;

  try {
    return escapeHtml(encodeURI(cleanUrl).replace(/%25([0-9A-Fa-f]{2})/g, '%$1'));
  } catch (err) {
    return null;
  }
}

export function isSmartHeading(trimmed) {
  if (typeof trimmed !== 'string' || trimmed.length < 3 || trimmed.length > 55) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (!/^[A-Z][A-Z0-9 \t:—–-]{2,55}[A-Z0-9]$/.test(trimmed)) return false;
  if (/^[A-Z0-9]{2,6}(?:[ \t]+(?:AND|OR|&|\/)[ \t]+[A-Z0-9]{2,6})+$/i.test(trimmed)) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (/^(?:PLEASE|NOTE|WARNING|CAUTION|DO NOT|NOTICE)\b/i.test(trimmed)) return false;
  const words = trimmed.split(/[ \t]+/);
  return words.some(w => w.length >= 4) || words.length >= 2;
}

export function createMarkedInstance() {
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: false,
    renderer: {
      heading(token) {
        const id = token.headingId !== undefined ? token.headingId : `heading-${Math.random().toString(36).slice(2, 11)}`;
        const content = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${content}</h${token.depth}>\n`;
      },
      link(token) {
        const safeHref = normalizeSafeLinkHref(token.href);
        const text = this.parser.parseInline(token.tokens);
        if (!safeHref) return text;
        if (safeHref.startsWith('#')) {
          return `<a href="${safeHref}">${text}</a>`;
        }
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      },
      image(token) {
        return `[Image: ${escapeHtml(token.text || 'image')}]`;
      },
      html(token) {
        return escapeHtml(token.text);
      },
      list(token) {
        const tag = token.ordered ? 'ol' : 'ul';
        const startAttr = token.ordered && token.start !== 1 && token.start !== '' && token.start !== undefined
          ? ` start="${token.start}"`
          : '';
        let body = '';
        for (const item of token.items) {
          body += this.listitem(item);
        }
        return `<${tag}${startAttr}>${body}</${tag}>\n`;
      },
      listitem(item) {
        const parsed = this.parser.parse(item.tokens, !!item.loose);
        if (!item.task) {
          return `<li>${parsed}</li>`;
        }
        const checkbox = `<input ${item.checked ? 'checked="" ' : ''}disabled="" type="checkbox"> `;
        const body = item.loose && parsed.startsWith('<p>')
          ? `<p>${checkbox}${parsed.slice(3)}`
          : `${checkbox}${parsed}`;
        return `<li>${body}</li>`;
      }
    }
  });
  return instance;
}

const defaultMarkedInstance = createMarkedInstance();

function countNewlines(str) {
  if (!str) return 0;
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function parseInline(text) {
  if (!text) return '';
  return defaultMarkedInstance.parseInline(String(text));
}

export function createMarkdownRenderer(smartHeadings = true) {
  const marked = defaultMarkedInstance;

  function tokenize(text) {
    const tokens = marked.lexer(String(text || ''));
    let currentLine = 0;
    const usedHeadingIds = new Set();

    function assignHeadingId(token, lineIndex) {
      if (token.type === 'heading' && !token.headingId) {
        let id = `heading-${lineIndex}`;
        if (usedHeadingIds.has(id)) {
          let counter = 1;
          while (usedHeadingIds.has(`${id}-${counter}`)) {
            counter += 1;
          }
          id = `${id}-${counter}`;
        }
        usedHeadingIds.add(id);
        token.headingId = id;
      }
    }

    function processTokenList(list, baseLine) {
      for (const token of list) {
        const line = baseLine !== undefined ? baseLine : currentLine;
        if (baseLine === undefined && token.raw) {
          currentLine += countNewlines(token.raw);
        }

        if (smartHeadings && token.type === 'paragraph' && baseLine === undefined) {
          if (token.text && !token.text.includes('\n') && !token.text.includes('\r') && isSmartHeading(token.text.trim())) {
            token.type = 'heading';
            token.depth = 2;
          }
        }

        assignHeadingId(token, line);

        if (token.tokens && token.type !== 'paragraph' && token.type !== 'heading') {
          processTokenList(token.tokens, line);
        }
        if (token.items) {
          for (const item of token.items) {
            if (item.tokens) processTokenList(item.tokens, line);
          }
        }
      }
    }

    processTokenList(tokens);
    return tokens;
  }

  function renderTokens(tokensSlice, links) {
    if (!tokensSlice || !tokensSlice.length) return '';
    if (links && !tokensSlice.links) {
      tokensSlice.links = links;
    }
    return marked.parser(tokensSlice);
  }

  function render(text) {
    const tokens = tokenize(text);
    return renderTokens(tokens, tokens.links);
  }

  return {
    marked,
    tokenize,
    renderTokens,
    render
  };
}

export { escapeHtml };

export function parseMarkdownToHtml(text, smartHeadings = true) {
  const renderer = createMarkdownRenderer(smartHeadings);
  return renderer.render(text);
}
