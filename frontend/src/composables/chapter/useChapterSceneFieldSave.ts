import { sceneAPI } from '../useApi.ts'
import type { ChapterScene } from './chapterMediaTypes.ts'

type SceneFieldUpdatePayload = Record<string, unknown>
type UpdateScene = (id: number, payload: SceneFieldUpdatePayload) => Promise<unknown>

type ChapterSceneFieldSaverOptions = {
  updateScene?: UpdateScene
}

const FIELD_ALIASES: Record<string, string[]> = {
  image_url: ['image_url', 'imageUrl'],
  imageUrl: ['image_url', 'imageUrl'],
  local_path: ['local_path', 'localPath'],
  localPath: ['local_path', 'localPath'],
  reference_image: ['reference_image', 'referenceImage'],
  referenceImage: ['reference_image', 'referenceImage'],
}

const API_FIELD: Record<string, string> = {
  imageUrl: 'image_url',
  image_url: 'image_url',
  localPath: 'local_path',
  local_path: 'local_path',
  referenceImage: 'reference_image',
  reference_image: 'reference_image',
}

function fieldAliases(field: string) {
  return FIELD_ALIASES[field] || [field]
}

function readSceneField(scene: ChapterScene, field: string) {
  for (const key of fieldAliases(field)) {
    const value = (scene as Record<string, unknown>)[key]
    if (value !== undefined) return value
  }
  return undefined
}

function writeSceneField(scene: ChapterScene, field: string, value: unknown) {
  const record = scene as Record<string, unknown>
  for (const key of fieldAliases(field)) {
    record[key] = value
  }
}

function snapshotSceneField(scene: ChapterScene, field: string) {
  const record = scene as Record<string, unknown>
  return fieldAliases(field).map(key => [key, record[key]] as const)
}

function restoreSceneField(scene: ChapterScene, snapshot: ReadonlyArray<readonly [string, unknown]>) {
  const record = scene as Record<string, unknown>
  for (const [key, value] of snapshot) {
    record[key] = value
  }
}

export function createChapterSceneFieldSaver(options: ChapterSceneFieldSaverOptions = {}) {
  const updateScene = options.updateScene || sceneAPI.update

  async function updateSceneField(scene: ChapterScene | null | undefined, field: string, value: unknown) {
    const id = Number(scene?.id || 0)
    if (!scene || !id || !field) return

    const current = readSceneField(scene, field)
    if (Object.is(current ?? '', value ?? '')) return

    const snapshot = snapshotSceneField(scene, field)
    writeSceneField(scene, field, value)

    try {
      await updateScene(id, { [API_FIELD[field] || field]: value })
    } catch (error) {
      restoreSceneField(scene, snapshot)
      throw error
    }
  }

  return {
    updateSceneField,
  }
}
