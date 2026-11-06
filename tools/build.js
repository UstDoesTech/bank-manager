// Inlines engine/engine.js into Bank Manager.html so the published file still runs offline from one file.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), html = path.join(root, 'Bank Manager.html');
const eng = fs.readFileSync(path.join(root, 'engine', 'engine.js'), 'utf8').replace(/\s+$/, '') + '\n';
const src = fs.readFileSync(html, 'utf8');
const open = '<script id="engine">\n', i = src.indexOf(open);
if (i < 0) throw new Error('engine script tag not found');
const j = src.indexOf('</script>', i);
const out = src.slice(0, i + open.length) + eng + src.slice(j);
if (process.argv.includes('--check')) { if (out !== src) { console.error('Bank Manager.html is out of date: run node tools/build.js'); process.exit(1); } console.log('up to date'); }
else { fs.writeFileSync(html, out); console.log('built', out.length, 'bytes'); }
