// Used only by the standalone HTML simulation, never by the extension test build.
(() => {
    const listeners = [];
    const state = {isRunning:false, waitLimit:'15', clearedCount:0, activityLogs:[], automationMessage:''};
    window.chrome = {runtime:{}, storage:{
        onChanged:{addListener(fn) {listeners.push(fn);}},
        local:{
            get(keys, callback) {callback(Object.fromEntries(keys.filter(key => key in state).map(key => [key, structuredClone(state[key])])));},
            set(values, callback) {
                const changes = {};
                for (const [key, value] of Object.entries(values)) {
                    if (JSON.stringify(state[key]) !== JSON.stringify(value)) changes[key] = {oldValue:state[key], newValue:value};
                    state[key] = structuredClone(value);
                }
                if (Object.keys(changes).length) listeners.forEach(fn => fn(changes, 'local'));
                callback?.();
            }
        }
    }};
})();
