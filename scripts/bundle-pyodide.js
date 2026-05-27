const https = require('https');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const ASSETS = path.join(WWW, 'assets');
if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';
const ACE_BASE = 'https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/';

// minSize = minimum expected file size in bytes
const files = [
  { url: PYODIDE_BASE + 'pyodide.js',          dest: 'pyodide/pyodide.js',        minSize: 10000 },
  { url: PYODIDE_BASE + 'pyodide.asm.js',       dest: 'pyodide/pyodide.asm.js',    minSize: 1000000 },
  { url: PYODIDE_BASE + 'pyodide.asm.wasm',     dest: 'pyodide/pyodide.asm.wasm',  minSize: 5000000 },
  { url: PYODIDE_BASE + 'python_stdlib.zip',    dest: 'pyodide/python_stdlib.zip', minSize: 1000000 },
  { url: PYODIDE_BASE + 'pyodide-lock.json',    dest: 'pyodide/pyodide-lock.json', minSize: 1000 },
  { url: ACE_BASE + 'ace.js',                   dest: 'ace/ace.js',                minSize: 10000 },
  { url: ACE_BASE + 'mode-python.js',           dest: 'ace/mode-python.js',        minSize: 1000 },
  { url: ACE_BASE + 'theme-one_dark.js',        dest: 'ace/theme-one_dark.js',     minSize: 1000 },
  { url: ACE_BASE + 'ext-language_tools.js',    dest: 'ace/ext-language_tools.js', minSize: 1000 },
];

function download(url, destRel, minSize) {
  return new Promise((resolve, reject) => {
    const fullDest = path.join(ASSETS, destRel);
    const dir = path.dirname(fullDest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Only skip if file exists AND is large enough
    if (fs.existsSync(fullDest)) {
      const existing = fs.statSync(fullDest).size;
      if (existing >= minSize) {
        console.log(`  ✓ Already have: ${destRel} (${(existing/1024/1024).toFixed(1)} MB)`);
        return resolve();
      } else {
        console.log(`  ⚠ File too small (${existing} bytes), re-downloading: ${destRel}`);
        fs.unlinkSync(fullDest);
      }
    }

    console.log(`  ↓ Downloading: ${destRel} ...`);
    const file = fs.createWriteStream(fullDest);

    function get(u) {
      https.get(u, res => {
        if (res.statusCode === 301 || res.statusCode === 302) return get(res.headers.location);
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          const size = fs.statSync(fullDest).size;
          if (size < minSize) {
            fs.unlinkSync(fullDest);
            return reject(new Error(`File too small after download: ${destRel} (${size} bytes, expected >=${minSize})`));
          }
          console.log(`  ✅ Done: ${destRel} (${(size/1024/1024).toFixed(1)} MB)`);
          resolve();
        });
      }).on('error', err => { fs.unlink(fullDest, () => {}); reject(err); });
    }
    get(url);
  });
}

function patchHtml() {
  const htmlPath = path.join(WWW, 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const replacements = [
    ['https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js', 'assets/pyodide/pyodide.js'],
    ['https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/ace.js', 'assets/ace/ace.js'],
    ['https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/mode-python.js', 'assets/ace/mode-python.js'],
    ['https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/theme-one_dark.js', 'assets/ace/theme-one_dark.js'],
    ['https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/ext-language_tools.js', 'assets/ace/ext-language_tools.js'],
  ];
  for (const [from, to] of replacements) html = html.split(from).join(to);
  const pyodideConfig = `\n<script>\n  window.pyodideIndexURL = 'assets/pyodide/';\n</script>\n`;
  html = html.replace('</head>', pyodideConfig + '</head>');
  html = html.replace(/loadPyodide\(\s*\)/g, "loadPyodide({ indexURL: 'assets/pyodide/' })");
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('\n✅ index.html patched!\n');
}

async function main() {
  console.log('\n🚀 ByteForge Asset Bundler Starting...\n');
  for (const f of files) {
    try { await download(f.url, f.dest, f.minSize); }
    catch (err) { console.error(`  ❌ Failed: ${f.dest} — ${err.message}`); process.exit(1); }
  }
  patchHtml();
  const { execSync } = require('child_process');
  try {
    const size = execSync(`du -sh ${ASSETS}`).toString().split('\t')[0];
    console.log(`📦 Total assets: ${size}`);
  } catch(e) {}
  console.log('\n🎉 Bundle complete!\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
