import type { ChapterStoryboard } from './chapterMediaTypes.ts'
import {
  getComposedVideoUrl,
  getFirstFrame,
  getLastFrame,
  getStoryboardCover,
  getVideoUrl,
} from './chapterShotMediaPolicy.ts'

export type CaptureTailFrameOption = {
  key: string
  label: string
  url: string
}

function storyboardId(storyboard: ChapterStoryboard | null | undefined) {
  return Number(storyboard?.id || 0)
}

function findStoryboardIndex(storyboard: ChapterStoryboard, storyboards: ChapterStoryboard[]) {
  const id = storyboardId(storyboard)
  if (id) {
    const index = storyboards.findIndex(item => storyboardId(item) === id)
    if (index >= 0) return index
  }
  return storyboards.indexOf(storyboard)
}

export function getPreviousStoryboard(
  storyboard: ChapterStoryboard | null | undefined,
  storyboards: ChapterStoryboard[],
) {
  if (!storyboard) return null
  const index = findStoryboardIndex(storyboard, storyboards)
  if (index <= 0) return null
  return storyboards[index - 1] || null
}

export function getCaptureSourceVideoUrl(
  storyboard: ChapterStoryboard | null | undefined,
  storyboards: ChapterStoryboard[],
) {
  const previousStoryboard = getPreviousStoryboard(storyboard, storyboards)
  if (!previousStoryboard) return ''
  return getVideoUrl(previousStoryboard) || getComposedVideoUrl(previousStoryboard) || ''
}

export function getCaptureTailFrameOptions(storyboard: ChapterStoryboard | null | undefined) {
  const options: CaptureTailFrameOption[] = []
  const add = (key: string, label: string, url: string | null | undefined) => {
    const value = String(url || '').trim()
    if (!value || options.some(item => item.url === value)) return
    options.push({ key, label, url: value })
  }

  add('cover', '封面', getStoryboardCover(storyboard))
  add('first', '首帧', getFirstFrame(storyboard))
  add('last', '尾帧', getLastFrame(storyboard))
  return options
}

export function getDefaultCaptureTailFrameUrl(storyboard: ChapterStoryboard | null | undefined) {
  return getCaptureTailFrameOptions(storyboard)[0]?.url || ''
}
