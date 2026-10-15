function updateUI() {
  chrome.storage.local.get(['waitLimit', 'isRunning', 'clearedCount', 'activityLogs', 'automationMessage'], (res) => {
    // FIX: Set the dropdown value to what is in storage
    if (res.waitLimit) {
        document.getElementById('timeLimit').value = res.waitLimit;
    }
    
    document.getElementById('clearCount').innerText = res.clearedCount || 0;
    
    const statusDiv = document.getElementById('status');
    document.getElementById('automationMessage').textContent = res.automationMessage || '';
    if (res.isRunning) {
        statusDiv.innerText = "SYSTEM ACTIVE";
        statusDiv.className = "status-on";
    } else {
        statusDiv.innerText = "SYSTEM IDLE";
        statusDiv.className = "status-off";
    }

    const logList = document.getElementById('logList');
    if (res.activityLogs && res.activityLogs.length > 0) {
        logList.innerHTML = res.activityLogs.map(log => 
            `<div class="log-entry"><span class="log-num">#${log.num}</span><span class="log-time">${log.time}</span></div>`
        ).reverse().join('');
    }
  });
}

document.getElementById('startBtn').addEventListener('click', () => {
  const limit = document.getElementById('timeLimit').value;
  // Save the limit immediately when Start is clicked
  chrome.storage.local.set({ waitLimit: limit, isRunning: true, automationMessage: '' }, updateUI);
});

document.getElementById('stopBtn').addEventListener('click', () => {
  chrome.storage.local.set({ isRunning: false, automationMessage: 'Stopped by user.' }, updateUI);
});

// Update the limit even if they change the dropdown without clicking start
document.getElementById('timeLimit').addEventListener('change', (e) => {
    chrome.storage.local.set({ waitLimit: e.target.value });
});

updateUI();
setInterval(updateUI, 2000);
