const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist/queuebee-demo.html'));
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '').replace(/[ \t]+$/gm, '');
let html = read('demo/index.html');
html = html.replace('<link rel="stylesheet" href="demo.css">', () => `<style>${read('demo/demo.css')}</style>`);
for (const [src, name] of [['storage-mock.js', 'demo/storage-mock.js'], ['demo.js', 'demo/demo.js'], ['../page-state.js', 'page-state.js'], ['../content.js', 'content.js'], ['../popup.js', 'popup.js']]) {
    html = html.replace(`<script src="${src}"></script>`, () => `<script>\n${read(name).replace(/<\/script/gi, '<\\/script')}\n</script>`);
}
if (/<script\s+src=|<link\s+rel="stylesheet"/.test(html)) throw new Error('Demo still has external dependencies.');
fs.mkdirSync(path.dirname(output), {recursive:true});
fs.writeFileSync(output, html);
console.log(`Standalone demo: ${output}`);
