const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright-core');
let browser;
before(async () => {
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true});
});
after(async () => { await browser?.close(); });

async function fixture(t, options = {}) {
    const page = await browser.newPage();
    t.after(() => page.close());
    await page.clock.install();
    const rows = options.rows || [['3118', '00:15:00'], ['3119', '00:14:59']];
    // Reconstructed from the recording's ROW HTML, including its nested table,
    // exact data-info values, transaction IDs, and onmousedown handlers.
    await page.setContent(`<span id="lblqueueno" data-status="0">3118</span>
      <table id="controls"><tr><td data-info="CALL"><div class="btnMainCall"><span data-info="CALL" class="divCall">CALL</span></div></td>
      <td data-info="DONE"><div data-info="DONE" class="btnMainCall"><span data-info="DONE" class="divDone">DONE</span></div></td></tr></table>
      <div id="maincmsTooltips"><span class="divDone" data-info="DONE">DONE</span></div>
      <div class="OuterPopMsg"></div>
      <table id="tblmon1"><thead><tr><th>Queue No.</th><th>Service Name</th><th>Information</th><th>Issue Time</th><th>Wait Duration</th></tr></thead><tbody>
      ${rows.map(([num, wait], i) => `<tr id="row-${num}"><td><table class="monqueueinfo"><tr>
      <td data-queue="${num}" data-tranid="${i + 100}">${num}</td><td>
      <div class="divMonCall divSmallIcon divSmallSilentCallIcon" data-info="Silent Call" data-queue="${num}" data-tranid="${i + 100}" onmousedown="onMonCall(this)">silent icon</div>
      <div class="divMonCall divSmallCallIcon" data-info="CALL" data-queue="${num}" data-tranid="${i + 100}" onmousedown="onMonCall(this)">call icon</div>
      </td></tr></table></td><td>Kaunter Biasa</td><td></td><td>9:53:11 AM</td><td><span title="KPI:00:30:00">${wait}</span></td></tr>`).join('')}
      </tbody></table>`);
    await page.evaluate(options => {
        window.events = [];
        window.options = options;
        const listeners = [];
        window.state = {isRunning: true, waitLimit: '15', ...options.storage};
        window.chrome = {runtime: {}, storage: {
            onChanged: {addListener(fn) {listeners.push(fn);}},
            local: {
                get(keys, callback) {callback(Object.fromEntries(keys.filter(k => k in state).map(k => [k, state[k]])));},
                set(values, callback) {
                    const changes = {};
                    for (const [key, value] of Object.entries(values)) {
                        if (state[key] !== value) changes[key] = {oldValue:state[key], newValue:value};
                        state[key] = value;
                    }
                    if (Object.keys(changes).length) listeners.forEach(fn => fn(changes, 'local'));
                    callback?.();
                }
            }
        }};
        window.beginCall = num => {
            document.querySelector('.OuterPopMsg')?.remove();
            document.querySelector('#lblqueueno').textContent = options.wrongPatient || num;
            if (options.patientLabelDelay) {
                document.querySelector('#lblqueueno').textContent = '';
                setTimeout(() => {document.querySelector('#lblqueueno').textContent = num;}, options.patientLabelDelay);
            }
            document.querySelector('span.divCall').innerHTML = '<div>00:00:01</div>';
            if (options.fadedOverlay) {
                const overlay = document.createElement('div');
                overlay.className = 'OuterPopMsg';
                overlay.style.cssText = 'position:fixed;width:200px;height:100px;opacity:0;pointer-events:none';
                overlay.textContent = 'Previous confirmation';
                document.body.append(overlay);
            }
        };
        window.onMonCall = el => {
            const num = el.dataset.queue;
            events.push([el.dataset.info, num]);
            if (options.noResponse) return;
            if (!options.confirm) return beginCall(num);
            document.querySelector('.OuterPopMsg')?.remove();
            const box = document.createElement('div');
            box.className = 'OuterPopMsg';
            box.innerHTML = `<h2>${options.wrongDialog ? 'Call' : 'Silent Call'}</h2><p>Do you want to call ${options.dialogPatient || num} customer?</p><button id="yes">YES</button><button>NO</button>`;
            box.querySelector('#yes').onclick = () => { events.push(['YES', num]); beginCall(num); };
            document.body.append(box);
        };
        const doneRoot = document.querySelector('.btnMainCall[data-info="DONE"]');
        if (options.decorativeDoneLabel) document.querySelector('span.divDone').style.pointerEvents = 'none';
        if (options.disabledDone) doneRoot.classList.add('disabled');
        const finishCall = event => {
            if (options.directDoneHandler && event.target !== doneRoot) return;
            if (options.requirePressedMouse && event.buttons !== 1) return;
            events.push(['DONE', document.querySelector('#lblqueueno').textContent]);
            if (options.holdDone) return;
            const finish = () => {
                const num = document.querySelector('#lblqueueno').textContent;
                if (!options.keepRow) document.querySelector(`#row-${num}`)?.remove();
                document.querySelector('span.divCall').textContent = 'CALL';
                document.querySelector('#lblqueueno').textContent = '-END-';
                if (options.reloadDelay) {
                    document.querySelector('#tblmon1').style.display = 'none';
                    setTimeout(() => {document.querySelector('#tblmon1').style.display = '';}, options.reloadDelay);
                }
            };
            if (options.finishDelay) setTimeout(finish, options.finishDelay); else finish();
        };
        if (options.directDoneHandler) {
            doneRoot.addEventListener(options.doneClickOnly ? 'click' : 'mousedown',finishCall);
        } else {
            document.querySelector('td[data-info="DONE"]').onmousedown = finishCall;
        }
        if (options.manualCall) beginCall('9999');
    }, options);
    await page.addScriptTag({path: path.resolve(__dirname, '../content.js')});
    return page;
}
const advance = (page, ms = 3000) => page.clock.runFor(ms);
const events = page => page.evaluate(() => events);

test('ignores Issue Time and nested rows; leaves short and invalid waits alone', async t => {
    const p = await fixture(t, {rows:[['3118','00:14:59'], ['3119','00:00:10'], ['3120','9:53:11 AM'], ['3121','00:99:00']]});
    await advance(p, 10000);
    assert.deepEqual(await events(p), []);
});

test('threshold boundary, HH:MM:SS and MM:SS; counts each completed transaction once', async t => {
    const p = await fixture(t, {rows:[['3118','00:15:00'], ['3119','01:00:00'], ['3120','15:00'], ['3121','00:14:59']]});
    await advance(p, 10000);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118'],['Silent Call','3119'],['DONE','3119'],['Silent Call','3120'],['DONE','3120']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 3);
    assert.deepEqual(await p.evaluate(() => state.activityLogs.map(l => l.num)), ['3118','3119','3120']);
});

test('confirms only the exact Silent Call dialog for the intended patient', async t => {
    const p = await fixture(t, {confirm:true});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['YES','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done uses its clickable wrapper when the label is decorative', async t => {
    const p = await fixture(t, {decorativeDoneLabel:true,directDoneHandler:true});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done receives a pressed left mouse button on its action wrapper', async t => {
    const p = await fixture(t, {directDoneHandler:true,requirePressedMouse:true});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done supports a direct click handler on its wrapper', async t => {
    const p = await fixture(t, {directDoneHandler:true,doneClickOnly:true});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done is not blocked by a fully faded previous confirmation', async t => {
    const p = await fixture(t, {fadedOverlay:true});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done remains untouched when its wrapper is disabled', async t => {
    const p = await fixture(t, {disabledDone:true});
    await advance(p, 35000);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    assert.match(await p.evaluate(() => state.automationMessage), /enabled DONE control/);
});

test('Done waits for a briefly blank patient label instead of aborting during redraw', async t => {
    const p = await fixture(t, {patientLabelDelay:1000});
    await advance(p, 500);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    await advance(p, 2500);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

for (const options of [{wrongDialog:true}, {dialogPatient:'9999'}]) {
    test(`does not confirm an unrelated dialog: ${JSON.stringify(options)}`, async t => {
        const p = await fixture(t, {...options,confirm:true});
        await advance(p, 32000);
        assert.deepEqual(await events(p), [['Silent Call','3118']]);
        assert.equal(await p.evaluate(() => state.isRunning), false);
        assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    });
}

test('never clicks Done for a different patient', async t => {
    const p = await fixture(t, {wrongPatient:'9999'});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.match(await p.evaluate(() => state.automationMessage), /Patient number changed/);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('leaves an existing manual call alone', async t => {
    const p = await fixture(t, {manualCall:true});
    await advance(p, 10000);
    assert.deepEqual(await events(p), []);
});

test('waits for completion before counting or starting another queue', async t => {
    const p = await fixture(t, {rows:[['3118','00:20:00'], ['3119','00:18:00']],finishDelay:8000});
    await advance(p, 5000);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    await advance(p, 6000);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('STOP cancels pending actions and never resumes them after START', async t => {
    const p = await fixture(t, {noResponse:true});
    await advance(p, 1000);
    await p.evaluate(() => {chrome.storage.local.set({isRunning:false}); beginCall('3118');});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    await p.evaluate(() => chrome.storage.local.set({isRunning:true}));
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
});

test('waits for the refreshed waiting list, not an empty loading view', async t => {
    const p = await fixture(t, {reloadDelay:8000});
    await advance(p, 5000);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    await advance(p, 4000);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('a stalled Done is clicked once, never counted, then stops', async t => {
    const p = await fixture(t, {holdDone:true});
    await advance(p, 35000);
    assert.deepEqual(await events(p), [['Silent Call','3118'], ['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.isRunning), false);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
});

test('a threshold change cancels a pending sequence before further clicks', async t => {
    const p = await fixture(t, {noResponse:true});
    await advance(p, 1000);
    await p.evaluate(() => {chrome.storage.local.set({waitLimit:'40'}); beginCall('3118');});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('a background timer delayed past the deadline cannot click Done', async t => {
    const p = await fixture(t, {noResponse:true});
    await advance(p, 1000);
    await p.evaluate(() => beginCall('3118'));
    await p.clock.fastForward(60000);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('does not count a transaction that remains in the waiting list', async t => {
    const p = await fixture(t, {keepRow:true});
    await advance(p, 35000);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('reinjection does not create overlapping loops', async t => {
    const p = await fixture(t, {noResponse:true});
    await p.addScriptTag({path:path.resolve(__dirname,'../content.js')});
    await advance(p, 10000);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
});
