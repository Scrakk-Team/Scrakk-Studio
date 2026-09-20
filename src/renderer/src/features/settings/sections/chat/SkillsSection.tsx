/**
 * Sección "Skills" — lista las skills instaladas y permite activarlas o
 * desactivarlas. Una skill desactivada no se ofrece al modelo.
 */

import { useEffect, useState, type JSX } from 'react'
import { ToggleSwitch } from '@ui'
import { skillRegistry, type SkillInfo } from '@services/skills'
import styles from './ChatSections.module.css'

const SOURCE_LABEL: Record<SkillInfo['source'], string> = {
  project: 'proyecto',
  user: 'usuario',
  extension: 'extensión'
}

export function SkillsSection(): JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>(() => skillRegistry.list())

  useEffect(() => {
    skillRegistry.start()
    return skillRegistry.subscribe(() => setSkills(skillRegistry.list()))
  }, [])

  return (
    <div className={styles.section}>
      <p className={styles.hint}>Activa o desactiva las skills instaladas.</p>

      {skills.length === 0 ? (
        <p className={styles.empty}>
          No hay skills todavía. Crea <code className={styles.code}>.scrakk/skills/mi-skill/SKILL.md</code>{' '}
          con un frontmatter <code className={styles.code}>name</code> y{' '}
          <code className={styles.code}>description</code>.
        </p>
      ) : (
        <div className={styles.list}>
          {skills.map((skill) => (
            <div key={`${skill.source}:${skill.name}`} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>
                  {skill.name}
                  <span className={styles.badge}>{SOURCE_LABEL[skill.source]}</span>
                </span>
                <span className={styles.rowDesc}>{skill.description || skill.path}</span>
              </div>
              <ToggleSwitch
                checked={skillRegistry.isEnabled(skill.name)}
                onChange={(next) => skillRegistry.setEnabled(skill.name, next)}
                label={`Habilitar skill ${skill.name}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
