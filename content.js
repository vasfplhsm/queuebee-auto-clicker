(() => {
    // Reinjection must never start a second loop in this tab.
    if (globalThis.queueBeeAutomationLoaded) return;
    globalThis.queueBeeAutomationLoaded = true;

    const QUEUEBEE_BUILD = 'DONE-2';
    chrome.runtime.onMessage?.addListener((message, sender, reply) => {
        if (message?.type === 'queuebee:build') reply({build:QUEUEBEE_BUILD});
        return false;
    });
    console.info(`QueueBee build ${QUEUEBEE_BUILD} loaded`);

    const ding = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YV9vT18AZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAD///8BAP//AgD//wMA//8EAP//BQD//wYA//8HAP//CAD//wkA//8KAP//CwD//wwA//8NAP//DgD//w8A//8QAP//EQD//xIA//8TAP//FAD//xUA//8WAP//FwD//xgA//8ZAP//GgD//xsA//8cAP//HQD//x4A//8fAP//IAD//yEA//8iAP//IwD//yQA//8lAP//JgD//ycA//8oAP//KQD//yoA//8rAP//LAD//y0A//8uAP//LwD//zAA//8xAP//MgD//zMA//80AP//NQD//zYA//83AP//OAD//zkA//86AP//OwD//zwA//89AP//PgD//z8A");
    const STEP_TIMEOUT_MS = 30000;
    let revision = 0;
    const completed = new Set();
    const text = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const get = keys => new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, value => chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message)) : resolve(value));
    });
    const set = values => new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => chrome.runtime.lastError
            ? reject(new Error(chrome.runtime.lastError.message)) : resolve());
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && (changes.isRunning || changes.waitLimit)) revision++;
    });
    class Cancelled extends Error {}

    function visible(el) {
        if (!el?.isConnected || el.closest('#maincmsTooltips, [hidden], [aria-hidden="true"]') ||
            !Array.from(el.getClientRects()).some(rect => rect.width > 0 && rect.height > 0) ||
            getComputedStyle(el).visibility !== 'visible') return false;
        // A dismissed confirmation can remain mounted while fully transparent.
        for (let parent = el; parent; parent = parent.parentElement) {
            if (getComputedStyle(parent).opacity === '0') return false;
        }
        return true;
    }
    function enabled(el) {
        return visible(el) && !el.closest('[disabled], [aria-disabled="true"], .disabled') &&
            getComputedStyle(el).pointerEvents !== 'none';
    }
    function durationSeconds(value) {
        const match = value.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
        if (!match || +match[2] > 59 || +match[3] > 59) return null;
        return +(match[1] || 0) * 3600 + +match[2] * 60 + +match[3];
    }

    function waitHeader(table) {
        return Array.from(table.rows).find(row => row.closest('table') === table &&
            Array.from(row.cells).some(cell => /^wait\s+duration$/i.test(text(cell))));
    }
    function waitingListVisible() {
        return Array.from(document.querySelectorAll('table')).some(table => visible(table) && waitHeader(table));
    }
    function waitingRows() {
        const result = [];
        for (const table of document.querySelectorAll('table')) {
            const header = waitHeader(table);
            if (!header || !visible(table)) continue;
            let column = 0;
            for (const cell of header.cells) {
                if (/^wait\s+duration$/i.test(text(cell))) break;
                column += cell.colSpan;
            }
            for (const row of table.rows) {
                if (row === header || row.closest('table') !== table || !visible(row)) continue;
                // The first outer cell contains a nested monqueueinfo table.
                // Never scan that table, Issue Time, or the entire row for a time.
                const seconds = durationSeconds(text(row.cells[column]));
                const identity = row.cells[0]?.querySelector('[data-queue][data-tranid]');
                if (seconds === null || !identity) continue;
                const num = identity.getAttribute('data-queue');
                const transaction = identity.getAttribute('data-tranid');
                if (!/^[A-Za-z0-9-]+$/.test(num || '') || !transaction) continue;
                const silent = Array.from(row.querySelectorAll('[data-info="Silent Call"][data-queue][data-tranid]'))
                    .filter(el => el.getAttribute('data-queue') === num &&
                        el.getAttribute('data-tranid') === transaction && enabled(el));
                if (silent.length === 1) result.push({seconds, num, transaction, silent: silent[0], key: `${num}:${transaction}`});
            }
        }
        return result;
    }
    function callTimer() {
        const labels = Array.from(document.querySelectorAll('span.divCall[data-info="CALL"]')).filter(visible);
        return labels.length === 1 ? durationSeconds(text(labels[0])) : null;
    }
    function selectedQueue() {
        const label = document.querySelector('#lblqueueno');
        return visible(label) ? text(label) : '';
    }
    function transactionPresent(candidate) {
        return Array.from(document.querySelectorAll('.monqueueinfo [data-queue][data-tranid]')).some(el =>
            el.getAttribute('data-queue') === candidate.num && el.getAttribute('data-tranid') === candidate.transaction);
    }
    function buttonLockRemaining() {
        // MAIN and isolated content scripts share the DOM, not page globals.
        // A synchronous read also notices manual actions during our wait.
        const root = document.documentElement;
        root.removeAttribute('data-queuebee-button-lock');
        document.dispatchEvent(new Event('queuebee:read-button-lock'));
        const value = root.getAttribute('data-queuebee-button-lock');
        root.removeAttribute('data-queuebee-button-lock');
        return value !== null && Number.isFinite(Number(value)) ? Number(value) : null;
    }
    function doneControl() {
        const labels = Array.from(document.querySelectorAll('span.divDone[data-info="DONE"]')).filter(visible);
        if (labels.length !== 1 || labels[0].closest('[disabled], [aria-disabled="true"], .disabled')) return null;
        // Live QB10 binds click on .buttonDone, outside the caption and TD.
        // _MultiButtonDone also requires the first .trDone cursor to be pointer.
        const action = labels[0].closest('.buttonDone');
        const gate = document.querySelector('.trDone');
        if (action && (!gate || getComputedStyle(gate).cursor !== 'pointer')) return null;
        for (let control = labels[0]; control && control !== document.body; control = control.parentElement) {
            const info = control.getAttribute('data-info');
            if (info && info !== 'DONE') return null;
            if (control.querySelector('[data-info="CALL"], [data-info="Silent Call"]')) return null;
            if (action) {
                if (control === action) return enabled(control) ? control : null;
                continue;
            }
            if (control.matches('button, a, [role="button"], [onmousedown], [onclick], .button, .btnMainCall, td[data-info="DONE"]') &&
                enabled(control)) return control;
        }
        return null;
    }
    function dialogs() {
        return Array.from(document.querySelectorAll(
            '[role="dialog"], .modal, .jconfirm-box, .swal2-popup, .sweet-alert, .OuterPopMsg'
        )).filter(visible);
    }
    function silentConfirmation(num) {
        // Custom QueueBee dialogs may lack an ARIA role. Find the exact heading,
        // then the smallest container with YES and NO, scoped to this patient.
        const titles = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,div,span'))
            .filter(el => visible(el) && el.children.length === 0 && text(el) === 'Silent Call');
        for (const title of titles) {
            for (let box = title.parentElement; box && box !== document.body; box = box.parentElement) {
                const choices = Array.from(box.querySelectorAll('button,a,input,div,span,[role="button"]'))
                    .filter(el => enabled(el) && (el.children.length === 0 || el.matches('button,a,[role="button"]')));
                const yes = choices.filter(el => /^yes$/i.test(text(el) || el.value || ''));
                const no = choices.filter(el => /^no$/i.test(text(el) || el.value || ''));
                if (!yes.length || !no.length) continue;
                const numbers = text(box).match(/\b[A-Za-z]*\d+[A-Za-z0-9-]*\b/g) || [];
                if (yes.length === 1 && no.length === 1 && numbers.length === 1 && numbers[0] === num) {
                    return {yes: yes[0]};
                }
                break;
            }
        }
        return null;
    }
    function activate(el) {
        if (!enabled(el)) throw new Error('The intended control is no longer available.');
        // Captured row markup uses onmousedown="onMonCall(this)".
        // Select the exact DOM control, never a neighbouring CALL icon.
        const rect = el.getBoundingClientRect();
        const mouse = {bubbles:true, cancelable:true, view:window, button:0,
            clientX:rect.left + rect.width / 2, clientY:rect.top + rect.height / 2};
        if (el.hasAttribute('onmousedown')) {
            el.dispatchEvent(new MouseEvent('mousedown', {...mouse, buttons:1}));
        } else {
            // Main controls can use delegated mouse handlers as well as click.
            // Send one mouse gesture to the exact action; never retry it.
            el.dispatchEvent(new MouseEvent('mousedown', {...mouse, buttons:1}));
            if (!enabled(el)) return;
            el.dispatchEvent(new MouseEvent('mouseup', {...mouse, buttons:0}));
            el.dispatchEvent(new MouseEvent('click', {...mouse, buttons:0}));
        }
    }
    async function check(run, deadline, description = 'QueueBee') {
        const config = await get(['isRunning', 'waitLimit']);
        if (!config.isRunning || revision !== run.revision || Number(config.waitLimit ?? 25) !== run.threshold) {
            throw new Cancelled('Settings changed.');
        }
        if (deadline && Date.now() >= deadline) {
            throw new Error(`Timed out waiting for ${typeof description === 'function' ? description() : description}.`);
        }
    }
    async function waitFor(run, predicate, description) {
        const deadline = Date.now() + STEP_TIMEOUT_MS;
        while (true) {
            await check(run, deadline, description);
            const value = predicate();
            if (value) return value;
            await sleep(250);
        }
    }
    async function record(candidate) {
        const data = await get(['clearedCount', 'activityLogs']);
        const logs = Array.isArray(data.activityLogs) ? data.activityLogs : [];
        const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        await set({clearedCount: (Number(data.clearedCount) || 0) + 1,
            activityLogs: [...logs, {num: candidate.num, time}].slice(-50)});
    }
    async function processOne(run, threshold) {
        // A timer identifies an active call, including a manually started call.
        if (callTimer() !== null || dialogs().length) return;
        const lock = buttonLockRemaining();
        if (lock === null) throw new Error('QueueBee button-lock reader is unavailable. Reload the extension and dashboard.');
        if (lock > 0) return;
        const candidate = waitingRows().find(item => item.seconds >= threshold * 60 && !completed.has(item.key));
        if (!candidate) return;
        let started = false;
        try {
            await check(run);
            await set({automationMessage: `Silent Call: ${candidate.num}`});
            await check(run);
            // AJAX may have replaced/reordered rows while storage was read.
            const fresh = waitingRows().find(item => item.key === candidate.key && item.seconds >= threshold * 60);
            if (!fresh || callTimer() !== null || dialogs().length) return;
            activate(fresh.silent);
            started = true;
            // Support both immediate silent calls and YES/NO confirmations.
            await waitFor(run, () => callTimer() !== null || silentConfirmation(candidate.num), 'Silent Call confirmation or the active CALL timer');
            const confirmation = silentConfirmation(candidate.num);
            if (confirmation) {
                await check(run);
                if (silentConfirmation(candidate.num)?.yes !== confirmation.yes) throw new Error('Confirmation changed.');
                activate(confirmation.yes);
            }
            await set({automationMessage:`Waiting for DONE: ${candidate.num}`});
            await waitFor(run, () => {
                if (callTimer() === null) return false;
                const selected = selectedQueue();
                // The queue label can disappear briefly while the service panel
                // redraws. Wait for it; never click Done without a matching number.
                if (!selected || selected === '-END-') return false;
                if (selected !== candidate.num) throw new Error('Patient number changed.');
                return !dialogs().length && doneControl() && buttonLockRemaining() === 0;
            }, () => callTimer() === null ? 'the active CALL timer' : dialogs().length
                ? 'the confirmation dialog to close' : selectedQueue() !== candidate.num
                    ? `queue ${candidate.num} to appear in the patient panel` : !doneControl()
                        ? 'the enabled DONE control' : buttonLockRemaining() === null
                            ? 'the QueueBee button-lock reader' : 'the QueueBee button lock to expire');
            await check(run);
            if (selectedQueue() !== candidate.num || callTimer() === null || dialogs().length) {
                throw new Error('Patient state changed before Done.');
            }
            const done = doneControl();
            if (!done || buttonLockRemaining() !== 0) throw new Error('The exact DONE control is unavailable or locked.');
            activate(done);
            await set({automationMessage:`DONE requested: ${candidate.num}; waiting for completion`});
            // A click alone is not completion: require both the timer to end and
            // this transaction to leave the waiting list before counting it.
            await waitFor(run, () => callTimer() === null && waitingListVisible() &&
                !transactionPresent(candidate) && !dialogs().length, 'the waiting list to refresh after DONE');
            completed.add(candidate.key);
            await record(candidate);
            ding.play().catch(() => {});
            await set({automationMessage: `Completed: ${candidate.num}`});
        } catch (error) {
            if (started) await set({isRunning: false,
                automationMessage: `Stopped: ${error.message} Check queue ${candidate.num} before START.`});
            throw error;
        }
    }
    async function scan() {
        try {
            const config = await get(['isRunning', 'waitLimit']);
            if (config.isRunning) {
                const threshold = Number(config.waitLimit ?? 25);
                if (![5,10,15,20,25,30,35,40].includes(threshold)) throw new Error('Choose a valid wait threshold (5–40 minutes).');
                await processOne({revision, threshold}, threshold);
            }
        } catch (error) {
            if (!(error instanceof Cancelled)) {
                console.warn(`QueueBee [${QUEUEBEE_BUILD}] stopped:`, error.message);
                const config = await get(['isRunning']);
                if (config.isRunning) await set({isRunning: false, automationMessage: `Stopped: ${error.message}`});
            }
        } finally {
            // Schedule AFTER completion. Background throttling may delay a step,
            // but cannot start another sequence while this one is pending.
            setTimeout(scan, 2000);
        }
    }
    scan();
})();
