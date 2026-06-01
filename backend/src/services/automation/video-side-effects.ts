import { onResourceCompleted } from './automation-hook.js'
export { captureAndPersistTailFrame } from './tail-frame-capture.js'

export async function notifyAutomationAfterVideo(
  videoGenerationId: number,
  storyboardId: number | null | undefined,
  status: 'ok' | 'failed',
): Promise<void> {
  try {
    await onResourceCompleted({
      type: 'video',
      storyboardId: storyboardId ?? null,
      videoGenerationId,
      status,
    })
  } catch (err) {
    console.warn('[automation] video hook failed', err)
  }
}
