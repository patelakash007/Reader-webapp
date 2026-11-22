import { MAX_EXTRACTED_TEXT_CHARS } from './constants.mjs';
import { escapeHtml } from './utils.mjs';
import { parseMarkdownToHtml } from './markdown-parser.mjs';

export { escapeHtml };
export {
  createMarkdownRenderer,
  createMarkedInstance,
  isSmartHeading,
  normalizeSafeLinkHref,
  parseInline,
  parseMarkdownToHtml
} from './markdown-parser.mjs';

export function enforceExtractedTextLimit(text, context = 'document') {
  const value = typeof text === 'string' ? text : '';
  if (value.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw new Error(`This ${context} contains too much extracted text for the browser reader. Limit is ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} characters.`);
  }
  return value;
}

export function createParser() {
  return {
    enforceExtractedTextLimit,
    parseMarkdownToHtml
  };
}
