const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright-core');
let browser;
before(async () => {browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium'});});
after(async () => {await browser?.close();});
async function popup(t, options = {}) {
    const p = await browser.newPage();
    const errors = [];
    p.on('pageerror', error => errors.push(error.message));
    t.after(async () => {await p.close(); assert.deepEqual(errors,[]);});
    const html = fs.readFileSync(path.resolve(__dirname,'../popup.html'),'utf8').replace(/<script src="popup.js"><\/script>/,'');
    await p.setContent(html);
    await p.evaluate(options => {
        window.state = {isRunning:false,waitLimit:'15',...options.storage};
        window.pageBuild = options.pageBuild === undefined ? 'DONE-3' : options.pageBuild;
        window.tabAvailable = options.tabAvailable !== false;
        window.tabId = options.tabId ?? 1;
        window.chrome = {runtime:options.simulation ? {} : {id:'popup-harness'}, storage:{local:{
            get(keys,callback){callback(Object.fromEntries(keys.filter(k=>k in state).map(k=>[k,state[k]])));},
            set(values,callback){Object.assign(state,values);callback?.();}
        }},tabs:{
            query(query,callback){callback(tabAvailable ? [{id:tabId}] : []);},
            sendMessage(id,message,callback){
                if(pageBuild===null){
                    chrome.runtime.lastError={message:'Could not establish connection. Receiving end does not exist.'};
                    callback();
                    delete chrome.runtime.lastError;
                } else callback({build:pageBuild});
            }
        }};
    },options);
    await p.addScriptTag({path:path.resolve(__dirname,'../popup.js')});
    return p;
}
test('native popup enables START only after the active dashboard confirms DONE-3', async t => {
    const p = await popup(t,{tabId:0});
    assert.match(await p.locator('#buildStatus').innerText(),/Dashboard connected \(DONE-3\)/);
    assert.equal(await p.locator('#startBtn').isDisabled(),false);
    await p.locator('#startBtn').click();
    assert.equal(await p.evaluate(()=>state.isRunning),true);
    assert.equal(await p.evaluate(()=>state.waitLimit),'15');
});
test('native popup blocks START when the tab still has the old script with no build responder', async t => {
    const p = await popup(t,{pageBuild:null});
    assert.equal(await p.locator('#startBtn').isDisabled(),true);
    assert.match(await p.locator('#buildStatus').innerText(),/refresh/);
    await p.evaluate(()=>document.querySelector('#startBtn').dispatchEvent(new MouseEvent('click')));
    assert.equal(await p.evaluate(()=>state.isRunning),false);
});
test('native popup identifies an older content-script build', async t => {
    const p = await popup(t,{pageBuild:'OLD-BUILD'});
    assert.match(await p.locator('#buildStatus').innerText(),/Page OLD-BUILD/);
    assert.equal(await p.locator('#startBtn').isDisabled(),true);
});
test('native popup rechecks a previously matching dashboard on START', async t => {
    const p = await popup(t);
    await p.evaluate(()=>{pageBuild=null;});
    await p.locator('#startBtn').click();
    assert.equal(await p.evaluate(()=>state.isRunning),false);
    assert.equal(await p.locator('#startBtn').isDisabled(),true);
});
test('STOP remains available when no dashboard is connected', async t => {
    const p = await popup(t,{tabAvailable:false,storage:{isRunning:true}});
    assert.equal(await p.locator('#startBtn').isDisabled(),true);
    await p.locator('#stopBtn').click();
    assert.equal(await p.evaluate(()=>state.isRunning),false);
});
test('standalone simulation continues to use its local controls without a native extension ID', async t => {
    const p = await popup(t,{simulation:true,pageBuild:null});
    assert.equal(await p.locator('#startBtn').isDisabled(),false);
    await p.locator('#startBtn').click();
    assert.equal(await p.evaluate(()=>state.isRunning),true);
});
