export const VALID_SIZES = new Set(['small', 'medium', 'large', 'xl']);
export const MAX_EXTRACTED_TEXT_CHARS = 1_000_000;

export const VALID_FONTS = new Set(['sans', 'serif', 'system', 'mono']);

const SERIF_STACK = 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif';
const SANS_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_STACK = 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Monaco, Consolas, monospace';

export const fontMap = {
  serif: { family: SERIF_STACK, weight: 600 },
  sans: { family: SANS_STACK, weight: 600 },
  system: { family: SANS_STACK, weight: 600 },
  mono: { family: MONO_STACK, weight: 600 }
};

export const VALID_THEMES = new Set([
  'claude', 'zen', 'stark', 'paper', 'cream', 'kindle', 'github', 'amber', 'newspaper', 'lavender',
  'dark', 'void', 'carbon', 'midnight', 'obsidian', 'dracula', 'nord', 'catppuccin', 'forest', 'ink'
]);

export const THEME_COLORS = {
  claude: '#faf8f5',
  zen: '#ffffff',
  stark: '#ffffff',
  paper: '#faf8f3',
  cream: '#fbfaf8',
  kindle: '#f4ecd8',
  github: '#ffffff',
  amber: '#fffbeb',
  newspaper: '#f0ece0',
  lavender: '#f5f0ff',
  dark: '#1a1a1a',
  void: '#000000',
  carbon: '#121212',
  midnight: '#0a0a0f',
  obsidian: '#1e1e1e',
  dracula: '#282a36',
  nord: '#2e3440',
  catppuccin: '#1e1e2e',
  forest: '#1c2e1c',
  ink: '#0f172a'
};

export const lightPresets = [
  { name: 'Claude', font: 'sans', theme: 'claude', desc: 'Clean warm system sans' },
  { name: 'Zen', font: 'sans', theme: 'zen', desc: 'Pure minimal white' },
  { name: 'Stark', font: 'sans', theme: 'stark', desc: 'Bold high contrast' },
  { name: 'Book', font: 'serif', theme: 'paper', desc: 'Long-form book reading' },
  { name: 'Classic', font: 'serif', theme: 'cream', desc: 'Traditional print feel' },
  { name: 'Kindle', font: 'serif', theme: 'kindle', desc: 'E-ink sepia warmth' },
  { name: 'GitHub', font: 'mono', theme: 'github', desc: 'Developer monospace' },
  { name: 'Amber', font: 'sans', theme: 'amber', desc: 'High contrast warm' },
  { name: 'Newspaper', font: 'serif', theme: 'newspaper', desc: 'Old school print' },
  { name: 'Lavender', font: 'sans', theme: 'lavender', desc: 'Soft purple calm' }
];

export const darkPresets = [
  { name: 'Night', font: 'sans', theme: 'dark', desc: 'Deep black OLED' },
  { name: 'Void', font: 'sans', theme: 'void', desc: 'Pure black void' },
  { name: 'Carbon', font: 'sans', theme: 'carbon', desc: 'Material dark grey' },
  { name: 'Midnight', font: 'serif', theme: 'midnight', desc: 'Purple dark elegance' },
  { name: 'Obsidian', font: 'sans', theme: 'obsidian', desc: 'Note app dark' },
  { name: 'Dracula', font: 'mono', theme: 'dracula', desc: 'Famous code dark' },
  { name: 'Nord', font: 'sans', theme: 'nord', desc: 'Arctic blue dark' },
  { name: 'Catppuccin', font: 'sans', theme: 'catppuccin', desc: 'Pastel dark cozy' },
  { name: 'Forest', font: 'sans', theme: 'forest', desc: 'Green night easy' },
  { name: 'Ink', font: 'serif', theme: 'ink', desc: 'Navy scholarly' }
];

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
