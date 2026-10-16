const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright-core');
let directory, browser;
const root = path.resolve(__dirname, '..');
before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'queuebee-extension-build-'));
    execFileSync(process.execPath, [path.join(root,'scripts/build-test-extension.cjs'),directory]);
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'});
});
after(async () => {await browser?.close(); if (directory) fs.rmSync(directory,{recursive:true,force:true});});
async function dashboard(t, scenario = 'baseline') {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => {await page.close(); assert.deepEqual(errors,[]);});
    await page.route('http://queuebee-extension.test/**', route => {
        const name = new URL(route.request().url()).pathname.slice(1);
        assert.ok(['queuebee-test.html','demo.js','demo.css'].includes(name));
        const contentType = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html';
        return route.fulfill({contentType,body:fs.readFileSync(path.join(directory,name))});
    });
    await page.goto(`http://queuebee-extension.test/queuebee-test.html#${scenario}`);
    return page;
}
async function injectHarness(page) {
    // This checks the actual isolated-world DOM boundary. Chrome API mocking is
    // confined to this test harness; none is included in the downloadable build.
    await page.addScriptTag({path:path.join(directory,'page-state.js')});
    const cdp = await page.context().newCDPSession(page);
    const {frameTree} = await cdp.send('Page.getFrameTree');
    const {executionContextId} = await cdp.send('Page.createIsolatedWorld', {frameId:frameTree.frame.id,worldName:'extension-test-harness'});
    const evaluate = async expression => {
        const result = await cdp.send('Runtime.evaluate', {expression,contextId:executionContextId,awaitPromise:true,returnByValue:true});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
        return result.result.value;
    };
    await evaluate(`(() => {
        const listeners = [];
        const state = {};
        globalThis.chrome = {runtime:{id:'isolated-harness'},storage:{
            onChanged:{addListener(fn){listeners.push(fn);}},
            local:{
                get(keys,cb){cb(Object.fromEntries(keys.filter(k=>k in state).map(k=>[k,structuredClone(state[k])])));},
                set(values,cb){
                    const changes = {};
                    for(const [k,v] of Object.entries(values)){
                        if(JSON.stringify(state[k])!==JSON.stringify(v)) changes[k]={oldValue:state[k],newValue:v};
                        state[k]=structuredClone(v);
                    }
                    if(Object.keys(changes).length) listeners.forEach(fn=>fn(changes,'local'));
                    cb?.();
                }
            }
        }};
    })();`);
    await evaluate(fs.readFileSync(path.join(directory,'test-status.js'),'utf8'));
    await evaluate(fs.readFileSync(path.join(directory,'content.js'),'utf8'));
    return evaluate;
}

test('test package uses the exact extension code, with local-file matching and no hospital access', () => {
    for (const name of ['page-state.js','content.js','popup.js']) {
        assert.deepEqual(fs.readFileSync(path.join(directory,name)),fs.readFileSync(path.join(root,name)));
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
    assert.equal(manifest.version,'1.0');
    assert.deepEqual(manifest.content_scripts[0].matches,['file:///*/queuebee-test.html']);
    assert.equal(manifest.content_scripts[0].world,'MAIN');
    assert.deepEqual(manifest.content_scripts[0].js,['page-state.js']);
    assert.deepEqual(manifest.content_scripts[1].js,['test-status.js','content.js']);
    assert.deepEqual(manifest.host_permissions,['file:///*/queuebee-test.html']);
    assert.deepEqual(manifest.permissions,['storage']);
    assert.equal(fs.existsSync(path.join(directory,'storage-mock.js')),false);
});

test('test dashboard has no auto-clicker or fake Chrome storage of its own', async t => {
    const page = await dashboard(t);
    assert.equal(await page.locator('#extensionStatus').innerText(),'Waiting for extension…');
    assert.equal(await page.locator('#startBtn').count(),0);
    assert.equal(await page.evaluate(() => typeof chrome?.storage),'undefined');
    assert.equal(await page.evaluate(() => typeof queueBeeAutomationLoaded),'undefined');
    assert.equal(await page.locator('#queueRows > tr').count(),4);
    assert.doesNotMatch(await page.locator('#timeline').innerText(),/requested/);
});

test('isolated content script interacts with main-world queue controls and shared DOM status', async t => {
    const page = await dashboard(t);
    const evaluate = await injectHarness(page);
    assert.equal(await page.locator('#extensionStatus').innerText(),'Extension connected');
    await evaluate(`chrome.storage.local.set({isRunning:true,waitLimit:'15'})`);
    await page.waitForFunction(() => document.querySelector('#extensionCleared').textContent==='2',{},{timeout:20000});
    assert.deepEqual(await page.locator('#queueRows > tr').evaluateAll(rows=>rows.map(row=>row.dataset.demoRow)),['3003','3004']);
    assert.equal(await page.locator('#normalCalls').innerText(),'0');
    // Extension globals/API shim stay outside the simulated website's world.
    assert.equal(await page.evaluate(() => typeof chrome?.storage),'undefined');
    assert.equal(await page.evaluate(() => typeof queueBeeAutomationLoaded),'undefined');
});

test('isolated content script refuses Done when the simulated server switches patient', async t => {
    const page = await dashboard(t,'wrong');
    const evaluate = await injectHarness(page);
    await evaluate(`chrome.storage.local.set({isRunning:true,waitLimit:'15'})`);
    await page.waitForFunction(() => document.querySelector('#extensionMessage').textContent.includes('Patient number changed'),{},{timeout:10000});
    assert.equal(await page.locator('#extensionRunning').innerText(),'IDLE');
    assert.equal(await page.locator('#extensionCleared').innerText(),'0');
    assert.doesNotMatch(await page.locator('#timeline').innerText(),/Done requested/);
});

test('isolated content script reads the main-world lock without acquiring it', async t => {
    const page = await dashboard(t);
    const evaluate = await injectHarness(page);
    await page.evaluate(() => {
        window.theButtonLockTime = 60000;
        window.dtLastBtnLock = Date.now();
        window.savedLockTimestamp = dtLastBtnLock;
    });
    const result = await evaluate(`(() => {
        document.dispatchEvent(new Event('queuebee:read-button-lock'));
        return {
            globalsHidden:typeof theButtonLockTime === 'undefined',
            remaining:Number(document.documentElement.getAttribute('data-queuebee-button-lock'))
        };
    })()`);
    assert.equal(result.globalsHidden,true);
    assert.ok(result.remaining > 59000 && result.remaining <= 60001);
    assert.equal(await page.evaluate(()=>dtLastBtnLock===savedLockTimestamp),true);
});
