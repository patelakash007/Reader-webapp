import { MAX_EXTRACTED_TEXT_CHARS } from './constants.mjs';
import { escapeHtml } from './utils.mjs';
import { Marked } from '../vendor/marked.esm.mjs';

const RESERVED_DOM_IDS = new Set([
  'app', 'progressbar', 'sheetbackdrop', 'mobilefab', 'inputview', 'pastearea',
  'readbtn', 'clearbtn', 'statusmessage', 'readerview', 'backbtn', 'toolbar',
  'bottomsheethandle', 'settingsdrawer', 'themesettingssummary', 'themesettingspanel',
  'arrowleft', 'presetwindow', 'presettrack', 'arrowright',
  'presetdots', 'modelight', 'modedark', 'textsettingspanel', 'lineheightinput',
  'lineheightval', 'letterspacinginput', 'letterspacingval', 'margininput', 'marginval',
  'listensettingspanel', 'ttsbtn', 'ttsstopbtn', 'voiceselect', 'voicerateval',
  'voicerateinput', 'readercontent', 'readerstatusmessage', 'audioplayerbar',
  'audioplaypausebtn', 'audiostopbtn', 'audiostatustext', 'audiospeedbtn',
  'gesturehint', 'gesturehinttext', 'gesturehintsub', 'loader', 'liveannouncer'
]);

function hasControlChars(str) {
  for (let i = 0; i < str.length; i += 1) {
    const code = str.charCodeAt(i);
    if (code <= 0x1F || code === 0x7F) return true;
  }
  return false;
}

function decodeHtmlAttributeValue(value) {
  const str = String(value);
  if (!str.includes('&')) return str;
  if (typeof document === 'undefined') {
    return str
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
  decoder.innerHTML = str;
  return decoder.value;
}

export function normalizeSafeLinkHref(escapedUrl) {
  if (!escapedUrl || typeof escapedUrl !== 'string') return null;
  const cleanUrl = decodeHtmlAttributeValue(escapedUrl).trim();
  if (!cleanUrl || hasControlChars(cleanUrl) || cleanUrl.startsWith('//')) return null;

  const isSafe = /^(https?|ftp|mailto):/i.test(cleanUrl) || cleanUrl.startsWith('/') || cleanUrl.startsWith('#');
  if (!isSafe) return null;

  try {
    return escapeHtml(encodeURI(cleanUrl).replace(/%25([0-9A-Fa-f]{2})/g, '%$1'));
  } catch (err) {
    return null;
  }
}

function isSmartHeading(trimmed) {
  if (typeof trimmed !== 'string' || trimmed.length < 4 || trimmed.length > 55) return false;
  if (/[\r\n]/.test(trimmed)) return false;
  if (!/^[A-Z][A-Z0-9 \t:—–-]{2,55}[A-Z0-9]$/.test(trimmed)) return false;
  if (/^[A-Z0-9]{2,6}(?:[ \t]+(?:AND|OR)[ \t]+[A-Z0-9]{2,6})+$/i.test(trimmed)) return false;
  if (/^(?:PLEASE|NOTE|WARNING|CAUTION|DO NOT|NOTICE)\b/i.test(trimmed)) return false;
  const words = trimmed.split(/[ \t]+/);
  return words.some(w => w.length >= 4) || words.length >= 2;
}

function extractTokenText(token) {
  if (!token) return '';
  if (Array.isArray(token.tokens) && token.tokens.length) {
    return token.tokens.map(extractTokenText).join('');
  }
  return token.text || '';
}

function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function createMarkedInstance() {
  const instance = new Marked();
  instance.use({
    gfm: true,
    breaks: false,
    renderer: {
      heading(token) {
        const rawId = token.headingId !== undefined ? token.headingId : `heading-${Math.random().toString(36).slice(2, 11)}`;
        const id = escapeHtml(String(rawId));
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
      table(token) {
        let header = '';
        let cell = '';
        for (let j = 0; j < token.header.length; j += 1) {
          cell += this.tablecell(token.header[j]);
        }
        header += this.tablerow({ text: cell });
        let body = '';
        for (let j = 0; j < token.rows.length; j += 1) {
          const row = token.rows[j];
          cell = '';
          for (let k = 0; k < row.length; k += 1) {
            cell += this.tablecell(row[k]);
          }
          body += this.tablerow({ text: cell });
        }
        if (body) body = `<tbody>${body}</tbody>`;
        return `<div class="table-wrap"><table>\n<thead>\n${header}</thead>\n${body}</table></div>\n`;
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

export function createMarkdownRenderer(smartHeadings = true) {
  const marked = defaultMarkedInstance;

  function tokenize(text) {
    const tokens = marked.lexer(String(text || ''));
    let currentLine = 0;
    const usedHeadingIds = new Set();

    function assignHeadingId(token, lineIndex) {
      if (token.type === 'heading' && !token.headingId) {
        const baseSlug = slugifyHeading(extractTokenText(token)) || `heading-${lineIndex}`;
        let id = baseSlug;
        if (usedHeadingIds.has(id) || RESERVED_DOM_IDS.has(id)) {
          let counter = 1;
          while (usedHeadingIds.has(`${baseSlug}-${counter}`) || RESERVED_DOM_IDS.has(`${baseSlug}-${counter}`)) {
            counter += 1;
          }
          id = `${baseSlug}-${counter}`;
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

export function enforceExtractedTextLimit(text, context = 'document') {
  const value = typeof text === 'string' ? text : '';
  if (value.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
  }
  return value;
}

export function parseMarkdownToHtml(text, smartHeadings = true) {
  const renderer = createMarkdownRenderer(smartHeadings);
  return renderer.render(text);
}
