type CaptureOptions = {
  filenamePrefix?: string
  maxDimension?: number
  mimeType?: 'image/png'
}

function waitForVideoFrame(video: HTMLVideoElement) {
  if (video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('视频尚未加载完成，无法截帧'))
    }, 5000)

    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('canplay', onReady)
      video.removeEventListener('seeked', onReady)
      video.removeEventListener('error', onError)
    }

    const onReady = () => {
      cleanup()
      resolve()
    }

    const onError = () => {
      cleanup()
      reject(new Error('视频加载失败，无法截帧'))
    }

    video.addEventListener('loadeddata', onReady, { once: true })
    video.addEventListener('canplay', onReady, { once: true })
    video.addEventListener('seeked', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

function resolveCaptureSize(video: HTMLVideoElement, maxDimension: number) {
  const sourceWidth = video.videoWidth || video.clientWidth
  const sourceHeight = video.videoHeight || video.clientHeight
  if (!sourceWidth || !sourceHeight) throw new Error('无法读取视频尺寸')

  const longest = Math.max(sourceWidth, sourceHeight)
  const scale = longest > maxDimension ? maxDimension / longest : 1
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

function blobToFile(blob: Blob, filename: string, mimeType: string) {
  return new File([blob], filename, { type: mimeType })
}

export async function captureVideoFrameFile(video: HTMLVideoElement, options: CaptureOptions = {}) {
  await waitForVideoFrame(video)

  const mimeType = options.mimeType || 'image/png'
  const maxDimension = Math.max(320, Number(options.maxDimension) || 1280)
  const { width, height } = resolveCaptureSize(video, maxDimension)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建截图画布')

  try {
    context.drawImage(video, 0, 0, width, height)
  } catch {
    throw new Error('当前视频源无法直接截帧，请确认视频已通过同源代理加载')
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value)
      else reject(new Error('视频截帧失败'))
    }, mimeType)
  })

  const prefix = (options.filenamePrefix || 'video-frame')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'video-frame'

  return blobToFile(blob, `${prefix}-${Date.now()}.png`, mimeType)
}
