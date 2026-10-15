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

Download the [hospital extension v1.0 ZIP](downloads/queuebee-extension-v1.0.zip),
extract it, and load its `queuebee-extension-v1.0` folder using the steps below.
This package runs on the hospital IP and contains no demo dashboard.

1.  Open **Google Chrome** and go to `chrome://extensions/`.
2.  Turn on **Developer mode** (top right).
3.  Click **Load unpacked**.
4.  Select this `queuebee-auto-clicker` folder.

### Updating to v1.0

Click **STOP** before updating. At `chrome://extensions/`, reload this extension,
then **refresh every open QueueBee dashboard tab** to remove the old timers.
Remove any older copies of the extension and refresh tabs that ran console
automation. Keep automation enabled in only one dashboard tab. Choose your wait
threshold and click **START** again.

The extension reads the **Wait Duration** column, including hours and seconds;
Issue Time does not affect eligibility. A 15-minute threshold includes 00:15:00
and leaves 00:14:59 alone. It targets the row's exact Silent Call control and
processes one transaction at a time. Existing manual calls are left alone.

If a Silent Call confirmation appears, only the dialog for the intended queue is
confirmed. Done requires the same selected queue number and an active call timer.
The counter updates only after the timer ends and the transaction leaves the
waiting list. Background tab throttling can delay work; a step delayed beyond
30 seconds stops automation instead of retrying clicks. Check the popup's status
message and the current patient before restarting. STOP prevents further actions;
it cannot undo a Silent Call already sent to the server.

### Test the installed extension offline

Download [the installable OFFLINE TEST extension](demo/queuebee-extension-test-v1.0.zip).
Extract it, then use Chrome's `chrome://extensions/` → **Developer mode** →
**Load unpacked** to select the `queuebee-extension-test` folder containing
`manifest.json`. In this extension's **Details**, enable **Allow access to file
URLs**. Open its included `queuebee-test.html` file in Chrome.

The page should show **Extension connected**. Pin **QueueBee v1.0 — OFFLINE
TEST**, open its popup, select **15 minutes**, and press **START**. Expect queues
3001 and 3002 to clear, 3003 and 3004 to remain, an extension counter of 2, and
Normal calls of 0. Threshold and START/STOP controls are in the real extension
popup. Reset demo stops automation and clears test extension storage. Use one
test dashboard tab at a time.

This build uses native content-script injection and Chrome extension storage.
Its `content.js` and `popup.js` are identical to the hospital build. Only the
patients and server responses are simulated. Its manifest matches the local
`queuebee-test.html` file and grants no hospital-site access. The production
manifest remains restricted to `10.138.119.134`. Build it again with
`npm run build:test-extension` (output: `dist/queuebee-extension-test`).

Managed Chrome must permit unpacked extensions and file URL access. Native
extension loading in this cloud browser is disabled by administrator policy;
the build and isolated content-script behavior were checked separately.

### Try the standalone HTML simulation

Download [the demo ZIP](demo/queuebee-demo.zip) using GitHub's **Download raw
file** button, extract it, and open `queuebee-demo.html` in Chrome. A prebuilt
[single HTML file](demo/queuebee-demo.html) is also included; download it before
opening it, because GitHub's file viewer displays the source.

Run `npm run build:demo`, then open `dist/queuebee-demo.html` directly in Chrome.
The generated file is self-contained and works offline without installing the
extension or starting a server. It runs the same `content.js` and `popup.js`
against simulated QueueBee controls and page-local storage.

Start with the mixed-waits scenario and a 15-minute threshold. Queues 3001 and
3002 should clear; 3003 (14:59) and 3004 (04:40) should remain. The normal-call
counter should stay at zero. Other scenarios demonstrate slow completion,
wrong-patient detection, and a response timeout. Reset or switch scenarios for a
fresh test. Waiting durations are fixed, so boundary tests stay repeatable.

### Development checks

The extension itself needs no build or packages. Browser regression tests use
Node.js and a local Chromium installation:

```sh
npm ci
npm test
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. Tests use synthetic
queues reconstructed from the supplied HTML/recordings and simulated Chrome
storage; they do not connect to the hospital. The actual hospital dashboard and
native extension loading still need verification in your Chrome installation.

## 📖 Instructions
1.  Open the Dashboard: `http://10.138.119.134:8072/id=5`.
2.  **CRITICAL:** Click once anywhere on the page (required by Chrome to enable sounds).
3.  Open the extension icon, set your threshold, and click **START**.
4.  Keep the dashboard tab open.

---
*Lock Restricted to Hospital IP: 10.138.119.134*
