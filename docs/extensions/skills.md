---
title: "skills (paquetes de skills)"
group: extensions
order: 100
summary: "Una extensión puede empaquetar skills: workflows reutilizables (formato Agent Skills, una carpeta con SKILL.md). El modelo las descubre por nombre + descripción y carga el cuerpo solo cuando las usa."
---
# skills (paquetes de skills)

Una extensión puede empaquetar **skills**: workflows reutilizables en el
formato abierto Agent Skills (una carpeta con `SKILL.md`). Junto con las skills
de `.scrakk/skills/` (proyecto y usuario), las de extensiones viven en el mismo
registry y se ofrecen al modelo con el mismo mecanismo de divulgación
progresiva: el modelo ve nombre + descripción, y carga el cuerpo solo cuando la
necesita.

## Manifest

```json
{
  "contributes": {
    "skills": [
      {
        "name": "release-notes",
        "description": "Genera notas de release desde los PRs mergeados.",
        "path": "skills/release-notes/SKILL.md"
      }
    ]
  }
}
```

| Campo | Requerido | Qué es |
| --- | --- | --- |
| `name` | Sí | Nombre de la skill (único). |
| `description` | Sí | Cuándo usarla. Es lo que el modelo ve al descubrir. |
| `path` | Sí | Ruta del `SKILL.md` dentro del paquete. |

Un “pack” es simplemente una extensión con varias entradas en
`contributes.skills`.

## Formato del SKILL.md

```markdown
---
name: release-notes
description: Genera notas de release desde los PRs mergeados.
---

# Release notes

1. Lista los PRs mergeados desde el último tag.
2. Agrupa por tipo (feat, fix, chore…).
3. Propone el bump de versión.
```

El cuerpo se lee del paquete **on demand** (no viaja en el prompt hasta que la
skill se carga). Las skills de extensión se desregistran al desinstalar el
`.sef`.

## Herramientas default

El chat trae dos tools para el sistema de skills:

- **`list_skills`** — lista las skills disponibles con su descripción.
- **`skill`** — carga el cuerpo de una skill por nombre.

## Insertar una skill en el chat

Cualquier panel o extensión puede ofrecer una librería de skills y, al hacer
click, insertarlas en el chat activo con la API pública del chat:

```ts
import { insertSkillIntoChat } from '@services/chat'

await insertSkillIntoChat('release-notes')
```

El contenido entra como mensaje del usuario, envuelto en
`<skill name="…">…</skill>`, y el modelo lo recibe en el turno siguiente.

La vista de skills del propio chat (botón **skills: N** debajo del input)
usa estas mismas funciones: lista, crea, borra e inserta skills, y guarda en
`.scrakk/skills` a través de la API global de `.scrakk`.
