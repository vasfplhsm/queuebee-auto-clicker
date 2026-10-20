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
        if (options.liveSnapshot) {
            document.querySelector('td[data-info="DONE"]').outerHTML = options.liveSnapshot.done;
        }
        if (options.outerDoneWrapper) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pointer buttonCall buttonDone';
            wrapper.innerHTML = '<table><tbody><tr></tr></tbody></table>';
            wrapper.querySelector('tr').append(document.querySelector('td[data-info="DONE"]'));
            document.querySelector('#controls').after(wrapper);
            wrapper.parentElement.insertBefore(Object.assign(document.createElement('div'), {className:'trDone'}), wrapper);
            document.querySelector('.trDone').style.cursor = options.doneCursor || 'pointer';
        }
        window.events = [];
        window.doneAttempts = [];
        window.theButtonLockTime = options.buttonLockMs || 0;
        window.dtLastBtnLock = 0;
        window.onPressDelay = () => {
            const now = Date.now();
            if (Math.abs(now - dtLastBtnLock) <= theButtonLockTime) return false;
            dtLastBtnLock = now;
            return true;
        };
        window.options = options;
        const listeners = [];
        window.state = {isRunning: true, waitLimit: '15', ...options.storage};
        window.chrome = {runtime: {onMessage:{addListener(fn){window.extensionMessageListener=fn;}}}, storage: {
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
            window.callStartedAt = Date.now();
            document.querySelector('.OuterPopMsg')?.remove();
            document.querySelector('#lblqueueno').textContent = options.wrongPatient || num;
            if (options.patientLabelDelay) {
                document.querySelector('#lblqueueno').textContent = '';
                setTimeout(() => {document.querySelector('#lblqueueno').textContent = num;}, options.patientLabelDelay);
            }
            document.querySelector('span.divCall').innerHTML = '<div>00:00:01</div>';
            if (options.liveSnapshot) {
                document.querySelector('#lblqueueno').outerHTML = options.liveSnapshot.queue;
                document.querySelector('span.divCall[data-info="CALL"]').outerHTML = options.liveSnapshot.call;
            }
            if (options.fadedOverlay) {
                const overlay = document.createElement('div');
                overlay.className = 'OuterPopMsg';
                overlay.style.cssText = 'position:fixed;width:200px;height:100px;opacity:0;pointer-events:none';
                overlay.textContent = 'Previous confirmation';
                document.body.append(overlay);
            }
            if (options.doneCursorDelay) {
                document.querySelector('.trDone').style.cursor = 'default';
                setTimeout(() => {document.querySelector('.trDone').style.cursor = 'pointer';}, options.doneCursorDelay);
            }
        };
        window.onMonCall = el => {
            if (options.buttonLockMs && !onPressDelay()) return;
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
        const doneRoot = document.querySelector(options.outerDoneWrapper ? '.buttonDone' : '.btnMainCall[data-info="DONE"]');
        if (options.decorativeDoneLabel) document.querySelector('span.divDone').style.pointerEvents = 'none';
        if (options.disabledDone) doneRoot.classList.add('disabled');
        const finishCall = event => {
            if (options.directDoneHandler && event.target !== doneRoot) return;
            if (options.requirePressedMouse && event.buttons !== 1) return;
            window.doneRequestedAt = Date.now();
            window.doneAttempts.push({num:document.querySelector('#lblqueueno').textContent, time:Date.now()});
            events.push(['DONE', document.querySelector('#lblqueueno').textContent]);
            if (options.holdDone || doneAttempts.length <= (options.ignoreDoneAttempts || 0)) return;
            const num = document.querySelector('#lblqueueno').textContent;
            const finish = () => {
                // A delayed duplicate response belongs to its original queue.
                if (document.querySelector('#lblqueueno').textContent !== num ||
                    document.querySelector('span.divCall').textContent === 'CALL') return;
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
        if (options.outerDoneWrapper) {
            doneRoot.addEventListener('click', event => {
                event.stopPropagation();
                event.preventDefault();
                window.doneEventTarget = event.target.className;
                if (options.buttonLockMs && !onPressDelay()) {events.push(['REJECTED DONE']); return;}
                if (getComputedStyle(document.querySelector('.trDone')).cursor !== 'pointer') return;
                finishCall(event);
            });
        } else if (options.directDoneHandler) {
            doneRoot.addEventListener(options.doneClickOnly ? 'click' : 'mousedown',finishCall);
        } else {
            document.querySelector('td[data-info="DONE"]').onmousedown = finishCall;
        }
        if (options.manualCall) beginCall('9999');
    }, options);
    await page.addScriptTag({path: path.resolve(__dirname, '../page-state.js')});
    await page.addScriptTag({path: path.resolve(__dirname, '../content.js')});
    return page;
}
const advance = (page, ms = 8000) => page.clock.runFor(ms);
const events = page => page.evaluate(() => events);

test('ignores Issue Time and nested rows; leaves short and invalid waits alone', async t => {
    const p = await fixture(t, {rows:[['3118','00:14:59'], ['3119','00:00:10'], ['3120','9:53:11 AM'], ['3121','00:99:00']]});
    await advance(p, 10000);
    assert.deepEqual(await events(p), []);
});

test('dashboard reports the running content-script build without changing automation', async t => {
    const p = await fixture(t,{rows:[['3118','00:01:00']]});
    const response = await p.evaluate(() => new Promise(resolve => {
        extensionMessageListener({type:'queuebee:build'}, {}, resolve);
    }));
    assert.deepEqual(response,{build:'DONE-4'});
    assert.deepEqual(await events(p),[]);
});

test('threshold boundary, HH:MM:SS and MM:SS; counts each completed transaction once', async t => {
    const p = await fixture(t, {rows:[['3118','00:15:00'], ['3119','01:00:00'], ['3120','15:00'], ['3121','00:14:59']]});
    await advance(p, 25000);
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
    assert.equal(await p.evaluate(() => state.isRunning),true);
    await p.evaluate(()=>document.querySelector('.btnMainCall[data-info="DONE"]').classList.remove('disabled'));
    await advance(p,1000);
    assert.equal(await p.evaluate(()=>state.clearedCount),1);
});

test('Done waits for a briefly blank patient label instead of aborting during redraw', async t => {
    const p = await fixture(t, {patientLabelDelay:1000});
    await advance(p, 500);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    await advance(p, 6500);
    assert.deepEqual(await events(p), [['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('Done targets the outer buttonDone action with the captured direct click handler', async t => {
    const p = await fixture(t,{outerDoneWrapper:true});
    await advance(p);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(()=>window.doneEventTarget),'pointer buttonCall buttonDone');
    assert.equal(await p.evaluate(()=>state.clearedCount),1);
});

test('Done allows at least five seconds for the active patient to load', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,buttonLockMs:200});
    await advance(p,4500);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    assert.equal(await p.evaluate(()=>state.clearedCount || 0),0);
    assert.match(await p.evaluate(()=>state.automationMessage),/Waiting 5 seconds/);
    await advance(p,1000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118']]);
    assert.ok(await p.evaluate(()=>doneRequestedAt-callStartedAt >= 5000));
    assert.equal(await p.evaluate(()=>state.clearedCount),1);
});

test('the five-second pause starts after activation, including a slow Silent Call response', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,noResponse:true});
    await p.evaluate(()=>setTimeout(()=>beginCall('3118'),3000));
    await advance(p,7000);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    await advance(p,2000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118']]);
    assert.ok(await p.evaluate(()=>doneRequestedAt-callStartedAt >= 5000));
});

test('STOP during the five-second loading pause cancels Done', async t => {
    const p = await fixture(t,{outerDoneWrapper:true});
    await advance(p,2000);
    await p.evaluate(()=>chrome.storage.local.set({isRunning:false}));
    await advance(p,10000);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    assert.equal(await p.evaluate(()=>state.clearedCount || 0),0);
});

test('Done waits past the captured 200 ms button lock and completes successive queues', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,buttonLockMs:200,rows:[['3118','00:15:00'],['3119','00:16:00']]});
    await advance(p,100);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    await advance(p,13000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118'],['Silent Call','3119'],['DONE','3119']]);
    assert.equal(await p.evaluate(()=>state.clearedCount),2);
});

test('Done waits for the actual trDone cursor readiness condition', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,doneCursorDelay:7000});
    await advance(p,6500);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    await advance(p,1500);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118']]);
});

test('STOP during the button lock prevents Done', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,buttonLockMs:8000});
    await advance(p,5500);
    await p.evaluate(()=>chrome.storage.local.set({isRunning:false}));
    await advance(p,8000);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    assert.equal(await p.evaluate(()=>state.clearedCount || 0),0);
});

test('a patient changed while Done is locked is never completed', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,buttonLockMs:8000});
    await advance(p,5500);
    await p.evaluate(()=>{document.querySelector('#lblqueueno').textContent='9999';});
    await advance(p,3000);
    assert.deepEqual(await events(p),[['Silent Call','3118']]);
    assert.match(await p.evaluate(()=>state.automationMessage),/Patient number changed/);
});

test('reading the lock preserves its timestamp and rejects the exact 200 ms boundary', async t => {
    const p = await fixture(t,{rows:[['3118','00:01:00']]});
    // Hold Date.now fixed so dispatch cannot cross the one-millisecond boundary.
    await p.clock.setFixedTime(new Date('2026-10-20T00:00:00Z'));
    const result = await p.evaluate(() => {
        window.theButtonLockTime = 200;
        window.dtLastBtnLock = Date.now() - 200;
        const before = dtLastBtnLock;
        document.dispatchEvent(new Event('queuebee:read-button-lock'));
        const remaining = Number(document.documentElement.getAttribute('data-queuebee-button-lock'));
        return {remaining, unchanged:dtLastBtnLock === before};
    });
    assert.deepEqual(result,{remaining:1,unchanged:true});
});

for (const [num, timer] of [['3321','00:02:27'], ['3342','00:00:00']]) {
    test(`Done handles the supplied dashboard markup for queue ${num}, timer ${timer}`, async t => {
        const p = await fixture(t, {
            rows:[[num,'00:15:00'],['3999','00:14:59']],
            outerDoneWrapper:true,
            buttonLockMs:200,
            liveSnapshot:{
                queue:`<span id="lblqueueno" class="focusInput" data-status="0" data-size="35px" style="">${num}</span>`,
                call:`<span data-info="CALL" class="divCall"><div style="">${timer} </div></span>`,
                done:'<td data-info="DONE"><div data-info="DONE" class="roundImg" style="background-image:url(icons/done.png);"></div><div data-info="DONE" class="btnMainCall"><span data-info="DONE" class="divDone">DONE</span></div></td>'
            }
        });
        await advance(p);
        assert.deepEqual(await events(p), [['Silent Call',num],['DONE',num]]);
        assert.equal(await p.evaluate(() => state.clearedCount),1);
        assert.deepEqual(await p.evaluate(() => state.activityLogs.map(log => log.num)),[num]);
    });
}

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
    await advance(p, 9000);
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
    await advance(p, 10000);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    await advance(p, 4000);
    assert.equal(await p.evaluate(() => state.clearedCount), 1);
});

test('a stalled Done retries every five seconds beyond 30 seconds without pausing', async t => {
    const p = await fixture(t, {holdDone:true});
    await advance(p, 42000);
    const attempts = await p.evaluate(() => doneAttempts);
    assert.equal(attempts.length,8);
    assert.ok(attempts.every(attempt=>attempt.num==='3118'));
    for(let i=1;i<attempts.length;i++) assert.ok(attempts[i].time-attempts[i-1].time>=5000);
    assert.equal((await events(p)).filter(event=>event[0]==='Silent Call').length,1);
    assert.equal(await p.evaluate(() => state.isRunning), true);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
});

test('ignored Done attempts retry until success, count once, then continue with the next patient', async t => {
    const p = await fixture(t,{outerDoneWrapper:true,ignoreDoneAttempts:2,rows:[['3118','00:20:00'],['3119','00:18:00']]});
    await advance(p,11000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(()=>state.clearedCount || 0),0);
    assert.equal(await p.evaluate(()=>state.isRunning),true);
    await advance(p,15000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118'],['DONE','3118'],['DONE','3118'],['Silent Call','3119'],['DONE','3119']]);
    assert.equal(await p.evaluate(()=>state.clearedCount),2);
    assert.deepEqual(await p.evaluate(()=>state.activityLogs.map(log=>log.num)),['3118','3119']);
});

test('STOP cancels pending Done retries and START does not resume the previous active call', async t => {
    const p = await fixture(t,{holdDone:true});
    await advance(p,11000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),2);
    await p.evaluate(()=>chrome.storage.local.set({isRunning:false}));
    await advance(p,20000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),2);
    await p.evaluate(()=>chrome.storage.local.set({isRunning:true}));
    await advance(p,10000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),2);
});

test('Done retries never follow a different active patient', async t => {
    const p = await fixture(t,{holdDone:true});
    await advance(p,6000);
    await p.evaluate(()=>{document.querySelector('#lblqueueno').textContent='9999';});
    await advance(p,15000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118']]);
    assert.match(await p.evaluate(()=>state.automationMessage),/Patient number changed/);
});

test('a delayed Done response counts once and ends retries after completion', async t => {
    const p = await fixture(t,{finishDelay:8000});
    await advance(p,25000);
    assert.deepEqual(await events(p),[['Silent Call','3118'],['DONE','3118'],['DONE','3118']]);
    assert.equal(await p.evaluate(()=>state.clearedCount),1);
    assert.deepEqual(await p.evaluate(()=>state.activityLogs.map(log=>log.num)),['3118']);
});

test('a background-delayed Done retry resumes without pausing or replaying missed attempts', async t => {
    const p = await fixture(t,{holdDone:true});
    await advance(p,6000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),1);
    await p.clock.fastForward(60000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),2);
    assert.equal(await p.evaluate(()=>state.isRunning),true);
    await advance(p,5000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),3);
});

test('a slow waiting-list refresh does not pause or click Done after the call timer ends', async t => {
    const p = await fixture(t,{reloadDelay:40000});
    await advance(p,42000);
    assert.equal(await p.evaluate(()=>doneAttempts.length),1);
    assert.equal(await p.evaluate(()=>state.clearedCount || 0),0);
    assert.equal(await p.evaluate(()=>state.isRunning),true);
    await advance(p,5000);
    assert.equal(await p.evaluate(()=>state.clearedCount),1);
});

test('a threshold change cancels a pending sequence before further clicks', async t => {
    const p = await fixture(t, {noResponse:true});
    await advance(p, 1000);
    await p.evaluate(() => {chrome.storage.local.set({waitLimit:'40'}); beginCall('3118');});
    await advance(p);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('a Silent Call response delayed past its deadline cannot click Done', async t => {
    const p = await fixture(t, {noResponse:true});
    await advance(p, 1000);
    await p.evaluate(() => beginCall('3118'));
    await p.clock.fastForward(60000);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
    assert.equal(await p.evaluate(() => state.isRunning), false);
});

test('does not count a transaction that remains in the waiting list', async t => {
    const p = await fixture(t, {keepRow:true});
    await advance(p, 40000);
    assert.equal(await p.evaluate(() => state.clearedCount || 0), 0);
    assert.equal(await p.evaluate(() => state.isRunning), true);
    assert.equal((await events(p)).filter(event=>event[0]==='DONE').length,1);
});

test('reinjection does not create overlapping loops', async t => {
    const p = await fixture(t, {noResponse:true});
    await p.addScriptTag({path:path.resolve(__dirname,'../content.js')});
    await advance(p, 10000);
    assert.deepEqual(await events(p), [['Silent Call','3118']]);
});
