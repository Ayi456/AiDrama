export type StoryboardChunk = {
  index: number
  total: number
  script: string
}

export type StoryboardLike = {
  storyboardNumber?: number | null
  shot_number?: number | null
}

export type GeneratedStoryboardLike = {
  shot_number: number
  [key: string]: unknown
}

type SplitOptions = {
  maxChars?: number
}

const DEFAULT_MAX_CHARS = 12000

function normalizeScript(script: string) {
  return script.replace(/\r\n/g, '\n').trim()
}

function isHeading(line: string) {
  const trimmed = line.trim()
  return /^#{1,6}\s+\S/.test(trimmed) || /^S\d+\s*[|.:\-]/i.test(trimmed)
}

function splitByHeadings(script: string) {
  const lines = script.split('\n')
  const sections: string[] = []
  let current: string[] = []

  for (const line of lines) {
    if (isHeading(line) && current.length) {
      sections.push(current.join('\n').trim())
      current = []
    }
    current.push(line)
  }

  if (current.length) sections.push(current.join('\n').trim())
  return sections.filter(Boolean)
}

function splitByParagraphs(script: string) {
  return script
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function splitOversizedPart(part: string, maxChars: number) {
  if (part.length <= maxChars) return [part]

  const chunks: string[] = []
  let start = 0
  while (start < part.length) {
    const hardEnd = Math.min(part.length, start + maxChars)
    if (hardEnd === part.length) {
      chunks.push(part.slice(start).trim())
      break
    }

    const preferredFloor = start + Math.floor(maxChars * 0.55)
    let end = hardEnd
    for (let cursor = hardEnd; cursor > preferredFloor; cursor--) {
      if (/[\n。！？；!?;]/.test(part[cursor - 1] || '')) {
        end = cursor
        break
      }
    }

    const chunk = part.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    start = end
  }
  return chunks.filter(Boolean)
}

function packParts(parts: string[], maxChars: number) {
  const packed: string[] = []
  let current = ''

  for (const rawPart of parts) {
    const oversizedParts = splitOversizedPart(rawPart, maxChars)
    for (const part of oversizedParts) {
      if (!current) {
        current = part
        continue
      }

      const next = `${current}\n\n${part}`
      if (next.length <= maxChars) {
        current = next
        continue
      }

      packed.push(current)
      current = part
    }
  }

  if (current) packed.push(current)
  return packed
}

export function splitScriptIntoStoryboardChunks(script: string, options: SplitOptions = {}): StoryboardChunk[] {
  const normalized = normalizeScript(script)
  if (!normalized) return []

  const maxChars = Math.max(200, options.maxChars || DEFAULT_MAX_CHARS)
  const headingSections = splitByHeadings(normalized)
  const parts = headingSections.length > 1 ? headingSections : splitByParagraphs(normalized)
  const scripts = packParts(parts.length ? parts : [normalized], maxChars)

  return scripts.map((chunkScript, index) => ({
    index: index + 1,
    total: scripts.length,
    script: chunkScript,
  }))
}

export function getNextStoryboardNumber(existingStoryboards: StoryboardLike[]) {
  const maxNumber = existingStoryboards.reduce((max, storyboard) => {
    const value = Number(storyboard.storyboardNumber ?? storyboard.shot_number ?? 0)
    return Number.isFinite(value) && value > max ? value : max
  }, 0)
  return maxNumber + 1
}

export function renumberStoryboardsForAppend<T extends GeneratedStoryboardLike>(
  storyboards: T[],
  startNumber: number,
): T[] {
  return storyboards.map((storyboard, index) => ({
    ...storyboard,
    shot_number: startNumber + index,
  }))
}
