import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { now } from '../../utils/response.js'
import { logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { resolveDataRoot, resolveStorageRoot } from '../../utils/runtime-paths.js'
import { staticAssetToLocalPath, uploadStaticAssetToCos } from '../../utils/cos.js'
import { createComposeJobDbPersistence } from './compose-job-state.js'
import { runStoryboardComposeFfmpeg } from './compose-ffmpeg-execution.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../../..')
const DATA_ROOT = resolveDataRoot(PROJECT_ROOT)
const STORAGE_ROOT = resolveStorageRoot(PROJECT_ROOT)

function toAbsPath(relativePath: string): string {
  return staticAssetToLocalPath(relativePath, DATA_ROOT, STORAGE_ROOT)
}

export async function composeStoryboard(storyboardId: number): Promise<string> {
  const composeState = createComposeJobDbPersistence()
  const storyboard = await composeState.loadStoryboard(storyboardId)
  if (!storyboard) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!storyboard.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)

  await composeState.markComposeProcessing(storyboardId, now())

  logTaskStart('ComposeTask', 'storyboard-compose', {
    storyboardId,
    storyboardNumber: storyboard.storyboardNumber,
    episodeId: storyboard.episodeId,
    mode: 'video-only',
  })

  const videoPath = toAbsPath(storyboard.videoUrl)
  if (!fs.existsSync(videoPath)) {
    await composeState.markComposeFailed(storyboardId, now())
    throw new Error(`Storyboard ${storyboardId} video file not found`)
  }

  const outputDir = path.join(STORAGE_ROOT, 'composed')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  try {
    const result = await runStoryboardComposeFfmpeg({
      inputPath: videoPath,
      outputPath,
    })

    const composedRelative = `static/composed/${outputFilename}`
    const composedUrl = await uploadStaticAssetToCos(composedRelative, outputPath) || composedRelative
    await composeState.completeStoryboardCompose(storyboardId, composedUrl, now())

    logTaskSuccess('ComposeTask', 'storyboard-compose', {
      storyboardId,
      storyboardNumber: storyboard.storyboardNumber,
      output: composedUrl,
      localPath: composedRelative,
      mode: 'video-only',
      hasAudio: result.hasAudio,
    })

    return composedUrl
  } catch (error) {
    await composeState.markComposeFailed(storyboardId, now())
    throw error
  }
}
