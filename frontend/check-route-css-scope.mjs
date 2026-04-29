import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const detailPage = readFileSync(resolve(root, 'app/pages/drama/[id]/index.vue'), 'utf8')
const detailCss = readFileSync(resolve(root, 'app/assets/drama-detail.css'), 'utf8')

const failures = []

if (!/class="[^"]*\bdrama-detail\b/.test(detailPage)) {
  failures.push('Drama detail page must have a drama-detail root class for route-local CSS scoping.')
}

if (!/class="[^"]*\bdrama-detail-main\b/.test(detailPage)) {
  failures.push('Drama detail header and episode list must share a constrained drama-detail-main layout container.')
}

const sharedRouteClasses = [
  'page',
  'page-head',
  'head-left',
  'page-title',
  'page-meta',
  'meta-item',
  'field',
  'field-label',
  'field-hint',
]

const cssWithoutComments = detailCss.replace(/\/\*[\s\S]*?\*\//g, '')
const selectorBlocks = cssWithoutComments.matchAll(/([^{}]+)\{/g)

for (const match of selectorBlocks) {
  const block = match[1].trim()
  if (!block || block.startsWith('@') || block === 'from' || block === 'to' || /%$/.test(block)) continue

  for (const selector of block.split(',').map(item => item.trim()).filter(Boolean)) {
    if (selector.startsWith('@') || selector.startsWith('.drama-detail')) continue

    for (const className of sharedRouteClasses) {
      const startsWithSharedClass = new RegExp(`^\\.${className}(?:\\b|[.#:>+~\\s])`).test(selector)
      if (startsWithSharedClass) {
        failures.push(`Unscoped drama-detail selector "${selector}" can collide with other route CSS.`)
      }
    }
  }
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}

console.log('Route CSS scope checks passed.')
