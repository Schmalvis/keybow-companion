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
  onProfileChanged: (cb: (name: string) => void) => {
    listen<string>("profile-changed", (e) => cb(e.payload));
  },
  onDeviceStatus: (cb: (connected: boolean) => void) => {
    listen<boolean>("device-status", (e) => cb(e.payload));
  },
  onKeyEvent: (cb: (key: string, event: string) => void) => {
    listen<{ key: string; event: string }>("key-event", (e) => cb(e.payload.key, e.payload.event));
  },
};
