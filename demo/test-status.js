// Test-build content script: these are real extension APIs in Chrome's isolated world.
(() => {
    const defaults = {isRunning:false, waitLimit:'15', clearedCount:0, activityLogs:[], automationMessage:''};
    function render() {
        chrome.storage.local.get(Object.keys(defaults), data => {
            document.getElementById('extensionStatus').textContent = 'Extension connected';
            document.getElementById('extensionCleared').textContent = data.clearedCount || 0;
            document.getElementById('extensionRunning').textContent = data.isRunning ? 'RUNNING' : 'IDLE';
            document.getElementById('extensionThreshold').textContent = `${data.waitLimit || 25} minutes`;
            document.getElementById('extensionMessage').textContent = data.automationMessage || 'Choose 15 minutes and START in the extension popup.';
        });
    }
    chrome.storage.onChanged.addListener((changes, area) => {if (area === 'local') render();});
    window.addEventListener('queuebee-test-reset', event => {
        const modes = ['baseline','below','slow','wrong','timeout'];
        const mode = modes.includes(event.detail) ? event.detail : 'baseline';
        chrome.storage.local.set(defaults, () => {
            location.hash = mode;
            location.reload();
        });
    });
    chrome.storage.local.get(Object.keys(defaults), data => {
        const missing = Object.fromEntries(Object.entries(defaults).filter(([key]) => data[key] === undefined));
        chrome.storage.local.set(missing, render);
    });
})();
