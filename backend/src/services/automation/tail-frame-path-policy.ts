import path from 'node:path'

export function resolveAutomationProjectRoot(sourceDir: string): string {
  return path.resolve(sourceDir, '../../../..')
}

export function resolveTailFrameInputPath(
  localPath: string | null | undefined,
  dataRoot: string,
  storageRoot: string,
): string | null {
  const raw = String(localPath || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return null
  if (path.isAbsolute(raw)) return raw

  const normalized = raw.replace(/^\/+/, '').replace(/\\/g, '/')
  if (normalized.startsWith('static/')) return path.join(dataRoot, normalized)
  return path.join(storageRoot, normalized)
}
