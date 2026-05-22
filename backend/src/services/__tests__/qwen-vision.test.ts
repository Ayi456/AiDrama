import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeVideoForDefects, parseVisionVerdict } from '../adapters/qwen-vision.js'

test('parseVisionVerdict: detects [结论:完整]', () => {
  const r = parseVisionVerdict('一些分析\n[结论:完整]')
  assert.equal(r.verdict, 'complete')
  assert.deepEqual(r.missingActions, [])
})

test('parseVisionVerdict: detects [结论:穿帮] with missing actions', () => {
  const r = parseVisionVerdict('一段分析\n[缺失动作]: 拔剑 | 推门 | 落地\n[结论:穿帮]')
  assert.equal(r.verdict, 'defect')
  assert.deepEqual(r.missingActions, ['拔剑', '推门', '落地'])
})

test('parseVisionVerdict: defect without missing-actions line falls back to []', () => {
  const r = parseVisionVerdict('随便\n[结论:穿帮]')
  assert.equal(r.verdict, 'defect')
  assert.deepEqual(r.missingActions, [])
})

test('parseVisionVerdict: no marker → unknown', () => {
  const r = parseVisionVerdict('普通文字，没有结论标记')
  assert.equal(r.verdict, 'unknown')
})

test('parseVisionVerdict: marker not on the last line is ignored', () => {
  const r = parseVisionVerdict('[结论:完整]\n后续还有内容')
  assert.equal(r.verdict, 'unknown')
})

test('analyzeVideoForDefects: posts OpenAI-compatible chat body and parses content', async () => {
  type Captured = { url: string; init: RequestInit }
  let captured: Captured | null = null
  const fakeFetch: typeof fetch = async (url, init) => {
    captured = { url: String(url), init: init! }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '分析\n[缺失动作]: 拔剑\n[结论:穿帮]' } }],
    }), { status: 200 })
  }

  const r = await analyzeVideoForDefects({
    videoUrl: 'https://cdn/x.mp4',
    prompt: 'PROMPT',
    baseUrl: 'https://dashscope.aliyuncs.com',
    apiKey: 'sk-xxx',
    model: 'qwen3.6-plus',
    fetchImpl: fakeFetch,
  })

  assert.equal(r.verdict, 'defect')
  assert.deepEqual(r.missingActions, ['拔剑'])
  assert.ok(captured)
  const cap = captured as Captured
  assert.equal(cap.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  const body = JSON.parse(String(cap.init.body))
  assert.equal(body.model, 'qwen3.6-plus')
  const content = body.messages[0].content
  assert.equal(content[0].type, 'video_url')
  assert.equal(content[0].video_url.url, 'https://cdn/x.mp4')
  assert.equal(content[1].type, 'text')
  assert.equal(content[1].text, 'PROMPT')
  const headers = new Headers(cap.init.headers as HeadersInit)
  assert.equal(headers.get('authorization'), 'Bearer sk-xxx')
})

test('analyzeVideoForDefects: 4xx throws an Error including status', async () => {
  const fakeFetch: typeof fetch = async () => new Response('forbidden', { status: 403 })
  await assert.rejects(
    () => analyzeVideoForDefects({
      videoUrl: 'https://cdn/x.mp4', prompt: 'p',
      baseUrl: 'https://dashscope.aliyuncs.com', apiKey: 'k', model: 'm',
      fetchImpl: fakeFetch,
    }),
    /403/,
  )
})

test('analyzeVideoForDefects: array-form content is concatenated', async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: [{ type: 'text', text: '前段' }, { type: 'text', text: '\n[结论:完整]' }] } }],
  }), { status: 200 })

  const r = await analyzeVideoForDefects({
    videoUrl: 'u', prompt: 'p', baseUrl: 'https://x', apiKey: 'k', model: 'm',
    fetchImpl: fakeFetch,
  })
  assert.equal(r.verdict, 'complete')
})

test('analyzeVideoForDefects: trims trailing whitespace before checking last line', async () => {
  const fakeFetch: typeof fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: '段落\n[结论:完整]\n\n   ' } }],
  }), { status: 200 })

  const r = await analyzeVideoForDefects({
    videoUrl: 'u', prompt: 'p', baseUrl: 'https://x', apiKey: 'k', model: 'm',
    fetchImpl: fakeFetch,
  })
  assert.equal(r.verdict, 'complete')
})
