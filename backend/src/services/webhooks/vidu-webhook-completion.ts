import {
  completeGeneratedVideoJob,
  type CompleteGeneratedVideoJobDeps,
  type CompletedGeneratedJobResult,
} from '../media/assets/media-completion.js'

export type ViduWebhookVideoRecord = {
  id: number
  storyboardId?: number | null
}

export type CompleteViduWebhookVideoInput = {
  taskId: string
  record: ViduWebhookVideoRecord
  videoUrl: string
}

export type CompleteViduWebhookVideoDeps = CompleteGeneratedVideoJobDeps

function assertBillingDeps(deps: CompleteGeneratedVideoJobDeps) {
  if (!deps.readVideoDuration || !deps.settleVideoCompletion || !deps.persistPendingVideoSettlement) {
    throw new Error('Vidu webhook video completion requires billing dependencies')
  }
}

export async function completeViduWebhookVideo(
  input: CompleteViduWebhookVideoInput,
  deps: CompleteViduWebhookVideoDeps,
): Promise<CompletedGeneratedJobResult> {
  assertBillingDeps(deps)

  return await completeGeneratedVideoJob({
    id: input.record.id,
    source: { type: 'url', videoUrl: input.videoUrl },
    duration: null,
    storyboardId: input.record.storyboardId,
  }, {
    ...deps,
    logSuccess: (_taskName, _event, payload) => {
      deps.logSuccess('Webhook', 'vidu-video-updated', {
        taskId: input.taskId,
        generationId: input.record.id,
        storyboardId: input.record.storyboardId,
        localPath: payload.localPath,
        publicUrl: payload.publicUrl,
      })
    },
  })
}
