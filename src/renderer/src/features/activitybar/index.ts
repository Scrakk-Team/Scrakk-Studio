/**
 * Feature Activity Bar — barras laterales de botones (izquierda y derecha)
 * con registro automático. Cada botón activa/desactiva un panel en un slot.
 */

export { ActivityBar } from './ActivityBar'
export { activityBarButtons, getButtonsForSide } from './registry'
export {
  allActivityButtons,
  getOrderedButtons,
  getToolDockedButtons,
  buttonPosition,
  moveButton,
  resetButtonLayout,
  snapshotButtonLayout,
  restoreButtonLayout,
  subscribeToButtonLayout
} from './layout'
export type { ActivityBarButton, ActivityBarSide } from './types'
export type { ButtonSide } from './layout'
