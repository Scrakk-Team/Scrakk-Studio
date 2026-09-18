/**
 * FileIcons — componente <img> + wrapper a ComponentType.
 * Separado en .tsx porque index.ts no admite JSX.
 */

import type { ComponentType, JSX } from 'react'

export function FileIconImage({ src, size }: { src: string; size: number }): JSX.Element {
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
    />
  )
}

/**
 * Envuelve un data URI en un ComponentType<{size}> para superficies que solo
 * entienden componentes (TabStrip `iconFor`, ActivityBarButton.icon…).
 */
export function fileIconImageComponent(url: string): ComponentType<{ size?: number }> {
  const Comp = ({ size }: { size?: number }): JSX.Element => (
    <FileIconImage src={url} size={size ?? 16} />
  )
  Comp.displayName = 'FileIconImage'
  return Comp
}
