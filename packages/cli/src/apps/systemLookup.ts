/**
 * The real disk and registry behind `CadApps`. Kept apart so tests swap it for a fake.
 */
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { CadLookup } from './cadApps'

/** `reg query <key> /ve` prints `(Default)  REG_SZ  <value>`; the label is localized, the type isn't. */
export function parseRegDefault(stdout: string): string | null {
  const match = /REG_(EXPAND_)?SZ[ \t]+(.+?)[ \t]*$/m.exec(stdout)
  if (!match) return null
  const value = match[2]
  return match[1] ? value.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole) : value
}

function registryDefault(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('reg', ['query', key, '/ve'], { timeout: 5_000, windowsHide: true }, (error, stdout) => {
      resolve(error ? null : parseRegDefault(stdout))
    })
  })
}

function roots(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['/Applications', join(homedir(), 'Applications')]
  if (platform === 'win32') {
    return [...new Set([process.env.ProgramFiles, process.env.ProgramW6432].filter((dir): dir is string => !!dir))]
  }
  return []
}

export function systemCadLookup(platform: NodeJS.Platform = process.platform): CadLookup {
  return {
    platform,
    roots: roots(platform),
    listDir: (dir) => fs.readdir(dir).catch(() => []),
    isFile: (path) => fs.stat(path).then((stat) => stat.isFile(), () => false),
    registryDefault,
  }
}
