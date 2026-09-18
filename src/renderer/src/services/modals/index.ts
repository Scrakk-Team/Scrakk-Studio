/**
 * Servicio de modales — API pública.
 */

export {
  showModal,
  showOptionModal,
  showAnchoredModal,
  anchoredModalId,
  closeModal,
  closeAllModals,
  closeAllModals as closeAll,
  listActiveModals,
  isModalOpen,
  subscribeToModals,
  snapshotModals,
  resolveOptionModal,
  anchoredX
} from './registry'
export type {
  ModalSpecBase,
  CustomModalSpec,
  OptionsModalSpec,
  AnchoredModalSpec,
  AnchoredRect,
  AnchoredAlign,
  OptionItem,
  ModalHandle,
  ModalRenderContext,
  ModalSize
} from './registry'

import { showOptionModal, type OptionItem } from './registry'

/** Atajo: picker de opciones → Promise<id|null>. */
export function pickOption(title: string, items: Array<OptionItem>, emptyMessage?: string): Promise<string | null> {
  return showOptionModal({ title, items, emptyMessage })
}
