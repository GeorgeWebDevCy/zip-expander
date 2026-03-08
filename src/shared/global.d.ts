import type { DesktopApi } from "./ipc";

declare global {
  interface Window {
    desktopApi?: DesktopApi;
  }
}

export {};

