/**
 * Tipo 'fileIcons' — store: re-exporta la persistencia del servicio global.
 * La verdad vive en services/fileIcons/store.ts (localStorage
 * 'scrakk:active-file-icon-theme'); acá solo se re-exporta para la
 * convención types/<kind>/store.ts.
 */

export {
  loadStoredActiveTheme,
  saveStoredActiveTheme,
  clearStoredActiveTheme
} from '@services/fileIcons/store'
