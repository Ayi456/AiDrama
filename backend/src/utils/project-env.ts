import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

export function parseLooseEnvFile(filePath: string): Record<string, string> {
  const values: Record<string, string> = {}
  if (!fs.existsSync(filePath)) return values

  const raw = fs.readFileSync(filePath, 'utf8')
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue

    const keyValue = line.match(/^([^=]+)=(.*)$/)
    if (keyValue) {
      values[keyValue[1].trim()] = keyValue[2].trim().replace(/^["']|["']$/g, '')
      continue
    }

    const labelValue = line.match(/^([^:：]+)[:：](.*)$/)
    if (labelValue) {
      values[labelValue[1].trim()] = labelValue[2].trim()
    }
  }

  return values
}

let loaded = false

export function ensureProjectEnvLoaded() {
  if (loaded) return
  loaded = true
  const values = parseLooseEnvFile(path.join(PROJECT_ROOT, '.env'))
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

ensureProjectEnvLoaded()
