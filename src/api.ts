import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const keybow = {
  getConfig: () => invoke("get_config"),
  saveConfig: (config: any) => invoke("save_config", { config }),
  getInstalledApps: () => invoke("get_installed_apps"),
  browseForApp: () => invoke("browse_for_app"),
  getTemplates: () => invoke("get_templates"),
  getSuggestions: () => invoke("get_suggestions"),
  previewLed: (key: string, color: string) => invoke("preview_led", { key, color }),
  getDeviceStatus: () => invoke<boolean>("get_device_status"),
  onProfileChanged: (cb: (name: string) => void) => {
    listen<string>("profile-changed", (e) => cb(e.payload));
  },
  onDeviceStatus: (cb: (connected: boolean) => void) => {
    listen<boolean>("device-status", (e) => cb(e.payload));
  },
  onKeyEvent: (cb: (key: string, event: string) => void) => {
    listen<any>("key-event", (e) => {
      console.log("[api] key-event payload:", JSON.stringify(e.payload));
      const p = e.payload;
      if (p && p.key && p.event) {
        cb(p.key, p.event);
      }
    });
  },
  getExtensionStatus: () => invoke<boolean>("get_extension_status"),
  onExtensionStatus: (cb: (connected: boolean) => void) => {
    listen<boolean>("extension-status", (e) => cb(e.payload));
  },
};
