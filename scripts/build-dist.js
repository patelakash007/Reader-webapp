const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

const itemsToCopy = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.webmanifest',
  'sw.js',
  'icons',
  'src',
  'vendor'
];

for (const item of itemsToCopy) {
  const src = path.join(rootDir, item);
  const dest = path.join(distDir, item);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

console.log('Successfully prepared web assets in dist/');
