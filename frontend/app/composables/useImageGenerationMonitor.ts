import { imageAPI } from '~/composables/useApi'

export function useImageGenerationMonitor(refresh: () => Promise<void>) {
  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function watchAsyncResult(check: () => boolean, attempts = 24, delay = 2500) {
    void (async () => {
      for (let i = 0; i < attempts; i++) {
        await sleep(delay)
        await refresh()
        if (check()) return
      }
    })()
  }

  function didImageChange(currentImage: string | null | undefined, previousImage: string | null | undefined) {
    if (!currentImage) return false
    return previousImage ? currentImage !== previousImage : true
  }

  async function waitForImageGeneration(generationId: number) {
    for (let i = 0; i < 120; i++) {
      await sleep(3000)
      let res: any = null
      try {
        res = await imageAPI.get(generationId)
      } catch (e) {
        if (i === 119) throw e
        continue
      }
      if (res?.status === 'completed') return
      if (res?.status === 'failed') throw new Error(res?.error_msg || res?.errorMsg || '图片生成失败')
    }
    throw new Error('图片生成超时')
  }

  async function waitForImageAssetUpdate(
    readImage: () => string | null | undefined,
    previousImage: string | null | undefined,
    attempts = 36,
    delay = 3000,
  ) {
    for (let i = 0; i < attempts; i++) {
      await refresh()
      if (didImageChange(readImage(), previousImage)) return true
      await sleep(delay)
    }
    return false
  }

  return {
    sleep,
    watchAsyncResult,
    waitForImageGeneration,
    waitForImageAssetUpdate,
  }
}
