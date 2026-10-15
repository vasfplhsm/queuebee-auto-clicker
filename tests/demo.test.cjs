const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright-core');
let browser, directory, demo;
before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'queuebee-demo-test-'));
    demo = path.join(directory, 'demo.html');
    execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/build-demo.cjs'), demo]);
    browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true});
});
after(async () => {
    await browser?.close();
    if (directory) fs.rmSync(directory, {recursive:true, force:true});
});
async function open(t, scenario = 'baseline') {
    const page = await browser.newPage();
    const errors = [], external = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
        if (!request.url().startsWith('http://queuebee-demo.test/') && !request.url().startsWith('data:')) external.push(request.url());
    });
    t.after(async () => {
        await page.close();
        assert.deepEqual(errors, [], 'no JavaScript errors');
        assert.deepEqual(external, [], 'no network requests');
    });
    await page.clock.install();
    // This managed browser blocks file:// navigation. Serve the exact standalone
    // artifact via an intercepted test origin; no server or network is contacted.
    await page.route('http://queuebee-demo.test/**', route => route.fulfill({
        contentType:'text/html', body:fs.readFileSync(demo)
    }));
    await page.goto(`http://queuebee-demo.test/#${scenario}`);
    return page;
}
const read = page => page.evaluate(() => new Promise(resolve => chrome.storage.local.get(
    ['isRunning','clearedCount','activityLogs','automationMessage'], resolve)));
const timeline = page => page.locator('#timeline').innerText();

test('standalone file runs the real automation and leaves below-threshold queues', async t => {
    const page = await open(t);
    await page.locator('#startBtn').click();
    await page.clock.runFor(15000);
    const state = await read(page);
    assert.equal(state.clearedCount, 2);
    assert.deepEqual(state.activityLogs.map(log => log.num), ['3001','3002']);
    assert.deepEqual(await page.locator('#queueRows > tr').evaluateAll(rows => rows.map(row => row.dataset.demoRow)), ['3003','3004']);
    assert.equal(await page.locator('#normalCalls').innerText(), '0');
    assert.equal(await page.locator('#clearCount').innerText(), '2');
});

test('threshold controls affect the demo instead of a separate example algorithm', async t => {
    const page = await open(t);
    await page.locator('#timeLimit').selectOption('5');
    await page.locator('#startBtn').click();
    await page.clock.runFor(20000);
    assert.equal((await read(page)).clearedCount, 3);
    assert.equal(await page.locator('#queueRows > tr').count(), 1);
    assert.equal(await page.locator('#queueRows > tr').getAttribute('data-demo-row'), '3004');
    assert.equal(await page.locator('#normalCalls').innerText(), '0');
});

test('all-below scenario leaves every patient untouched', async t => {
    const page = await open(t, 'below');
    await page.locator('#startBtn').click();
    await page.clock.runFor(10000);
    assert.equal((await read(page)).clearedCount, 0);
    assert.equal(await page.locator('#queueRows > tr').count(), 4);
    assert.doesNotMatch(await timeline(page), /requested/);
});

test('slow demo shows one pending transaction and STOP prevents new actions', async t => {
    const page = await open(t, 'slow');
    await page.locator('#startBtn').click();
    await page.clock.runFor(7000);
    assert.equal((await read(page)).clearedCount, 0);
    assert.equal((await timeline(page)).match(/Silent Call requested/g)?.length, 1);
    await page.locator('#stopBtn').click();
    await page.clock.runFor(15000);
    assert.equal((await read(page)).isRunning, false);
    assert.equal((await timeline(page)).match(/Silent Call requested/g)?.length, 1);
    assert.equal(await page.locator('#normalCalls').innerText(), '0');
});

test('wrong-patient demo stops before Done', async t => {
    const page = await open(t, 'wrong');
    await page.locator('#startBtn').click();
    await page.clock.runFor(8000);
    const state = await read(page);
    assert.equal(state.isRunning, false);
    assert.equal(state.clearedCount, 0);
    assert.match(state.automationMessage, /Patient number changed/);
    assert.doesNotMatch(await timeline(page), /Done requested/);
});

test('timeout demo stops without counting an unfinished patient', async t => {
    const page = await open(t, 'timeout');
    await page.locator('#startBtn').click();
    await page.clock.runFor(37000);
    const state = await read(page);
    assert.equal(state.isRunning, false);
    assert.equal(state.clearedCount, 0);
    assert.match(state.automationMessage, /Timed out/);
    assert.equal((await timeline(page)).match(/Done requested/g)?.length, 1);
});

test('manual CALL is recorded and automation leaves it alone', async t => {
    const page = await open(t);
    await page.locator('#manualCall').click();
    await page.locator('#startBtn').click();
    await page.clock.runFor(5000);
    assert.equal(await page.locator('#normalCalls').innerText(), '1');
    assert.equal((await read(page)).clearedCount, 0);
    assert.doesNotMatch(await timeline(page), /Silent Call requested|Done requested/);
});

test('scenario selection reloads into a fresh idle demo', async t => {
    const page = await open(t);
    await page.locator('#startBtn').click();
    await page.clock.runFor(15000);
    await Promise.all([
        page.waitForEvent('load'),
        page.locator('#scenario').selectOption('below')
    ]);
    assert.equal(await page.locator('#scenario').inputValue(), 'below');
    assert.equal((await read(page)).clearedCount, 0);
    assert.equal((await read(page)).isRunning, false);
});
