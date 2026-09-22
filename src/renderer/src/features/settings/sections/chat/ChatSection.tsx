/**
 * Sección Chat — padre de las preferencias del chat con IA.
 *
 * Agrupa Proveedores (API keys y modelo), Herramientas (qué tools ve el
 * modelo) y Skills (workflows en .scrakk/skills). Cada hijo tiene su pantalla;
 * acá solo vive la introducción y los accesos directos.
 */

import type { JSX } from 'react'
import type { SettingsSectionId } from '../index'
import styles from './ChatSections.module.css'

/** Abre Ajustes en una sección (evento global, sin acoplarse al feature). */
function goTo(section: SettingsSectionId): void {
  window.dispatchEvent(new CustomEvent('open-settings', { detail: { section } }))
}

export function ChatSection(): JSX.Element {
  return (
    <div className={styles.section}>
      <p className={styles.hint}>Preferencias del chat con IA.</p>

      <div className={styles.intro}>
        <span className={styles.introTitle}>Proveedores</span>
        <span className={styles.hint}>Modelos y claves de API.</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatProviders')}
          >
            Abrir proveedores
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>Herramientas</span>
        <span className={styles.hint}>Qué puede usar la IA.</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatTools')}
          >
            Abrir herramientas
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>Skills</span>
        <span className={styles.hint}>Flujos de trabajo reutilizables.</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatSkills')}
          >
            Abrir skills
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>Agentes</span>
        <span className={styles.hint}>Perfiles, permisos y subagentes.</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatAgents')}
          >
            Abrir agentes
          </button>
        </div>
      </div>

      <div className={styles.intro}>
        <span className={styles.introTitle}>Permisos</span>
        <span className={styles.hint}>Qué se permite, se pregunta o se niega.</span>
        <div className={styles.linkRow}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => goTo('chatPermissions')}
          >
            Abrir permisos
          </button>
        </div>
      </div>
    </div>
  )
}
