// The only bridge between the app's windows and the rest of the computer.
// Windows get these few calls and nothing else (no Node, no file system).
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const handler = (_e, data) => fn(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld('evaratus', {
  // main window
  ready: () => ipcRenderer.invoke('app:ready'),
  pickRegions: () => ipcRenderer.invoke('app:pick'),
  showRegions: () => ipcRenderer.invoke('app:show-regions'),
  scan: () => ipcRenderer.invoke('app:scan'),
  newTask: () => ipcRenderer.invoke('app:new-task'),
  set: (patch) => ipcRenderer.invoke('app:set', patch),
  decided: (ids) => ipcRenderer.invoke('app:decided', ids),
  setDone: (done) => ipcRenderer.invoke('app:done', done),
  flash: (id) => ipcRenderer.invoke('app:flash', id),
  learnColour: (hex, label) => ipcRenderer.invoke('app:learn-colour', { hex, label }),
  forgetColours: () => ipcRenderer.invoke('app:forget-colours'),
  palette: () => ipcRenderer.invoke('app:palette'),
  openPermissions: () => ipcRenderer.invoke('app:open-permissions'),
  onState: on('state'),
  onResult: on('result'),
  onStatus: on('status'),
  // region picker
  pickRect: (rect) => ipcRenderer.invoke('selector:rect', rect),
  pickBack: () => ipcRenderer.invoke('selector:back'),
  pickCancel: () => ipcRenderer.invoke('selector:cancel'),
  onPickStep: on('selector:step'),
  // overlay
  onDraw: on('overlay:draw'),
  onShowFrames: on('overlay:show-frames'),
});
