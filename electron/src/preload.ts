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
});
