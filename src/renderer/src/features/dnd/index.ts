// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

export { dndStore } from './store'
export type { DndState } from './store'
export { installDragHeaderDetection } from './store'
export { useDndState, useDraggable, useDropZone, useResourceDrop } from './hooks'
export { defaultDropResolver, installDefaultDropResolver } from './resolver'
export { RESOURCE_MIME, setResourceDragData, hasResourceDragData, readResourceDragData } from './resource'
export type { ResourceDragItem } from './resource'
export { DragGhost } from './DragGhost'
export { SplitOverlay } from './SplitOverlay'
export type { DragPayload, DropTarget, SplitEdge, TabDragPayload, ZoneDescriptor } from './types'
