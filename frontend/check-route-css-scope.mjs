import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const appShell = readFileSync(resolve(root, 'src/App.vue'), 'utf8')
const detailPage = readFileSync(resolve(root, 'src/pages/DramaDetailView.vue'), 'utf8')
const chapterPage = readFileSync(resolve(root, 'src/pages/ChapterStudioView.vue'), 'utf8')
const detailCss = readFileSync(resolve(root, 'src/assets/drama-detail.css'), 'utf8')

const failures = []

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const nextPath = resolve(dir, entry.name)
    if (entry.isDirectory()) return walk(nextPath)
    return nextPath
  })
}

if (!/class="[^"]*\bdrama-detail\b/.test(detailPage)) {
  failures.push('Drama detail page must have a drama-detail root class for route-local CSS scoping.')
}

if (!/RouterView\s+v-slot=/.test(appShell) || !/:key="layoutKey"/.test(appShell) || !/:key="viewKey"/.test(appShell)) {
  failures.push('App shell must key layout and routed view by route to avoid stale chapter workspace state when navigating between routes.')
}

if (/class="[^"]*\bdrama-detail\b[^"]*"[^>]*v-if="drama"/.test(detailPage)) {
  failures.push('Drama detail page must render a visible loading or error state instead of hiding the whole route behind v-if="drama".')
}

if (/class="[^"]*\bstudio\b[^"]*"[^>]*v-if="drama"/.test(chapterPage)) {
  failures.push('Chapter studio page must render a visible loading or error state instead of hiding the whole route behind v-if="drama".')
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

const assetUrlImportPattern = /import\s*\{\s*assetUrl\s*\}\s*from\s*['"]@\/utils\/asset-url['"]/
const assetUrlFiles = walk(resolve(root, 'src'))
  .filter(file => /\.(?:vue|ts)$/.test(file))
  .filter(file => !file.endsWith('src\\utils\\asset-url.ts'))

for (const file of assetUrlFiles) {
  const text = readFileSync(file, 'utf8')
  if (!text.includes('assetUrl(')) continue
  if (!assetUrlImportPattern.test(text)) {
    failures.push(`File "${file.replace(`${root}\\`, '')}" uses assetUrl(...) without importing it.`)
  }
}

function getVueRuntimeCode(file, text) {
  if (!file.endsWith('.vue')) return text
  return Array.from(text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))
    .map(match => match[1])
    .join('\n')
}

const vueRuntimeHelpers = ['ref', 'computed', 'watch', 'onMounted', 'onBeforeUnmount', 'nextTick', 'reactive']
const vueRuntimeFiles = walk(resolve(root, 'src'))
  .filter(file => /\.(?:vue|ts)$/.test(file))

for (const file of vueRuntimeFiles) {
  const text = readFileSync(file, 'utf8')
  const runtimeCode = getVueRuntimeCode(file, text)
  const importedVueHelpers = new Set(
    Array.from(runtimeCode.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vue['"]/g))
      .flatMap((match) => match[1].split(','))
      .map(part => part.trim().split(/\s+as\s+/i)[0]?.trim())
      .filter(Boolean),
  )

  for (const helper of vueRuntimeHelpers) {
    if (!new RegExp(`\\b${helper}\\s*\\(`).test(runtimeCode)) continue
    if (!importedVueHelpers.has(helper)) {
      failures.push(`File "${file.replace(`${root}\\`, '')}" uses ${helper}(...) without importing it from vue.`)
    }
  }
}

if (/@back="router\.push\(`\/drama\/\$\{dramaId\}`\)"/.test(chapterPage)) {
  failures.push('Chapter studio back action must use an explicit handler so merge polling can be cleaned up before leaving the page.')
}

if (failures.length) {
  console.error(failures.map(item => `- ${item}`).join('\n'))
  process.exit(1)
}

console.log('Route CSS scope checks passed.')
