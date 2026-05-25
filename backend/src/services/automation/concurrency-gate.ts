export type Release = () => void
export type Gate = {
  acquire: () => Promise<Release>
  inUse: () => number
  resize: (max: number) => void
}

export function createGate(maxConcurrent: number): Gate {
  let max = Math.max(1, maxConcurrent)
  let active = 0
  const queue: Array<(release: Release) => void> = []

  function release() {
    active--
    pump()
  }

  function pump() {
    while (active < max && queue.length > 0) {
      const resolve = queue.shift()!
      active++
      resolve(release)
    }
  }

  return {
    acquire: () => new Promise<Release>(resolve => { queue.push(resolve); pump() }),
    inUse: () => active,
    resize: (n: number) => { max = Math.max(1, n); pump() },
  }
}

// Singleton gates, sized from preferences at first use.
let imageGateInstance: Gate | null = null
let videoGateInstance: Gate | null = null

export function imageGate(maxConcurrent = 4): Gate {
  if (!imageGateInstance) imageGateInstance = createGate(maxConcurrent)
  return imageGateInstance
}

export function videoGate(maxConcurrent = 2): Gate {
  if (!videoGateInstance) videoGateInstance = createGate(maxConcurrent)
  return videoGateInstance
}

export function resizeGates(image: number, video: number) {
  imageGate().resize(image)
  videoGate().resize(video)
}
