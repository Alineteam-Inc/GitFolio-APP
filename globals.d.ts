// What the web view has from Tauri (withGlobalTauri in tauri.conf.json) and from lib.rs.
interface Window {
  __TAURI__: {
    core: { invoke(cmd: string, args?: Record<string, unknown>): Promise<any> };
    event: { listen(event: string, handler: (e: { payload: any }) => void): Promise<() => void> };
    app: { getVersion(): Promise<string> };
  };
  initialSection?: string; // the section the GitFolio window opens on
}
