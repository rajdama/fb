
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  receiveCoords: (callback) => {
    ipcRenderer.on('coords', (event, pos) => {
      callback(pos);
    });
  }
});
