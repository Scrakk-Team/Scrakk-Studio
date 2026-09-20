/**
 * Guardia de cierre para archivos con cambios sin guardar.
 *
 * Si el buffer está limpio cierra directo. Si está dirty, bloquea el cierre
 * y ofrece las dos salidas por toast (mismo mecanismo de acciones que el
 * resto del IDE — sin modal nuevo): "Guardar y cerrar" / "Cerrar sin
 * guardar". Todas las rutas de cierre (tab, menú Archivo, comando) pasan
 * por aquí para que ninguna tire cambios silenciosamente.
 */

import { closeFile } from './editorBus'
import { getFileSession, hasFileSession } from './fileSession'
import { saveFileByPath } from './save'
import { notify } from '@services/notifications'

export function requestCloseFile(path: string): boolean {
  const session = hasFileSession(path) ? getFileSession(path) : null
  if (!session?.isDirty()) {
    closeFile(path)
    return true
  }

  const name = path.split(/[/\\]/).pop() ?? path
  notify({
    title: 'Cambios sin guardar',
    message: `${name} tiene cambios sin guardar.`,
    severity: 'warn',
    actions: [
      {
        label: 'Guardar y cerrar',
        run: () => {
          void saveFileByPath(path).then((result) => {
            if (result.ok) closeFile(path)
          })
        }
      },
      {
        label: 'Cerrar sin guardar',
        run: () => {
          closeFile(path)
        }
      }
    ]
  })
  return false
}
