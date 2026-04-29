const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    
    // [NEW] 실시간 구독 인터페이스
    subscribe: (path) => ipcRenderer.send('subscribe-firebase-data', path),
    unsubscribe: (path) => ipcRenderer.send('unsubscribe-firebase-data', path),
    onDataUpdate: (callback) => {
        const listener = (event, payload) => callback(payload);
        ipcRenderer.on('firebase-data-update', listener);
        return () => ipcRenderer.removeListener('firebase-data-update', listener);
    },

    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    openExternalUrl: (url, browser) => ipcRenderer.invoke('open-external-url', url, browser),
    
    // Generic listeners
    on: (channel, callback) => {
        const listener = (event, ...args) => callback(...args);
        ipcRenderer.on(channel, listener);
        return listener; // Return the specific wrapper function
    },
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
});
