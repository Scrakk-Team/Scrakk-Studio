// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * Tipo 'tools' — lógica.
 *
 * Construye la `Tool` real (misma forma que las built-in: definition, meta con
 * visual, permissions y execute) y la registra en el registry global.
 *
 * El `execute` tiene DOS caminos, y cuál se usa lo decide la extensión:
 *
 *  - **Con `runtime`** (Extension Host): despacha a un COMANDO de la extensión
 *    que corre en el host — el modelo de VS Code: el código vive en el paquete
 *    y el chat solo ve el contrato.
 *  - **Declarativa** (sin host): lo atiende el handler que el bundle de UI
 *    registró con `window.scrakk.tools.register`. Sin este camino, un tool de
 *    una extensión sin código no tendría quién lo ejecute, y justo es el caso
 *    en el que la extensión SÍ puede tocar la UI que monta (un lienzo, p. ej.).
 */

import { registry, type ExecutionResult, type Tool } from '@services/ai/tools'
import { toolCatalog, EXTENSIONS_FAMILY, EXTENSION_TOOL_TYPE } from '@services/ai/tools/catalog'
import { getToolHandler } from '../../runtime/bridge'
import type { ComponentType, JSX } from 'react'
import type { ExtensionTypeContext } from '../handler'
import { ExtensionToolVisual, type ToolVisualProps } from './ExtensionToolVisual'
import type { ToolContribution } from './schema'
import { api } from '@services/api'

export interface RegisteredToolRef {
  extensionId: string
  name: string
}

function renderTextBody(
  label: string,
  args: Record<string, unknown>,
  result?: string,
  status?: string
): JSX.Element | null {
  if (status === 'pending' || status === 'streaming' || status === 'running') {
    return <span>{label}…</span>
  }
  const first = Object.values(args)[0]
  const suffix = typeof first === 'string' ? ` · ${first}` : ''
  return (
    <span title={result}>
      {label}
      {suffix}
    </span>
  )
}

export function buildExtensionTool(contribution: ToolContribution, ctx: ExtensionTypeContext): Tool {
  const { extensionId, resolver } = ctx
  const parameters = contribution.parameters ?? { type: 'object', properties: {} }
  const visual = contribution.visual

  // Pack/familia + tipo: la extensión puede declararlos; si no existen, se
  // crean solos en el catálogo (así un `.sef` aporta su propio grupo de tools).
  const familyId = contribution.family ?? EXTENSIONS_FAMILY
  if (contribution.family && !toolCatalog.getFamily(familyId)) {
    toolCatalog.registerFamily({
      id: familyId,
      label: contribution.familyLabel ?? contribution.family,
      icon: contribution.familyIcon,
      order: 100
    })
  }
  const typeId = contribution.type ?? EXTENSION_TOOL_TYPE
  toolCatalog.ensureType({
    id: typeId,
    label: contribution.typeLabel ?? contribution.type,
    family: familyId,
    order: 100
  })

  return {
    name: contribution.name,
    extensionId,
    definition: {
      type: 'function',
      function: {
        name: contribution.name,
        description: contribution.description,
        parameters
      }
    },
    permissions: contribution.permissions ?? [],
    meta: {
      name: contribution.name,
      label: contribution.label ?? contribution.name,
      description: contribution.description,
      type: typeId,
      dangerLevel: contribution.dangerLevel ?? 'medium',
      enabledByDefault: contribution.enabledByDefault !== false,
      icon: contribution.icon,
      headerArgKey: contribution.headerArgKey,
      expandable: true,
      displayCss: contribution.visualCss,
      renderBody: (args, result, status) =>
        visual ? (
          <ExtensionToolVisual
            path={visual}
            resolve={
              resolver.resolveComponent as (
                path: string
              ) => () => Promise<{ default: ComponentType<ToolVisualProps> }>
            }
            args={args}
            result={result}
            status={status}
          />
        ) : (
          renderTextBody(contribution.label ?? contribution.name, args, result, status)
        )
    },
    execute: async (args): Promise<ExecutionResult> => {
      // Extensión DECLARATIVA (sin Extension Host): el handler vive en el
      // bundle de UI, que lo registró con `window.scrakk.tools.register`. Es el
      // único camino cuando la extensión no tiene código de host — y el único
      // que puede tocar la UI que la misma extensión monta (un lienzo, p. ej.).
      const runtimeHandler = getToolHandler(extensionId, contribution.command)
      if (runtimeHandler) {
        try {
          const result = await runtimeHandler(args)
          return {
            success: true,
            content:
              typeof result === 'string' ? result : JSON.stringify(result ?? null, null, 2)
          }
        } catch (error) {
          return {
            success: false,
            content: `Error ejecutando "${contribution.name}": ${String(error)}`
          }
        }
      }
      if (!ctx.isBuiltin && ctx.hasRuntime === false) {
        // Sin host y sin handler: se dice QUÉ falta, en vez de un error del host.
        return {
          success: false,
          content: `Error: la extensión "${extensionId}" no atiende "${contribution.command}" (registralo con window.scrakk.tools.register en el bundle)`
        }
      }
      try {
        const response = await api.extensions.host.executeCommand({
          id: extensionId,
          command: contribution.command,
          args: [args]
        })
        if (response.success) {
          const content =
            typeof response.result === 'string'
              ? response.result
              : JSON.stringify(response.result ?? null, null, 2)
          return { success: true, content }
        }
        return { success: false, content: `Error: ${response.error}` }
      } catch (error) {
        return {
          success: false,
          content: `Error ejecutando "${contribution.name}": ${String(error)}`
        }
      }
    }
  }
}

/** Registra una contribución y devuelve su referencia para el desregistro. */
export function registerTool(contribution: ToolContribution, ctx: ExtensionTypeContext): RegisteredToolRef {
  // Si la MISMA extensión ya la tenía (recarga/actualización), se reemplaza.
  // allowOverwrite=false garantiza que una extensión NO pise una built-in.
  const existing = registry.get(contribution.name)
  if (existing && existing.extensionId === ctx.extensionId) {
    registry.unregister(contribution.name)
  }
  registry.register(buildExtensionTool(contribution, ctx), { allowOverwrite: false })
  return { extensionId: ctx.extensionId, name: contribution.name }
}
