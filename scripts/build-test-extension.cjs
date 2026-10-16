const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'dist/queuebee-extension-test'));
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\uFEFF/, '');
const manifest = JSON.parse(read('manifest.json'));
manifest.name = 'QueueBee v1.0 — OFFLINE TEST';
manifest.description = 'Test the installed extension against the included fake queue dashboard. Local test file only.';
manifest.host_permissions = ['file:///*/queuebee-test.html'];
manifest.content_scripts = [
    {matches:['file:///*/queuebee-test.html'], js:['page-state.js'], world:'MAIN', run_at:'document_start'},
    {matches:['file:///*/queuebee-test.html'], js:['test-status.js','content.js'], run_at:'document_idle'}
];
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Byte-identical automation and popup code; the test page does not load them itself.
for (const name of ['page-state.js', 'content.js', 'popup.js']) fs.copyFileSync(path.join(root,name), path.join(output,name));
fs.writeFileSync(path.join(output, 'popup.html'), read('popup.html').replace('Hospital Queue Pro + Log', 'QueueBee — OFFLINE TEST'));
for (const [from, to] of [['demo/demo.css','demo.css'], ['demo/demo.js','demo.js'], ['demo/test-status.js','test-status.js']]) {
    fs.copyFileSync(path.join(root,from), path.join(output,to));
}
let html = read('demo/index.html')
    .replace('<html lang="en">', '<html lang="en" data-extension-test="true">')
    .replace('<title>QueueBee — local demo</title>', '<title>QueueBee — installed extension test</title>')
    .replace('/ local demo', '/ extension test')
    .replace('Choose a threshold and press START.', 'Open the OFFLINE TEST extension popup, choose a threshold and press START.')
    .replace('Runs locally with fake patients. No hospital connection or extension installation needed.', 'Fake patients only. Install the included OFFLINE TEST extension and enable Allow access to file URLs in its Details.')
    .replace(/<aside class="card automation"[\s\S]*?<\/aside>/, `<aside class="card automation" aria-label="Extension connection">
      <h2>Installed extension</h2>
      <p id="extensionStatus" role="status">Waiting for extension…</p>
      <p class="hint">In Chrome, pin <strong>QueueBee — OFFLINE TEST</strong> from the Extensions menu. Open its popup, select <strong>15 minutes</strong>, then press <strong>START</strong>.</p>
      <p class="hint">If this page stays disconnected, enable <strong>Allow access to file URLs</strong> in the extension's Details and refresh this page.</p>
      <p><strong id="extensionRunning">DISCONNECTED</strong> · <span id="extensionThreshold">—</span></p>
      <p id="extensionMessage" role="status"></p>
      <div class="metrics"><div><strong id="extensionCleared">0</strong><span>Extension auto-cleared</span></div><div><strong id="normalCalls">0</strong><span>Normal calls</span></div></div>
      <p class="expectation">At 15 minutes: 2 auto-cleared, 2 waiting, 0 normal calls. Use only one test dashboard tab at a time.</p>
    </aside>`)
    .replace(/<footer>[\s\S]*?<\/footer>/, '<footer>The installed test extension injects its content script into this local file and uses real Chrome extension storage and the real popup. This page simulates only the queue server. The test build cannot run on the hospital dashboard.</footer>')
    .replace('  <script src="storage-mock.js"></script>\n', '')
    .replace('  <script src="../page-state.js"></script>\n', '')
    .replace('  <script src="../content.js"></script>\n', '')
    .replace('  <script src="../popup.js"></script>\n', '');
if (html.includes('storage-mock') || html.includes('src="../content.js"') || html.includes('id="startBtn"')) {
    throw new Error('Test dashboard must rely on the installed extension.');
}
fs.writeFileSync(path.join(output, 'queuebee-test.html'), html);
fs.writeFileSync(path.join(output, 'READ-ME.txt'), `QUEUEBEE v1.0 — INSTALLED EXTENSION TEST

1. Extract this ZIP. Keep the files together in the queuebee-extension-test folder.
2. Open chrome://extensions/ in Chrome and enable Developer mode.
3. Click Load unpacked and select queuebee-extension-test (the folder with manifest.json).
4. Open this extension's Details and turn ON Allow access to file URLs.
5. Open queuebee-test.html from the extracted folder in Chrome. It should say Extension connected.
6. Pin QueueBee v1.0 — OFFLINE TEST from Chrome's Extensions menu. Open its popup.
7. Choose Threshold: 15 Mins and click START. You may close the popup and watch the test dashboard.

Expected: queues 3001 and 3002 clear; 3003 (14:59) and 3004 (04:40) remain.
The real extension counter should show 2 and Normal calls should remain 0.
STOP and the threshold controls are in the extension popup, not in the web page.
Reset demo stops automation and clears test storage before restarting the scenario.
Use Test scenario for slow responses, a wrong patient, and a timeout.

This is an installed Chrome extension, using native Chrome storage and content-script injection.
The included page has no automation script or fake Chrome storage.
Only the patients and server responses are simulated. It has no hospital-site access.
Keep one test dashboard tab open. Chrome may delay background timers.
Managed Chrome installations must permit unpacked extensions and file URL access.
`);
console.log(`Installable test extension: ${output}`);
