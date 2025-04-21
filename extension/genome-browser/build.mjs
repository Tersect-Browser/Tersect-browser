// scripts/rebundle.mjs
import { readdirSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { build } from 'esbuild';

const distDir = 'dist/genome-browser';
const entryFile = path.join(distDir, 'entry.js');

// 1. Ensure distDir exists (should already, but safe guard)
mkdirSync(distDir, { recursive: true });

// 2. Get all .js files in the dist dir
const allJsFiles = readdirSync(distDir)
  .filter(f => f.endsWith('.js') && f !== 'genome-browser.min.js') // ignore existing output
  .sort((a, b) => {
    const priority = ['runtime', 'polyfills', 'vendor', 'main'];
    const aScore = priority.findIndex(p => a.startsWith(p));
    const bScore = priority.findIndex(p => b.startsWith(p));
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  });

// 3. Generate import lines
const importLines = allJsFiles.map(f => `import './${f}';`).join('\n');

// 4. Write entry file to dist folder
writeFileSync(entryFile, importLines);
console.log(`✅ Generated entry file: ${entryFile}\n` + importLines);

// 5. Bundle with esbuild
build({
  entryPoints: [entryFile],
  bundle: true,
  outfile: path.join(distDir, 'genome-browser.bundle.js'),
  format: 'iife',
  platform: 'browser',

  mainFields: ['es2020', 'module', 'browser', 'main'],
  treeShaking: false,
  logLevel: 'info'
}).catch(() => process.exit(1));
