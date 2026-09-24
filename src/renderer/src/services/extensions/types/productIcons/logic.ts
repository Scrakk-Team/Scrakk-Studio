// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'productIcons' — lógica (delega 100% en services/productIcons).
 * El tipo SEF es solo el INTERCEPTOR, igual que fileIcons.
 */

import {
  registerProductIconTheme,
  unregisterProductIconTheme,
  reactivateStoredProductIconTheme
} from '@services/productIcons'
import type { ProductIconTheme } from '@services/productIcons'

export interface RegisteredProductIconRef {
  id: string
}

export function registerProductIconThemeEntry(args: {
  id: string
  name: string
  extensionId: string
  isBuiltin: boolean
  theme: ProductIconTheme
}): void {
  registerProductIconTheme({
    id: args.id,
    name: args.name,
    extensionId: args.extensionId,
    isBuiltin: args.isBuiltin,
    theme: args.theme
  })
  reactivateStoredProductIconTheme(args.id)
}

export function unregisterProductIconThemeEntry(id: string): void {
  unregisterProductIconTheme(id)
}
