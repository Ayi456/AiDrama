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
