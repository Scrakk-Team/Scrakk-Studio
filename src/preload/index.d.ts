// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

import type { WindowApi } from '@shared/window-controls'

declare global {
  interface Window {
    api: WindowApi
  }
}

export {}
