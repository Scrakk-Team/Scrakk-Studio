---
title: "tools (herramientas de IA)"
group: extensions
order: 120
summary: "Una extensión puede aportar herramientas de IA al chat. Van al mismo registry que las tools internas y se configuran en Ajustes → Chat → Herramientas."
---
# tools (herramientas de IA)

Una extensión puede aportar **herramientas de IA** al chat. Se registran en el
mismo registry que las tools internas (`services/ai/tools`): aparecen en Ajustes
→ Chat → Herramientas, se activan/desactivan igual, y usan la misma card con
`visual/` si el paquete lo trae.

## Manifest

```json
{
  "contributes": {
    "tools": [
      {
        "name": "acme_deploy",
        "label": "Deploy",
        "description": "Despliega el proyecto actual.",
        "parameters": {
          "type": "object",
          "properties": {
            "environment": { "type": "string", "description": "prod | staging" }
          },
          "required": ["environment"]
        },
        "command": "acme.deploy",
        "family": "acme",
        "familyLabel": "Acme Tools",
        "type": "acme-deploy",
        "typeLabel": "Deploy",
        "dangerLevel": "medium",
        "enabledByDefault": false,
        "icon": "server",
        "visual": "tools/deploy/visual.tsx",
        "visualCss": "tools/deploy/visual.css"
      }
    ]
  }
}
```

| Campo | Requerido | Qué es |
| --- | --- | --- |
| `name` | Sí | Nombre de la función que ve el modelo. Único; no puede pisar una tool interna. |
| `description` | Sí | Qué hace, para el prompt del modelo. |
| `command` | Sí | Comando que la extensión registra y que ejecuta la tool. |
| `parameters` | No | JSON Schema de los argumentos (OpenAI function-calling). |
| `label` | No | Etiqueta visible en el chat y en Ajustes. |
| `type` | No | Id del grupo (ToolType) donde aparece. Si no existe, se crea solo. Default: `extension`. |
| `typeLabel` | No | Etiqueta visible del tipo (cuando la extensión lo crea). |
| `family` | No | Id del pack/familia de tools. Si no existe, se crea (así un `.sef` aporta su propio grupo). Default: `extensions`. |
| `familyLabel` | No | Etiqueta visible de la familia. |
| `familyIcon` | No | Id de productIcon de la familia. |
| `dangerLevel` | No | `safe` · `low` · `medium` · `high`. Default: `medium`. |
| `enabledByDefault` | No | Default: `true`. |
| `icon` | No | Id de productIcon. |
| `headerArgKey` | No | Argumento que se muestra en el header de la card. |
| `visual` | No | Módulo React del paquete con el visual (default export). |
| `visualCss` | No | CSS del visual, inyectado tal cual. |
| `permissions` | No | Reglas del motor de políticas (`path_block`, `size_limit`, …). |

## Cómo ejecuta

El `execute` de la tool despacha a un **comando** del Extension Host:

```ts
// En el código de la extensión.
vscode.commands.registerCommand('acme.deploy', async (args) => {
  return `deploy a ${args.environment} listo`
})
```

El resultado se devuelve al modelo como texto (si es un objeto, se serializa a
JSON). La tool queda en el registry con `extensionId`, así que al desinstalar el
`.sef` se desregistra sola.

## Visual

Si `visual` apunta a un módulo del paquete, la card lo carga al montar (sin
`React.lazy` ni Suspense) y lo renderiza con la misma firma que las tools
internas:

```tsx
export default function DeployVisual({ args, result, status }) {
  return <span>Deploy a {String(args.environment)}</span>
}
```

Sin `visual`, el chat muestra una línea simple con el label y el primer
argumento.
