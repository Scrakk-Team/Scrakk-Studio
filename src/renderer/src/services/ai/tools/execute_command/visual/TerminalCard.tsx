/**
 * TerminalCard — custom display for execute_command tool.
 * Shows the command being executed and its output in a terminal-style view.
 */

import { useState, useEffect, type JSX } from 'react'

interface TerminalCardProps {
  args: Record<string, unknown>
  result?: string
  status?: string
}

export function TerminalCard({ args, result, status }: TerminalCardProps): JSX.Element {
  const command = (args.command as string) || ''
  const isLoading = status === 'pending' || status === 'streaming' || status === 'running'
  const [elapsed, setElapsed] = useState(0)

  // Parse terminal output from result
  let terminalOutput = ''
  let exitCode: number | undefined
  if (result) {
    try {
      const parsed = JSON.parse(result)
      if (parsed.type === 'terminal_output') {
        terminalOutput = parsed.output || ''
        exitCode = parsed.exitCode
      }
    } catch {
      terminalOutput = result
    }
  }

  // Elapsed time counter
  useEffect(() => {
    if (!isLoading) return
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(timer)
  }, [isLoading])

  return (
    <div className="terminal-card">
      <div className="terminal-card__command">
        <span className="terminal-card__prompt">$</span>
        <span className="terminal-card__cmd-text">{command}</span>
        {isLoading && elapsed > 0 && (
          <span className="terminal-card__elapsed">{elapsed}s</span>
        )}
      </div>

      {terminalOutput && (
        <pre className="terminal-card__output">{terminalOutput}</pre>
      )}

      {exitCode !== undefined && !isLoading && (
        <div className={`terminal-card__exit ${exitCode === 0 ? 'terminal-card__exit--ok' : 'terminal-card__exit--error'}`}>
          exit {exitCode}
        </div>
      )}
    </div>
  )
}
