const QUEUEBEE_BUILD = 'DONE-3';

function checkDashboard() {
  // The standalone HTML simulation has no native extension ID. An installed
  // extension must always verify the active tab's actual content script.
  if (!chrome.runtime.id) return Promise.resolve({ready:true, message:`Build ${QUEUEBEE_BUILD} · Standalone simulation`});
  return new Promise(resolve => {
    chrome.tabs.query({active:true, currentWindow:true}, tabs => {
      const tabId = tabs?.[0]?.id;
      if (chrome.runtime.lastError || !Number.isInteger(tabId) || tabId < 0) {
        resolve({ready:false, message:`Build ${QUEUEBEE_BUILD} · Open the QueueBee dashboard tab.`});
        return;
      }
      chrome.tabs.sendMessage(tabId, {type:'queuebee:build'}, response => {
        const error = chrome.runtime.lastError;
        if (error || !response?.build) {
          resolve({ready:false, message:`Build ${QUEUEBEE_BUILD} · Open or refresh the QueueBee dashboard tab to load this build.`});
        } else if (response.build !== QUEUEBEE_BUILD) {
          resolve({ready:false, message:`Extension ${QUEUEBEE_BUILD} · Page ${response.build}. Refresh the dashboard tab.`});
        } else {
          resolve({ready:true, message:`Build ${QUEUEBEE_BUILD} · Dashboard connected (${QUEUEBEE_BUILD})`});
        }
      });
    });
  });
}

function showDashboardCheck(result) {
  const status = document.getElementById('buildStatus');
  if (status) status.textContent = result.message;
  document.getElementById('startBtn').disabled = !result.ready;
}

function updateUI() {
  checkDashboard().then(showDashboardCheck);
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

document.getElementById('startBtn').addEventListener('click', async () => {
  // Recheck on every START, even if the popup previously showed a matching tab.
  const dashboard = await checkDashboard();
  showDashboardCheck(dashboard);
  if (!dashboard.ready) return;
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
