import { useEffect, useState, type JSX } from 'react'
import { skillRegistry } from '@services/skills'
import { toggleSkillsView } from '../SkillsPanel/viewState'
import styles from './ChatPanel.module.css'

/**
 * Botón "skills: N" debajo del input. Muestra cuántas skills hay cargadas y
 * abre/cierra la vista de skills dentro del propio panel de chat.
 */
export function SkillsButton(): JSX.Element {
  const [count, setCount] = useState(() => skillRegistry.list().length)

  useEffect(() => {
    skillRegistry.start()
    return skillRegistry.subscribe(() => setCount(skillRegistry.list().length))
  }, [])

  return (
    <button
      type="button"
      className={styles.skillsBtn}
      onClick={() => toggleSkillsView()}
      title="Ver y administrar skills"
    >
      skills: {count}
    </button>
  )
}
