import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const episodeCss = readFileSync(resolve(root, 'assets/episode-studio.css'), 'utf8')
const productionCss = readFileSync(resolve(root, 'assets/production-shot-frames.css'), 'utf8')

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function assertContainsAfter(css: string, anchor: string, required: string, message: string) {
  const anchorIndex = css.lastIndexOf(anchor)
  assert.ok(anchorIndex >= 0, `Missing anchor: ${anchor}`)

  const foundIndex = css.indexOf(required, anchorIndex)
  assert.ok(foundIndex >= 0, message)
}

function cssRule(css: string, selector: string) {
  const start = css.indexOf(`${selector} {`)
  assert.ok(start >= 0, `Missing rule: ${selector}`)

  const end = css.indexOf('\n}', start)
  assert.ok(end >= 0, `Missing closing brace for rule: ${selector}`)

  return css.slice(start, end)
}

function cssRuleByPattern(css: string, pattern: RegExp, label: string) {
  const match = css.match(pattern)
  assert.ok(match?.[1], `Missing rule: ${label}`)
  return match[1]
}

runTest('chapter studio shell declares a dedicated tablet breakpoint', () => {
  assertContainsAfter(
    episodeCss,
    '@media (max-width: 1240px)',
    '@media (min-width: 861px) and (max-width: 1240px)',
    'Tablet shell breakpoint must live after the broad desktop collapse rules.',
  )
  assertContainsAfter(
    episodeCss,
    '@media (min-width: 861px) and (max-width: 1240px)',
    '.pipeline {',
    'Tablet breakpoint must tune the horizontal pipeline.',
  )
})

runTest('shot image workbench keeps the final mobile override after desktop polish', () => {
  assertContainsAfter(
    productionCss,
    '/* Shot image workbench polish inspired by the target three-column layout. */',
    '@media (max-width: 860px)',
    'Shot workbench needs a mobile breakpoint after the later desktop polish rules.',
  )
  assertContainsAfter(
    productionCss,
    '/* Shot image workbench polish inspired by the target three-column layout. */',
    'grid-template-columns: 1fr;',
    'Shot workbench mobile override must force a single column after desktop polish.',
  )
})

runTest('video workbench has compact phone rules for generated media and history', () => {
  assertContainsAfter(
    productionCss,
    '/* Video generation workbench mirrors the shot image workspace. */',
    '@media (max-width: 640px)',
    'Video workbench needs a phone breakpoint after its desktop/tablet grid rules.',
  )
  assertContainsAfter(
    productionCss,
    '@media (max-width: 640px)',
    '.video-history-item {',
    'Phone video breakpoint must simplify video history rows.',
  )
})

runTest('video result preview keeps a stable footprint while history scrolls', () => {
  const resultRule = cssRule(productionCss, '.video-workbench__result')
  assert.match(
    resultRule,
    /flex:\s*0 0 auto;/,
    'Generated video preview must not flex-shrink when history grows.',
  )
  assert.match(
    resultRule,
    /aspect-ratio:\s*16\s*\/\s*9;/,
    'Generated video preview must reserve a complete 16:9 media frame.',
  )

  const resultMediaRule = cssRuleByPattern(
    productionCss,
    /\.video-workbench__result video,\s*\.video-workbench__result img\s*\{([^}]*)\}/s,
    '.video-workbench__result media',
  )
  assert.match(
    resultMediaRule,
    /min-height:\s*0;/,
    'Result media should fit the reserved frame instead of forcing overflow.',
  )
  assert.match(
    resultMediaRule,
    /object-fit:\s*contain;/,
    'Result media should be fully visible inside the preview frame.',
  )

  const historyPanelRule = cssRule(productionCss, '.video-history-panel')
  assert.match(
    historyPanelRule,
    /flex:\s*1 1 0;/,
    'Video history panel should take remaining space after the stable preview.',
  )
  assert.match(
    historyPanelRule,
    /min-height:\s*0;/,
    'Video history panel needs min-height: 0 so its list can scroll.',
  )
  assert.match(
    historyPanelRule,
    /overflow:\s*hidden;/,
    'Video history panel should contain its scrolling list.',
  )

  const historyListRule = cssRule(productionCss, '.video-history-list')
  assert.match(
    historyListRule,
    /flex:\s*1 1 auto;/,
    'Video history list should scroll inside the panel instead of resizing the preview.',
  )
  assert.match(
    historyListRule,
    /min-height:\s*0;/,
    'Video history list needs min-height: 0 for nested flex scrolling.',
  )
  assert.match(
    historyListRule,
    /overflow-y:\s*auto;/,
    'Video history list must keep its own vertical scroll.',
  )
})

runTest('tablet video workbench can expand inside the scrolling production panel', () => {
  assertContainsAfter(
    productionCss,
    '/* Responsive studio workbench overrides for PC, tablet, and phone. */',
    '.prod-content.video-workbench {',
    'Tablet video breakpoint must target the nested production video workbench.',
  )
  assertContainsAfter(
    productionCss,
    '/* Responsive studio workbench overrides for PC, tablet, and phone. */',
    'flex: 0 0 auto;',
    'Tablet video workbench must not inherit flex: 1 from generic production content.',
  )
  assertContainsAfter(
    productionCss,
    '/* Responsive studio workbench overrides for PC, tablet, and phone. */',
    'overflow: visible;',
    'Tablet video workbench must let the outer production panel scroll full content.',
  )
})
