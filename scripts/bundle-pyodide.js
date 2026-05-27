const https = require('https');
const fs = require('fs');
const path = require('path');

const WWW = path.join(__dirname, '..', 'www');
const ASSETS = path.join(WWW, 'assets');

if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS, { recursive: true });

const PYODIDE_BASE = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/';
const ACE_BASE = 'https://cdn.jsdelivr.net/npm/ace-builds@1.36.5/src-min-noconflict/';

const files = [
  { url: PYODIDE_BASE + 'pyodide.js', dest: 'pyodide/pyodide.js' },
  { url: PYODIDE_BASE + 'pyodide.asm.js', dest: 'pyodide/pyodide.asm.js' },
  { url: PYODIDE_BASE + 'pyodide.asm.wasm', dest: 'pyodide/pyodide.asm.wasm' },
  { url: PYODIDE_BASE + 'python_stdlib.zip', dest: 'pyodide/python_stdlib.zip' },
  { url: PYODIDE_BASE + 'pyodide-lock.json', dest: 'pyodide/pyodide-lock.json' },
  { url: ACE_BASE + 'ace.js', dest: 'ace/ace.js' },
  { url: ACE_BASE + 'mode-python.js', dest: 'ace/mode-python.js' },
  { url: ACE_BASE + 'theme-one_dark.js', dest: 'ace/theme-one_dark.js' },
  { url: ACE_BASE + 'ext-language_tools.js', dest: 'ace/ext-language_tools.js' },
];

function download(url, destRel) {
  return new Promise((resolve, reject) => {
    const fullDest = path.join(ASSETS, destRel);
    const dir = path.dirname(fullDest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(fullDest) && fs.statSync(fullDest).size > 1000) {
      console.log(`  ✓ Already have: ${destRel}`);
      return resolve();
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
          const size = (fs.statSync(fullDest).size / 1024 / 1024).toFixed(1);
          console.log(`  ✅ Done: ${destRel} (${size} MB)`);
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
    try { await download(f.url, f.dest); }
    catch (err) { console.error(`  ❌ Failed: ${f.dest} — ${err.message}`); process.exit(1); }
  }
  patchHtml();
  console.log('\n🎉 Bundle complete!\n');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
