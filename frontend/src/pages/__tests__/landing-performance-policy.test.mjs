import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(resolve('src/router.ts'), 'utf8')
const homeSource = readFileSync(resolve('src/pages/HomeView.vue'), 'utf8')
const mainSource = readFileSync(resolve('src/main.ts'), 'utf8')
const loginSource = readFileSync(resolve('src/pages/LoginView.vue'), 'utf8')
const registerSource = readFileSync(resolve('src/pages/RegisterView.vue'), 'utf8')
const studioCss = readFileSync(resolve('src/assets/studio.css'), 'utf8')
const landingImages = [
  'public-landing-hero',
  'public-landing-workflow',
  'public-landing-characters',
  'public-landing-gallery',
  'public-landing-stills',
]

function runTest(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function assertImageAttributes(src, requiredAttributes) {
  const tagPattern = new RegExp(`<img[\\s\\S]*?src=["']${src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][\\s\\S]*?>`)
  const match = homeSource.match(tagPattern)
  assert.ok(match, `Missing image tag for ${src}`)
  for (const attribute of requiredAttributes) {
    assert.ok(match[0].includes(attribute), `${src} should include ${attribute}`)
  }
}

runTest('routes are lazy loaded so public home does not ship the full app bundle', () => {
  assert.doesNotMatch(routerSource, /import\s+\w+\s+from\s+['"]\.\/pages\//)

  const pageFiles = [
    'HomeView',
    'WorkspaceView',
    'SettingsView',
    'CharacterAssetsView',
    'DramaDetailView',
    'ChapterStudioView',
    'WalletView',
    'ProfileView',
    'LoginView',
    'RegisterView',
  ]

  for (const page of pageFiles) {
    assert.match(
      routerSource,
      new RegExp(`const\\s+${page}\\s*=\\s*\\(\\)\\s*=>\\s*import\\(['"]\\.\\/pages\\/${page}\\.vue['"]\\)`),
      `${page} should be defined as a lazy route component`,
    )
  }
})

runTest('landing images keep the hero prioritized and defer below-fold screenshots', () => {
  assertImageAttributes('/landing/public-landing-hero.png', ['fetchpriority="high"', 'decoding="async"'])

  for (const src of landingImages.slice(1).map((name) => `/landing/${name}.png`)) {
    assertImageAttributes(src, ['loading="lazy"', 'decoding="async"'])
  }
})

runTest('landing screenshots provide smaller webp sources before png fallbacks', () => {
  for (const name of landingImages) {
    const pngPath = resolve(`public/landing/${name}.png`)
    const webpPath = resolve(`public/landing/${name}.webp`)
    assert.ok(existsSync(webpPath), `${name}.webp should exist`)
    assert.ok(statSync(webpPath).size < statSync(pngPath).size, `${name}.webp should be smaller than png`)
    assert.match(
      homeSource,
      new RegExp(`<source\\s+srcset=["']/landing/${name}\\.webp["']\\s+type=["']image/webp["']\\s*/>`),
      `${name}.webp should be offered before the png fallback`,
    )
  }
})

runTest('global startup avoids remote font downloads and auth-only css', () => {
  assert.doesNotMatch(studioCss, /fonts\.googleapis|fonts\.gstatic/)
  assert.doesNotMatch(mainSource, /assets\/auth\.css/)
  assert.match(loginSource, /import\s+['"]@\/assets\/auth\.css['"]/)
  assert.match(registerSource, /import\s+['"]@\/assets\/auth\.css['"]/)
})
