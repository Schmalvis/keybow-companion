import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('keybow', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: any) => ipcRenderer.invoke('save-config', config),
  onProfileChanged: (callback: (name: string) => void) => {
    ipcRenderer.on('profile-changed', (_event, name) => callback(name));
  },
  onDeviceStatus: (callback: (connected: boolean) => void) => {
    ipcRenderer.on('device-status', (_event, connected) => callback(connected));
  },
  onKeyEvent: (callback: (key: string, event: string) => void) => {
    ipcRenderer.on('key-event', (_event, key, eventType) => callback(key, eventType));
  },
  getInstalledApps: () => ipcRenderer.invoke('get-installed-apps'),
  browseForApp: () => ipcRenderer.invoke('browse-for-app'),
  getTemplates: () => ipcRenderer.invoke('get-templates'),
  getSuggestions: () => ipcRenderer.invoke('get-suggestions'),
  previewLed: (key: string, color: string) => ipcRenderer.send('preview-led', key, color),
});
