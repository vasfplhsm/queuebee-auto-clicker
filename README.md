# 🏥 Hospital Queue Optimizer (QueueBee Edition)

Internal Chrome extension to automate patient waiting list management and maintain KPI targets.

## 🚀 Key Features
* **Auto-Clear:** Triggers "Silent Call" and "Done" when wait time exceeds the threshold.
* **Intervals:** Choose between 5 to 40 minutes (in 5-minute steps).
* **Daily Counter:** Tracks total patients cleared during the shift.
* **Activity Log:** Records Queue Numbers and timestamps (last 50 entries).
* **Auto-Reset:** Clears counter and logs automatically at Midnight.
* **Audio Alert:** Plays a "Ding" sound when a queue is cleared.

## 🛠 Installation
1.  Open **Google Chrome** and go to `chrome://extensions/`.
2.  Turn on **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select this `queue-pro-v8` folder.

## 📖 Instructions
1.  Open the Dashboard: `http://10.138.119.134:8072/id=5`.
2.  **CRITICAL:** Click once anywhere on the page (required by Chrome to enable sounds).
3.  Open the extension icon, set your threshold, and click **START**.
4.  Keep the dashboard tab open.

---
*Lock Restricted to Hospital IP: 10.138.119.134*
