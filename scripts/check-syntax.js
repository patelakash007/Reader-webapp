const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const rootDir = path.resolve(__dirname, '..');

function getFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(ext))
    .sort()
    .map(f => path.join(dir, f));
}

const srcFiles = getFiles(path.join(rootDir, 'src'), '.mjs');
const scriptFiles = getFiles(path.join(rootDir, 'scripts'), '.js');
const testFiles = getFiles(path.join(rootDir, 'tests'), '.js');
const rootFiles = ['script.js', 'sw.js']
  .map(f => path.join(rootDir, f))
  .filter(f => fs.existsSync(f));

const allFiles = [...rootFiles, ...srcFiles, ...scriptFiles, ...testFiles];

// 1. JavaScript syntax validation on all files
for (const filePath of allFiles) {
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed for ${filePath}.\n`);
    process.exit(result.status || 1);
  }
}

// 2. ESM import integrity verification
(async () => {
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"](\.[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importedNames = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      const relativeModule = match[2];
      const targetPath = path.resolve(path.dirname(filePath), relativeModule);
      if (!fs.existsSync(targetPath)) {
        console.error(`Import target does not exist: ${relativeModule} in ${filePath}`);
        process.exit(1);
      }
      try {
        const mod = await import(pathToFileURL(targetPath).href);
        for (const name of importedNames) {
          if (!(name in mod)) {
            console.error(`Missing export '${name}' from ${relativeModule} imported by ${filePath}`);
            process.exit(1);
          }
        }
      } catch (err) {
        console.error(`Failed to load module ${targetPath}:`, err);
        process.exit(1);
      }
    }
  }

  // 3. Cross-module export usage verification (detects unimported sibling exports)
  const allExports = new Map();
  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const exportRegex = /export\s+(?:function|const|let|var|class)\s+([a-zA-Z0-9_$]+)/g;
    let m;
    while ((m = exportRegex.exec(content)) !== null) {
      allExports.set(m[1], filePath);
    }
  }

  for (const filePath of srcFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const importedNames = new Set();
    const importRegex = /import\s+\{([^}]+)\}\s+from/g;
    let im;
    while ((im = importRegex.exec(content)) !== null) {
      im[1].split(',').forEach(s => {
        const parts = s.trim().split(/\s+as\s+/);
        if (parts[1]) importedNames.add(parts[1].trim());
        else if (parts[0]) importedNames.add(parts[0].trim());
      });
    }

    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/export\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?/g, '')
      .replace(/\/\/.*/g, '')
      .replace(/"(?:\\.|[^"\\])*"/g, '')
      .replace(/'(?:\\.|[^'\\])*'/g, '')
      .replace(/`[\s\S]*?`/g, '');

    for (const [exportName, sourceFile] of allExports.entries()) {
      if (sourceFile === filePath) continue;
      if (importedNames.has(exportName)) continue;
      const usageRegex = new RegExp(`(?<![.\\w$])${exportName}(?![\\w$])`, 'g');
      if (usageRegex.test(stripped)) {
        console.error(`Missing import in ${path.basename(filePath)}: references '${exportName}' exported by ${path.basename(sourceFile)} without importing it.`);
        process.exit(1);
      }
    }
  }

  console.log(`JavaScript syntax and import validation passed for ${allFiles.length} files.`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
