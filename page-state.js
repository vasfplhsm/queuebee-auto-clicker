(() => {
    // Runs in the page's MAIN world. Read QueueBee's lock without calling
    // onPressDelay(), which would itself acquire the lock. No actions run here.
    if (globalThis.queueBeeButtonLockReaderLoaded) return;
    globalThis.queueBeeButtonLockReaderLoaded = true;
    document.addEventListener('queuebee:read-button-lock', () => {
        let remaining = 0;
        try {
            const limit = Number(theButtonLockTime);
            const elapsed = Math.abs(Date.now() - Number(dtLastBtnLock));
            if (Number.isFinite(limit) && Number.isFinite(elapsed)) {
                // QueueBee rejects elapsed <= limit, including the boundary.
                remaining = Math.max(0, limit - elapsed + 1);
            }
        } catch (_) { /* QueueBee's own guard also permits unset globals. */ }
        document.documentElement.setAttribute('data-queuebee-button-lock', String(remaining));
    });
})();
