export const VALID_SIZES = new Set(['small', 'medium', 'large', 'xl']);
export const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;

export const VALID_FONTS = new Set([
  'sans', 'serif', 'system', 'mono', 'minimal', 'bold', 'clean',
  'literata', 'merriweather', 'libre', 'atkinson', 'jakarta', 'outfit', 'bebas', 'oswald', 'manrope', 'sora'
]);

export const VALID_THEMES = new Set([
  'claude', 'zen', 'stark', 'paper', 'cream', 'kindle', 'github', 'amber', 'newspaper', 'lavender',
  'dark', 'void', 'carbon', 'midnight', 'obsidian', 'dracula', 'nord', 'catppuccin', 'forest', 'ink'
]);

const SERIF_STACK = 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif';
const SANS_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_STACK = 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Monaco, Consolas, monospace';

export const fontMap = {
  serif: { family: SERIF_STACK, weight: 600, url: null },
  sans: { family: SANS_STACK, weight: 600, url: null },
  system: { family: SANS_STACK, weight: 600, url: null },
  mono: { family: MONO_STACK, weight: 600, url: null },
  minimal: { family: SANS_STACK, weight: 500, url: null },
  bold: { family: SANS_STACK, weight: 700, url: null },
  clean: { family: SANS_STACK, weight: 600, url: null },
  // Backward-compatible aliases for previously named presets
  literata: { family: SERIF_STACK, weight: 600, url: null },
  merriweather: { family: SERIF_STACK, weight: 700, url: null },
  libre: { family: SERIF_STACK, weight: 600, url: null },
  atkinson: { family: SANS_STACK, weight: 600, url: null },
  jakarta: { family: SANS_STACK, weight: 600, url: null },
  outfit: { family: SANS_STACK, weight: 600, url: null },
  bebas: { family: SANS_STACK, weight: 700, url: null },
  oswald: { family: SANS_STACK, weight: 700, url: null },
  manrope: { family: SANS_STACK, weight: 600, url: null },
  sora: { family: SANS_STACK, weight: 600, url: null }
};

export const lightPresets = [
  { name: 'Claude', font: 'sans', theme: 'claude', color: 'default', desc: 'Clean warm system sans' },
  { name: 'Zen', font: 'sans', theme: 'zen', color: 'default', desc: 'Pure minimal white' },
  { name: 'Stark', font: 'sans', theme: 'stark', color: 'default', desc: 'Bold high contrast' },
  { name: 'Book', font: 'serif', theme: 'paper', color: 'default', desc: 'Long-form book reading' },
  { name: 'Classic', font: 'serif', theme: 'cream', color: 'default', desc: 'Traditional print feel' },
  { name: 'Kindle', font: 'serif', theme: 'kindle', color: 'default', desc: 'E-ink sepia warmth' },
  { name: 'GitHub', font: 'mono', theme: 'github', color: 'default', desc: 'Developer monospace' },
  { name: 'Amber', font: 'sans', theme: 'amber', color: 'default', desc: 'High contrast warm' },
  { name: 'Newspaper', font: 'serif', theme: 'newspaper', color: 'default', desc: 'Old school print' },
  { name: 'Lavender', font: 'sans', theme: 'lavender', color: 'default', desc: 'Soft purple calm' }
];

export const darkPresets = [
  { name: 'Night', font: 'sans', theme: 'dark', color: 'default', desc: 'Deep black OLED' },
  { name: 'Void', font: 'sans', theme: 'void', color: 'default', desc: 'Pure black void' },
  { name: 'Carbon', font: 'sans', theme: 'carbon', color: 'default', desc: 'Material dark grey' },
  { name: 'Midnight', font: 'serif', theme: 'midnight', color: 'default', desc: 'Purple dark elegance' },
  { name: 'Obsidian', font: 'sans', theme: 'obsidian', color: 'default', desc: 'Note app dark' },
  { name: 'Dracula', font: 'mono', theme: 'dracula', color: 'default', desc: 'Famous code dark' },
  { name: 'Nord', font: 'sans', theme: 'nord', color: 'default', desc: 'Arctic blue dark' },
  { name: 'Catppuccin', font: 'sans', theme: 'catppuccin', color: 'default', desc: 'Pastel dark cozy' },
  { name: 'Forest', font: 'sans', theme: 'forest', color: 'default', desc: 'Green night easy' },
  { name: 'Ink', font: 'serif', theme: 'ink', color: 'default', desc: 'Navy scholarly' }
];

export const textColorMap = {
  light: { default: null, soft: '#6e6a62', warm: '#78350f', cool: '#1e3a5f', high: '#000000' },
  dark: { default: null, soft: '#b0a898', warm: '#fde68a', cool: '#bfdbfe', high: '#ffffff' }
};

export const STATE_IDLE = 'idle';
export const STATE_PLAYING = 'playing';
export const STATE_PAUSED = 'paused';
export const CHUNK_TARGET = 190;
export const WORDS_PER_MIN = 180;
export const BOUNDARY_FALLBACK_MS = 100;
export const VOICE_POLL_MS = 250;
export const VOICE_POLL_TIMEOUT = 5000;
export const KEEP_ALIVE_MS = 10000;
export const PAGEHIDE_CANCEL_TIMEOUT = 15000;
export const SPEED_STEPS = [0.8, 1.0, 1.2, 1.5, 1.8, 2.0];
