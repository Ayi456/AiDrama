import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentSource = fs.readFileSync(
  path.resolve(__dirname, '../chapter/ChapterProductionVideos.vue'),
  'utf8',
)
const shotFrameStyles = fs.readFileSync(
  path.resolve(__dirname, '../../assets/production-shot-frames.css'),
  'utf8',
)

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('result box has a click fallback so missed hits still toggle playback', () => {
  assert.match(componentSource, /class="video-workbench__result"[^>]*@click="onResultBoxClick"/s)
  assert.match(componentSource, /function onResultBoxClick\(/)
  // 只兜底落在容器自身的点击，避免与 video 原生控件双重触发
  assert.match(componentSource, /event\.target !== event\.currentTarget/)
})

runTest('result video and image render as block, not flex containers', () => {
  // display:flex 加在 <video> 这类替换元素上会破坏部分 Chromium 环境的原生控件命中区
  const videoRule = shotFrameStyles.match(
    /\.video-workbench__result video,\s*\.video-workbench__result img\s*\{[^}]+\}/,
  )?.[0]
  assert.ok(videoRule, 'expected a dedicated rule for result video/img')
  assert.match(videoRule, /display:\s*block/)
  assert.doesNotMatch(videoRule, /display:\s*flex/)

  const emptyRule = shotFrameStyles.match(
    /\.video-workbench__result \.prod-cover-empty\s*\{[^}]+\}/,
  )?.[0]
  assert.ok(emptyRule, 'expected a dedicated rule for the empty cover state')
  assert.match(emptyRule, /display:\s*flex/)
})
