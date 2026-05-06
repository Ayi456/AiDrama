import fs from 'fs'
import path from 'path'

export function firstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
}

export function resolveFrontendPublicPath(projectRoot: string) {
  return process.env.FRONTEND_PUBLIC_PATH || firstExistingPath([
    path.join(projectRoot, 'frontend', 'dist-vite'),
    path.join(projectRoot, 'public'),
  ])
}

export function resolveDataRoot(projectRoot: string) {
  return process.env.DATA_ROOT || path.join(projectRoot, 'data')
}

export function resolveStorageRoot(projectRoot: string) {
  return process.env.STORAGE_PATH || path.join(resolveDataRoot(projectRoot), 'static')
}
