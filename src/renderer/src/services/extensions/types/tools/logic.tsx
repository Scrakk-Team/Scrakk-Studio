/**
 * Tipo 'tools' — lógica.
 *
 * Construye la `Tool` real (misma forma que las built-in: definition, meta con
 * visual, permissions y execute) y la registra en el registry global. El
 * `execute` despacha a un COMANDO de la extensión, que corre en el Extension
 * Host: así el código de la tool vive en el paquete y el chat solo ve el
 * contrato.
 */

import { registry, type ExecutionResult, type Tool } from '@services/ai/tools'
import { toolCatalog, EXTENSIONS_FAMILY, EXTENSION_TOOL_TYPE } from '@services/ai/tools/catalog'
import type { ComponentType, JSX } from 'react'
import type { ExtensionTypeContext } from '../handler'
import { ExtensionToolVisual, type ToolVisualProps } from './ExtensionToolVisual'
import type { ToolContribution } from './schema'

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
      try {
        const response = await window.api.extensions.host.executeCommand({
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
