/* Simulated QueueBee UI. The automation itself is loaded from ../content.js. */
(() => {
    const descriptions = {
        baseline: 'At 15 minutes: 3001 and 3002 should clear; 3003 (14:59) and 3004 (04:40) should remain. Normal calls should stay at 0.',
        below: 'With the threshold at 15 minutes, START should leave every queue untouched.',
        slow: 'Completion takes 8 seconds. Watch that the next queue starts only after the current queue finishes. You can also switch tabs and return.',
        wrong: 'The simulator will return patient 9999 after Silent Call. Automation should stop without clicking Done or increasing the counter.',
        timeout: 'Done will receive no response. After 30 seconds, automation should stop with a message and a cleared count of 0.'
    };
    const mode = Object.hasOwn(descriptions, location.hash.slice(1)) ? location.hash.slice(1) : 'baseline';
    const byId = id => document.getElementById(id);
    let active = null;
    let finishing = false;
    let normalCalls = 0;
    let startedAt = 0;
    // Match the live QB10 guard captured from the user's dashboard.
    window.theButtonLockTime = 200;
    window.dtLastBtnLock = 0;
    function onPressDelay() {
        const now = Date.now();
        if (Math.abs(now - window.dtLastBtnLock) <= window.theButtonLockTime) return false;
        window.dtLastBtnLock = now;
        return true;
    }
    const format = seconds => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');

    function log(message) {
        const item = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
        const detail = document.createElement('span');
        detail.textContent = message;
        item.append(time, detail);
        byId('timeline').prepend(item);
    }

    function current(num, attending) {
        byId('lblqueueno').textContent = num;
        byId('patientState').textContent = attending ? 'ATTENDING' : 'NEXT';
        byId('manualCall').disabled = attending;
        byId('manualDone').disabled = !attending;
        document.querySelector('.trDone').style.cursor = attending ? 'pointer' : 'default';
        document.querySelectorAll('.row-action').forEach(button => {button.disabled = attending;});
    }
    function begin(num, type) {
        active = num;
        startedAt = Date.now();
        current(mode === 'wrong' && type === 'Silent Call' ? '9999' : num, true);
        document.querySelector('span.divCall').textContent = '00:00:00';
        log(`${type} active for queue ${byId('lblqueueno').textContent}.`);
    }
    function request(num, type) {
        if (active || document.querySelector('.OuterPopMsg')) return;
        if (!onPressDelay()) return;
        log(`${type} requested for queue ${num}.`);
        if (type === 'CALL') {
            byId('normalCalls').textContent = String(++normalCalls);
            begin(num, type);
            return;
        }
        const overlay = document.createElement('div');
        overlay.className = 'OuterPopMsg';
        overlay.innerHTML = `<div class="dialog-box" role="dialog" aria-modal="true" aria-label="Silent Call"><h2>Silent Call</h2><p>Do you want to call ${num} customer?</p><div class="button-row"><button id="confirmYes" disabled>YES</button><button id="confirmNo" class="secondary">NO</button></div></div>`;
        document.body.append(overlay);
        const yes = byId('confirmYes');
        // A short simulated response gives the dialog time to be seen on screen.
        setTimeout(() => {yes.disabled = false;}, 1000);
        yes.onclick = () => {
            if (!onPressDelay()) return;
            overlay.remove();
            log(`Silent Call confirmed for queue ${num}.`);
            setTimeout(() => begin(num, type), 600);
        };
        byId('confirmNo').onclick = () => {overlay.remove(); log(`Silent Call cancelled for queue ${num}.`);};
    }

    window.onMonCall = el => request(el.dataset.queue, el.dataset.info);
    byId('manualDone').addEventListener('click', event => {
        event.stopPropagation();
        event.preventDefault();
        if (!onPressDelay()) return;
        if (getComputedStyle(document.querySelector('.trDone')).cursor !== 'pointer') return;
        if (!active || finishing || byId('manualDone').disabled) return;
        finishing = true;
        log(`Done requested for queue ${active}.`);
        if (mode === 'timeout') {log('Simulated server is not responding. Waiting for the timeout safeguard…'); return;}
        setTimeout(() => {
            const finished = active;
            document.querySelector(`[data-demo-row="${finished}"]`)?.remove();
            active = null;
            finishing = false;
            document.querySelector('span.divCall').textContent = 'CALL';
            current(document.querySelector('.monqueueinfo [data-queue]')?.dataset.queue || '-END-', false);
            log(`Queue ${finished} completed and removed from the waiting list.`);
        }, mode === 'slow' ? 8000 : 1200);
    });
    byId('manualCall').onclick = () => {
        const next = document.querySelector('.monqueueinfo [data-queue]');
        if (next) request(next.dataset.queue, 'CALL');
    };

    const waits = mode === 'below' ? [899, 600, 280, 10] : [1200, 900, 899, 280];
    waits.forEach((seconds, index) => {
        const num = String(3001 + index);
        const row = document.createElement('tr');
        row.dataset.demoRow = num;
        row.innerHTML = `<td><table class="monqueueinfo"><tbody><tr><td data-queue="${num}" data-tranid="${100 + index}">${num}</td><td><button class="row-action divSmallSilentCallIcon" data-info="Silent Call" data-queue="${num}" data-tranid="${100 + index}" onmousedown="onMonCall(this)">Silent</button><button class="row-action normal" data-info="CALL" data-queue="${num}" data-tranid="${100 + index}" onmousedown="onMonCall(this)">Call</button></td></tr></tbody></table></td><td>Demo service</td><td>9:53:11 AM</td><td class="wait-cell">${format(seconds)}</td>`;
        byId('queueRows').append(row);
    });
    current('3001', false);
    byId('scenario').value = mode;
    byId('scenarioHint').textContent = descriptions[mode];
    function reset(scenario) {
        if (document.documentElement.dataset.extensionTest === 'true') {
            window.dispatchEvent(new CustomEvent('queuebee-test-reset', {detail:scenario}));
        } else {
            location.hash = scenario;
            location.reload();
        }
    }
    byId('scenario').onchange = event => reset(event.target.value);
    byId('reset').onclick = () => reset(mode);
    setInterval(() => {
        if (active) document.querySelector('span.divCall').textContent = format(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    log(document.documentElement.dataset.extensionTest === 'true'
        ? 'Test dashboard ready. Choose 15 minutes and START in the extension popup.'
        : 'Demo ready. Select 15 minutes and press START.');
})();
