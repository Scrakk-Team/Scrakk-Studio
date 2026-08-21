import type { WindowApi } from '@shared/window-controls'

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
