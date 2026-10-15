const ding = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YV9vT18AZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAD///8BAP//AgD//wMA//8EAP//BQD//wYA//8HAP//CAD//wkA//8KAP//CwD//wwA//8NAP//DgD//w8A//8QAP//EQD//xIA//8TAP//FAD//xUA//8WAP//FwD//xgA//8ZAP//GgD//xsA//8cAP//HQD//x4A//8fAP//IAD//yEA//8iAP//IwD//yQA//8lAP//JgD//ycA//8oAP//KQD//yoA//8rAP//LAD//y0A//8uAP//LwD//zAA//8xAP//MgD//zMA//80AP//NQD//zYA//83AP//OAD//zkA//86AP//OwD//zwA//89AP//PgD//z8A");

setInterval(() => {
    chrome.storage.local.get(['waitLimit', 'isRunning'], (result) => {
        if (result.isRunning) processQueue(parseInt(result.waitLimit) || 25);
    });
}, 10000);

function processQueue(threshold) {
    const rows = document.querySelectorAll("tr");

    rows.forEach(row => {
        const rowText = row.innerText || "";
        const timeMatch = rowText.match(/(\d{1,2}):(\d{2}):(\d{2})/) || rowText.match(/(\d{1,2}):(\d{2})/);
        
        if (timeMatch) {
            let mins = timeMatch.length === 4 ? (parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2])) : parseInt(timeMatch[1]);

            if (mins >= threshold) {
                // Find the Silent Call icon within this specific row
                const silentBtn = row.querySelector('[title*="Silent" i], [aria-label*="Silent" i], .fa-volume-mute, [class*="silent" i]');

                if (silentBtn) {
                    const queueNum = row.cells[0]?.innerText.trim() || "???";
                    console.log("Step 1: Clicking Silent Call for " + queueNum);
                    silentBtn.click();
                    
                    // Use a shorter polling interval to find the button as soon as it appears
                    let attempts = 0;
                    const findInterval = setInterval(() => {
                        const doneBtn = findDoneButton(row);
                        
                        if (doneBtn) {
                            console.log("Step 2: Found Done button for " + queueNum);
                            doneBtn.click();
                            ding.play().catch(() => {});
                            updateStorage(queueNum);
                            clearInterval(findInterval);
                        }
                        
                        attempts++;
                        if (attempts > 10) { // Stop looking after 10 seconds (20 * 500ms)
                            console.log("Step 2 FAILED: Timeout looking for Done button for " + queueNum);
                            clearInterval(findInterval);
                        }
                    }, 5000); // Check every 5 seconds (matched to your original delay)
                }
            }
        }
    });
}

function findDoneButton(row) {
    // Strategy: Look specifically within the row first, then the whole document 
    // but filter for visibility.
    const selectors = [
        "button", "a", "i", "span", "div", "[role='button']"
    ];
    
    // We search the whole document because 'Done' often appears in a modal/popup 
    // outside the <tr> structure.
    const elements = document.querySelectorAll(selectors.join(","));
    
    return Array.from(elements).find(el => {
        const txt = el.innerText.trim().toLowerCase();
        const title = (el.title || "").toLowerCase();
        const cls = (el.className || "").toLowerCase();
        
        // Ensure the element is actually visible and clickable
        const isVisible = el.offsetWidth > 0 && el.offsetHeight > 0;

        const matchesKeyword = 
            txt === "done" || 
            txt === "complete" || 
            txt === "finish" ||
            title.includes("done") ||
            (cls.includes("btn-success") && (txt.includes("ok") || txt.includes("confirm")));

        return isVisible && matchesKeyword;
    });
}
function updateStorage(queueNum) {
    chrome.storage.local.get(['clearedCount', 'activityLogs'], (data) => {
        const newLogs = data.activityLogs || [];
        const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (newLogs.length === 0 || newLogs[newLogs.length-1].num !== queueNum) {
            newLogs.push({ num: queueNum, time: now });
            chrome.storage.local.set({ 
                clearedCount: (data.clearedCount || 0) + 1,
                activityLogs: newLogs.slice(-50)
            });
        }
    });
}