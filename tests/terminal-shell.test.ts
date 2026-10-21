// Copyright 2026 Scrakk Studio
// SPDX-License-Identifier: Apache-2.0
// Licencia completa en LICENSE (Apache License 2.0).

/**
 * La shell que abre la terminal.
 *
 * En Windows la terminal arrancaba SIEMPRE `cmd.exe` (el `ComSpec`), aunque el
 * usuario tuviera PowerShell 7 o Windows Terminal como terminal por defecto.
 * Acá se comprueba que la resolución use la del usuario —Windows Terminal →
 * su perfil por defecto— y que el override de Ajustes gane sobre eso.
 *
 * El resolver es puro: el registro, el `settings.json` de Windows Terminal y el
 * PATH entran inyectados, así que el test no toca la máquina.
 */

import { describe, it, expect } from 'vitest'
import {
  AUTOMATIC_GUID,
  CONHOST_GUID,
  WINDOWS_TERMINAL_GUID,
  expandWindowsEnv,
  listShellCandidates,
  parseCommandLine,
  parseJsonc,
  resolveShell,
  shellFamilyFor,
  stripJsonComments,
  windowsTerminalSettingsPaths,
  type ShellProbe
} from '../src/main/terminal/shellResolver'

/** Un sistema falso: registro, archivos y ejecutables en el PATH. */
interface FakeSystem {
  platform?: ShellProbe['platform']
  env?: Record<string, string | undefined>
  /** `clave\valor` → valor de registro. */
  registry?: Record<string, string>
  /** ruta → contenido. */
  files?: Record<string, string>
  /** nombre en minúsculas → ruta absoluta. */
  executables?: Record<string, string>
}

function probeOf(system: FakeSystem): ShellProbe {
  const files = system.files ?? {}
  const executables = system.executables ?? {}
  return {
    platform: system.platform ?? 'win32',
    env: system.env ?? {},
    registry: (key, value) => (system.registry ?? {})[`${key}\\${value}`],
    readText: (file) => files[file],
    exists: (file) =>
      Object.prototype.hasOwnProperty.call(files, file) ||
      Object.values(executables).includes(file),
    which: (name) => executables[name.toLowerCase()]
  }
}

const LOCALAPPDATA = 'C:\\Users\\dev\\AppData\\Local'

/**
 * El `settings.json` de una Windows Terminal real: un perfil con `commandline`
 * explícito, uno dinámico (sin `commandline`, con `source`) y el default.
 */
const WINDOWS_TERMINAL_SETTINGS = JSON.stringify({
  defaultProfile: '{574e775e-4f2a-5b96-ac1e-a2962a402336}',
  profiles: {
    list: [
      {
        name: 'Windows PowerShell',
        guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
        commandline: '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
      },
      {
        name: 'Símbolo del sistema',
        guid: '{0caa0dad-35be-5f56-a8ff-afceeeaa6101}',
        commandline: '%SystemRoot%\\System32\\cmd.exe'
      },
      {
        name: 'PowerShell',
        guid: '{574e775e-4f2a-5b96-ac1e-a2962a402336}',
        source: 'Windows.Terminal.PowershellCore'
      }
    ]
  }
})

/** Un sistema con Windows Terminal instalado y como terminal por defecto. */
function systemWithWindowsTerminal(overrides: FakeSystem = {}): FakeSystem {
  const wtPath = windowsTerminalSettingsPaths({ LOCALAPPDATA })[0]
  return {
    env: { LOCALAPPDATA, SystemRoot: 'C:\\Windows' },
    registry: { 'HKCU\\Console\\%%Startup\\DelegationConsole': WINDOWS_TERMINAL_GUID },
    files: { [wtPath]: WINDOWS_TERMINAL_SETTINGS },
    executables: {
      'pwsh.exe': `${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`,
      'powershell.exe': 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'cmd.exe': 'C:\\Windows\\System32\\cmd.exe'
    },
    ...overrides
  }
}

describe('resolveShell — Windows Terminal', () => {
  it('usa el perfil por defecto de Windows Terminal', () => {
    const shell = resolveShell(probeOf(systemWithWindowsTerminal()))
    // El default es el perfil DINÁMICO "PowerShell" (PowerShell 7).
    expect(shell.path).toBe(`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`)
    expect(shell.family).toBe('powershell')
    expect(shell.source).toBe('windows-terminal')
  })

  it('también lo usa con la GUID de "selección automática"', () => {
    const system = systemWithWindowsTerminal()
    system.registry = { 'HKCU\\Console\\%%Startup\\DelegationConsole': AUTOMATIC_GUID }
    const shell = resolveShell(probeOf(system))
    expect(shell.path).toBe(`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`)
    expect(shell.source).toBe('windows-terminal')
  })

  it('con conhost como terminal por defecto NO usa Windows Terminal', () => {
    const system = systemWithWindowsTerminal()
    system.registry = { 'HKCU\\Console\\%%Startup\\DelegationConsole': CONHOST_GUID }
    const shell = resolveShell(probeOf(system))
    expect(shell.source).not.toBe('windows-terminal')
    expect(shell.path).toBe(`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`)
  })

  it('expande %SystemRoot% del commandline del perfil', () => {
    const system = systemWithWindowsTerminal()
    // El default pasa a ser el perfil con `commandline` explícito.
    system.files = {
      [windowsTerminalSettingsPaths({ LOCALAPPDATA })[0]]: JSON.stringify({
        defaultProfile: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
        profiles: {
          list: [
            {
              name: 'Windows PowerShell',
              guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
              commandline: '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
            }
          ]
        }
      })
    }
    const shell = resolveShell(probeOf(system))
    expect(shell.path).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')
    expect(shell.label).toBe('Windows PowerShell')
  })

  it('si el perfil no existe, cae al fallback', () => {
    const system = systemWithWindowsTerminal()
    system.files = {
      [windowsTerminalSettingsPaths({ LOCALAPPDATA })[0]]: JSON.stringify({
        defaultProfile: '{no-existe}',
        profiles: { list: [] }
      })
    }
    const shell = resolveShell(probeOf(system))
    expect(shell.source).toBe('fallback')
  })
})

describe('resolveShell — fallback de Windows', () => {
  it('prefiere PowerShell 7 y después Windows PowerShell', () => {
    const system = systemWithWindowsTerminal()
    system.registry = { 'HKCU\\Console\\%%Startup\\DelegationConsole': CONHOST_GUID }
    system.executables = { 'powershell.exe': 'C:\\Windows\\...\\powershell.exe' }
    expect(resolveShell(probeOf(system)).path).toBe('C:\\Windows\\...\\powershell.exe')
  })

  it('termina en cmd.exe si no hay ninguna shell', () => {
    const system = systemWithWindowsTerminal()
    system.registry = {}
    system.files = {}
    system.executables = { 'cmd.exe': 'C:\\Windows\\System32\\cmd.exe' }
    const shell = resolveShell(probeOf(system))
    expect(shell.path).toBe('C:\\Windows\\System32\\cmd.exe')
    expect(shell.family).toBe('cmd')
  })

  it('nunca devuelve ComSpec cuando hay pwsh', () => {
    const shell = resolveShell(probeOf(systemWithWindowsTerminal()))
    expect(shell.path).not.toBe('C:\\Windows\\System32\\cmd.exe')
  })
})

describe('resolveShell — elección del usuario', () => {
  it('gana sobre la detección automática', () => {
    const system = systemWithWindowsTerminal()
    system.executables = {
      ...system.executables,
      'nu.exe': 'C:\\Tools\\nu.exe'
    }
    const shell = resolveShell(probeOf(system), 'C:\\Tools\\nu.exe')
    expect(shell.path).toBe('C:\\Tools\\nu.exe')
    expect(shell.source).toBe('setting')
    expect(shell.family).toBe('other')
  })

  it('acepta un nombre suelto y lo busca en el PATH', () => {
    const shell = resolveShell(probeOf(systemWithWindowsTerminal()), 'pwsh.exe')
    expect(shell.path).toBe(`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`)
    expect(shell.source).toBe('setting')
  })

  it('acepta un comando con argumentos', () => {
    const shell = resolveShell(probeOf(systemWithWindowsTerminal()), 'pwsh.exe -NoLogo')
    expect(shell.path).toBe(`${LOCALAPPDATA}\\Microsoft\\WindowsApps\\pwsh.exe`)
    expect(shell.args).toEqual(['-NoLogo'])
  })

  it('si la ruta no existe, sigue con la detección automática', () => {
    const shell = resolveShell(probeOf(systemWithWindowsTerminal()), 'C:\\nada\\no-existe.exe')
    expect(shell.source).toBe('windows-terminal')
  })
})

describe('resolveShell — POSIX', () => {
  it('usa $SHELL', () => {
    const shell = resolveShell(
      probeOf({ platform: 'linux', env: { SHELL: '/bin/zsh' } })
    )
    expect(shell.path).toBe('/bin/zsh')
    expect(shell.family).toBe('posix')
    expect(shell.source).toBe('posix')
  })

  it('cae a /bin/bash', () => {
    expect(resolveShell(probeOf({ platform: 'linux', env: {} })).path).toBe('/bin/bash')
  })
})

describe('listShellCandidates', () => {
  it('sólo lista las shells que EXISTEN', () => {
    const system = systemWithWindowsTerminal()
    system.executables = { 'powershell.exe': 'C:\\Windows\\...\\powershell.exe' }
    const info = listShellCandidates(probeOf(system))
    const paths = info.candidates.map((entry) => entry.path)
    expect(paths).toContain('C:\\Windows\\...\\powershell.exe')
    // pwsh.exe estaba en el PATH del sistema falso: ahora no.
    expect(paths.some((entry) => entry.endsWith('pwsh.exe'))).toBe(false)
  })

  it('incluye los perfiles de Windows Terminal (Git Bash, WSL…)', () => {
    const wtPath = windowsTerminalSettingsPaths({ LOCALAPPDATA })[0]
    const system: FakeSystem = {
      env: { LOCALAPPDATA },
      registry: { 'HKCU\\Console\\%%Startup\\DelegationConsole': WINDOWS_TERMINAL_GUID },
      files: {
        [wtPath]: JSON.stringify({
          defaultProfile: '{574e775e-4f2a-5b96-ac1e-a2962a402336}',
          profiles: {
            list: [
              { name: 'Git Bash', guid: '{aa}', commandline: 'C:\\Program Files\\Git\\bin\\bash.exe' },
              { name: 'PowerShell', guid: '{574e775e}', source: 'Windows.Terminal.PowershellCore' }
            ]
          }
        })
      },
      executables: {
        'pwsh.exe': 'C:\\Users\\dev\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe',
        'bash.exe': 'C:\\Program Files\\Git\\bin\\bash.exe'
      }
    }
    const info = listShellCandidates(probeOf(system))
    const labels = info.candidates.map((entry) => entry.label)
    expect(labels).toContain('Git Bash')
    expect(info.candidates.find((entry) => entry.label === 'Git Bash')?.family).toBe('posix')
  })

  it('la detectada va primera', () => {
    const info = listShellCandidates(probeOf(systemWithWindowsTerminal()))
    expect(info.candidates[0].path).toBe(info.detected.path)
  })
})

describe('helpers', () => {
  it('shellFamilyFor', () => {
    expect(shellFamilyFor('C:\\Windows\\System32\\cmd.exe')).toBe('cmd')
    expect(shellFamilyFor('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell')
    expect(shellFamilyFor('/bin/bash')).toBe('posix')
    expect(shellFamilyFor('C:\\Tools\\nu.exe')).toBe('other')
    // El path se parte igual en Linux (los tests corren en las dos plataformas).
    expect(shellFamilyFor('C:\\Windows\\System32\\cmd.exe')).toBe('cmd')
  })

  it('parseCommandLine respeta comillas', () => {
    expect(parseCommandLine('"C:\\Program Files\\Git\\bin\\bash.exe" --login')).toEqual({
      path: 'C:\\Program Files\\Git\\bin\\bash.exe',
      args: ['--login']
    })
    expect(parseCommandLine('pwsh.exe')).toEqual({ path: 'pwsh.exe', args: [] })
  })

  it('expandWindowsEnv', () => {
    const env = { SystemRoot: 'C:\\Windows', PATH: 'x' }
    expect(expandWindowsEnv('%SystemRoot%\\System32\\cmd.exe', env)).toBe(
      'C:\\Windows\\System32\\cmd.exe'
    )
    // Las variables en Windows no distinguen mayúsculas.
    expect(expandWindowsEnv('%systemroot%\\x', env)).toBe('C:\\Windows\\x')
    // Una variable que no existe se deja como está.
    expect(expandWindowsEnv('%NOPE%\\x', env)).toBe('%NOPE%\\x')
  })

  it('stripJsonComments quita comentarios sin romper las strings', () => {
    const text = '{\n  // un comentario\n  "a": "http://x/y", /* otro */\n  "b": 1,\n}'
    expect(stripJsonComments(text)).toBe('{\n  \n  "a": "http://x/y", \n  "b": 1\n}')
  })

  it('parseJsonc lee el settings.json de Windows Terminal', () => {
    const parsed = parseJsonc('{\n  // el perfil por defecto\n  "defaultProfile": "{a}",\n}') as {
      defaultProfile: string
    }
    expect(parsed.defaultProfile).toBe('{a}')
  })
})
