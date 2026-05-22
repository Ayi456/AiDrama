# 视频生成穿帮自动检测与重生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `completeGeneratedVideoJob` 单点注入"视觉理解模型穿帮检测 + 自动重生成"链路；默认模型 qwen3.6-plus（阿里百炼），可在设置中开关并配置最大尝试次数。

**Architecture:** 复用 `aiServiceConfigs` 表，新增 `serviceType='vision'`；开关与重试上限存于该行的 `settings` JSON。后端新增三个职责单一的模块（adapter/协调器/重生成）+ schema 三列，沿用既有"纯函数 + deps 注入"风格嵌入 `completeGeneratedVideoJob`。前端在 `SettingsView.vue` 加一类配置类型。

**Tech Stack:** TypeScript / Hono / Drizzle ORM (MySQL) / Vue 3 / Vite。后端测试用纯 Node + `node:test`/手写断言（沿用现有 `services/__tests__/*.test.ts` 风格），由 `backend/package.json` 的 `test` 脚本逐个 `node dist/...` 跑。

---

## 文件结构

**新文件：**

- `backend/src/utils/defect-check-prompt.ts` — 检测 prompt 常量（人类可读规则 + 末尾固定标记要求）
- `backend/src/services/adapters/qwen-vision.ts` — qwen3.6-plus HTTP adapter（OpenAI 兼容路径）
- `backend/src/services/generation/video-defect-check.ts` — 协调器：读配置 → 调 adapter → 决定 publish/regenerate
- `backend/src/services/generation/video-regeneration.ts` — 重生成入口：从旧行重建参数并调 `generateVideo`
- `backend/src/services/__tests__/qwen-vision.test.ts`
- `backend/src/services/__tests__/video-defect-check.test.ts`
- `backend/src/services/__tests__/video-regeneration.test.ts`

**修改：**

- `backend/src/db/schema.ts` — `videoGenerations` 加 `defectCheckAttempt` / `defectCheckParentId` / `defectCheckResult`
- `backend/src/routes/policies/ai-config-route-policy.ts` — `VALID_AI_SERVICE_TYPES` + 错误信息加 `'vision'`
- `backend/src/routes/configs/aiConfigs.ts` — `buildProbe` 加 vision 分支
- `backend/src/services/media/assets/media-completion.ts` — Deps 加 `defectCheck?` 字段，主体加分支
- `backend/src/services/generation/video-generation.ts` — 在 `completeGeneratedVideo` helper 注入 defectCheck 实现 + 实现"重生成时拼接缺失动作 prompt"
- `backend/src/services/webhooks/vidu-webhook-completion.ts` — 注入相同 defectCheck 实现
- `frontend/src/pages/SettingsView.vue` — 加 `'vision'` 类型 + 开关/最大次数字段
- `backend/package.json` — `test` 脚本追加三个新测试

---

## Task 1: Schema — videoGenerations 加三列

**Files:**
- Modify: `backend/src/db/schema.ts:241-279`

- [ ] **Step 1: 编辑 schema**

定位 `videoGenerations` 中 `deletedAt: text('deleted_at'),` 行，在其前面插入三列：

```ts
  defectCheckAttempt: int('defect_check_attempt').default(0),
  defectCheckParentId: int('defect_check_parent_id'),
  defectCheckResult: text('defect_check_result'),
  deletedAt: text('deleted_at'),
```

类型选择：`int` 与表内 `id`/`storyboardId` 等保持一致；`defectCheckResult` 用 `text` 存 JSON 字符串（与 `providerRequest` 等列同模式）。`defaultValue` 不加 `notNull`，旧行允许为 null，便于回填。

- [ ] **Step 2: 同步到 MySQL（开发库）**

```bash
cd backend && npm run db:push
```

预期：drizzle-kit 提示新增三列，确认即可。

- [ ] **Step 3: typecheck**

```bash
cd backend && npm run typecheck
```

预期：无错误。

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts
git commit -m "feat(schema): video_generations 加 defect_check_attempt/parent_id/result 三列"
```

---

## Task 2: 配置策略允许 'vision'

**Files:**
- Modify: `backend/src/routes/policies/ai-config-route-policy.ts:3,86,95`
- Test: `backend/src/routes/__tests__/ai-config-route-policy.test.ts`（已存在，扩充）

- [ ] **Step 1: 看现有测试结构**

Run: `cat backend/src/routes/__tests__/ai-config-route-policy.test.ts | head -60`
目标：摸清 assertion 风格（`assert.equal` / `node:test` 等），新断言保持一致。

- [ ] **Step 2: 扩充测试 — vision 应被接受**

在该测试文件末尾追加（沿用文件已有的 import 与断言函数；如下示例假设它用 `node:test` + `node:assert/strict`，否则按文件已有风格写）：

```ts
test('validateAiConfigCreateBody accepts vision service_type', () => {
  const error = validateAiConfigCreateBody({ service_type: 'vision', provider: 'ali' })
  assert.equal(error, null)
})

test('validateAiConfigProbeBody accepts vision service_type', () => {
  const error = validateAiConfigProbeBody({
    service_type: 'vision',
    provider: 'ali',
    base_url: 'https://dashscope.aliyuncs.com',
  })
  assert.equal(error, null)
})
```

- [ ] **Step 3: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -40
```

预期：新增两个用例失败，错误信息含 `service_type must be one of text, image or video`。

- [ ] **Step 4: 改策略**

打开 `backend/src/routes/policies/ai-config-route-policy.ts`，做三处替换：

```ts
export const VALID_AI_SERVICE_TYPES = new Set(['text', 'image', 'video', 'vision'])
```

把 `validateAiConfigCreateBody` 与 `validateAiConfigProbeBody` 中的错误文案：

```ts
return 'service_type must be one of text, image, video or vision'
```

- [ ] **Step 5: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -40
```

预期：所有测试通过。

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/policies/ai-config-route-policy.ts backend/src/routes/__tests__/ai-config-route-policy.test.ts
git commit -m "feat(ai-config): 允许 service_type=vision"
```

---

## Task 3: Defect-check Prompt 常量

**Files:**
- Create: `backend/src/utils/defect-check-prompt.ts`

- [ ] **Step 1: 写常量文件**

```ts
export const DEFECT_CHECK_PROMPT = `【硬性规则】
1. 你只能描述"画面中实际拍到的内容"。任何没有出现在画面里的动作（哪怕在剧情上"理应发生"），都不能作为合理化解释。
2. "镜头切换""剧情推进""动画表现手法"都不是合理化借口。如果一个状态变化在物理上需要某个动作，而这个动作没有被拍到，就算穿帮，无论剪辑是否流畅。

【分析步骤】
A. 列出所有发生状态变化的物体/人物，对每一个变化回答：
   - 变化前状态：________
   - 变化后状态：________
   - 物理上从前一个状态到后一个状态，必须发生什么动作？
   - 这个必要动作在画面中是否被完整拍到？请引用你看到该动作的时间段。
   - 如果没有拍到完整动作，是不是被剪辑跳过了？

B. 终判：
   - 列出所有"必要动作缺失 / 被剪辑跳过"的情况。
   - 不要用"符合动画手法""剧情过渡自然"来开脱，只判断动作链条是否完整。

【输出格式】
对每一个状态变化，必须给出：
- 时间点
- 必要动作清单
- 画面中实际呈现的动作清单
- 缺失项（两者之差）
- 结论：完整 / 缺失关键动作（穿帮）

【机器判定要求】
若判定为穿帮，请在倒数第二行用以下格式列出所有缺失的关键动作：
[缺失动作]: 动作1 | 动作2 | 动作3
请在最后一行单独输出固定标记之一（不带任何其他字符）：
[结论:完整]
或
[结论:穿帮]
`
```

- [ ] **Step 2: typecheck**

```bash
cd backend && npm run typecheck
```

预期：无错误。

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/defect-check-prompt.ts
git commit -m "feat(defect-check): 加视频穿帮检测 prompt 常量"
```

<!-- TASK-3-END -->

---

## Task 4: qwen-vision adapter（HTTP + verdict 解析）

**Files:**
- Create: `backend/src/services/adapters/qwen-vision.ts`
- Test: `backend/src/services/__tests__/qwen-vision.test.ts`

设计要点：
- 走阿里百炼 OpenAI 兼容路径：`POST {baseUrl}/compatible-mode/v1/chat/completions`
- 请求体 messages 是单条 user，content 是 part 数组：`[{type:'video_url', video_url:{url}}, {type:'text', text}]`
- 不依赖 DB、不打日志（由协调器统一日志）；可注入 `fetchImpl`，便于测试。

- [ ] **Step 1: 写 adapter 骨架（先让测试 import 不爆）**

```ts
// backend/src/services/adapters/qwen-vision.ts
export interface VisionAnalyzeParams {
  videoUrl: string
  prompt: string
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type VisionVerdict = 'complete' | 'defect' | 'unknown'

export interface VisionAnalyzeResult {
  rawText: string
  verdict: VisionVerdict
  missingActions: string[]
}

export async function analyzeVideoForDefects(_params: VisionAnalyzeParams): Promise<VisionAnalyzeResult> {
  throw new Error('not implemented')
}

export function parseVisionVerdict(rawText: string): { verdict: VisionVerdict; missingActions: string[] } {
  return { verdict: 'unknown', missingActions: [] }
}
```

- [ ] **Step 2: 写 RED 测试 — verdict 解析**

```ts
// backend/src/services/__tests__/qwen-vision.test.ts
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
  let captured: { url: string; init: RequestInit } | null = null
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
  assert.equal(captured!.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions')
  const body = JSON.parse(String(captured!.init.body))
  assert.equal(body.model, 'qwen3.6-plus')
  const content = body.messages[0].content
  assert.equal(content[0].type, 'video_url')
  assert.equal(content[0].video_url.url, 'https://cdn/x.mp4')
  assert.equal(content[1].type, 'text')
  assert.equal(content[1].text, 'PROMPT')
  const headers = new Headers(captured!.init.headers as HeadersInit)
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
```

- [ ] **Step 3: 把测试加进 backend/package.json 的 test 脚本**

打开 `backend/package.json`，在 `test` 脚本字符串末尾追加：

```
 && node dist/services/__tests__/qwen-vision.test.js
```

- [ ] **Step 4: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：qwen-vision 相关用例全部失败（throw `not implemented` / 解析全返回 unknown）。

- [ ] **Step 5: 实现 adapter**

替换 `qwen-vision.ts` 整个内容：

```ts
export interface VisionAnalyzeParams {
  videoUrl: string
  prompt: string
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type VisionVerdict = 'complete' | 'defect' | 'unknown'

export interface VisionAnalyzeResult {
  rawText: string
  verdict: VisionVerdict
  missingActions: string[]
}

const VERDICT_PATTERN = /^\[结论:(完整|穿帮)\]$/
const MISSING_ACTIONS_PATTERN = /^\[缺失动作\]:\s*(.+)$/

function joinUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const prefixedPath = path.startsWith('/') ? path : `/${path}`
  return `${trimmedBase}${prefixedPath}`
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in (part as Record<string, unknown>)) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function parseVisionVerdict(rawText: string): { verdict: VisionVerdict; missingActions: string[] } {
  const lines = rawText.replace(/\s+$/g, '').split(/\r?\n/)
  if (lines.length === 0) return { verdict: 'unknown', missingActions: [] }
  const lastLine = lines[lines.length - 1].trim()
  const verdictMatch = VERDICT_PATTERN.exec(lastLine)
  if (!verdictMatch) return { verdict: 'unknown', missingActions: [] }
  const verdict: VisionVerdict = verdictMatch[1] === '完整' ? 'complete' : 'defect'

  let missingActions: string[] = []
  if (verdict === 'defect') {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line) continue
      const m = MISSING_ACTIONS_PATTERN.exec(line)
      if (m) {
        missingActions = m[1].split('|').map((s) => s.trim()).filter(Boolean)
      }
      break
    }
  }
  return { verdict, missingActions }
}

export async function analyzeVideoForDefects(params: VisionAnalyzeParams): Promise<VisionAnalyzeResult> {
  const fetchImpl = params.fetchImpl ?? fetch
  const url = joinUrl(params.baseUrl, '/compatible-mode/v1/chat/completions')
  const body = {
    model: params.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: params.videoUrl } },
          { type: 'text', text: params.prompt },
        ],
      },
    ],
  }

  const controller = new AbortController()
  const timeoutMs = params.timeoutMs ?? 120_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let resp: Response
  try {
    resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`qwen-vision HTTP ${resp.status}: ${text.slice(0, 240)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`qwen-vision unparseable JSON: ${text.slice(0, 240)}`)
  }
  const rawContent = (parsed as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content
  const rawText = extractContentText(rawContent)
  const { verdict, missingActions } = parseVisionVerdict(rawText)
  return { rawText, verdict, missingActions }
}
```

- [ ] **Step 6: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：qwen-vision 相关 8 个用例全部通过，其他用例不受影响。

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/adapters/qwen-vision.ts backend/src/services/__tests__/qwen-vision.test.ts backend/package.json
git commit -m "feat(qwen-vision): 加视频理解 adapter，支持穿帮判定解析"
```

<!-- TASK-4-END -->

---

## Task 5: video-defect-check 协调器

**Files:**
- Create: `backend/src/services/generation/video-defect-check.ts`
- Test: `backend/src/services/__tests__/video-defect-check.test.ts`

设计要点：
- 入参：`{ videoUrl, attemptNumber }`，**不读 DB**（vision config 也作为参数注入），便于纯函数测试。
- 上层调用方负责读 vision config + 写 `defectCheckResult`；协调器只决定 `action: 'publish' | 'regenerate'`。
- 错误（adapter throw / 解析 unknown）一律降级为 `action:'publish', verdict:'unknown'`。

- [ ] **Step 1: 写骨架 + 类型**

```ts
// backend/src/services/generation/video-defect-check.ts
import type { VisionAnalyzeResult } from '../adapters/qwen-vision.js'

export type DefectCheckVerdict =
  | 'skipped' | 'complete' | 'defect' | 'defect_exhausted' | 'unknown'

export type DefectCheckAction = 'publish' | 'regenerate'

export interface DefectVisionConfig {
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  maxAttempts: number
}

export interface DefectCheckInput {
  videoUrl: string
  attemptNumber: number
  visionConfig: DefectVisionConfig | null
  prompt: string
  analyze: (params: {
    videoUrl: string
    prompt: string
    baseUrl: string
    apiKey: string
    model: string
  }) => Promise<VisionAnalyzeResult>
}

export interface DefectCheckDecision {
  action: DefectCheckAction
  verdict: DefectCheckVerdict
  missingActions: string[]
  rawText: string
  error: string | null
  model: string | null
  attemptedAt: string
}

export function clampMaxAttempts(value: unknown, fallback = 2): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(5, Math.max(1, Math.trunc(n)))
}

export async function runDefectCheck(_input: DefectCheckInput): Promise<DefectCheckDecision> {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: 写 RED 测试 — 错误处理矩阵**

```ts
// backend/src/services/__tests__/video-defect-check.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampMaxAttempts,
  runDefectCheck,
  type DefectVisionConfig,
} from '../generation/video-defect-check.js'

const baseConfig: DefectVisionConfig = {
  baseUrl: 'https://x',
  apiKey: 'k',
  model: 'qwen3.6-plus',
  enabled: true,
  maxAttempts: 2,
}

const fakeAnalyze = (result: { verdict: 'complete' | 'defect' | 'unknown'; missingActions?: string[] }) => {
  return async () => ({
    rawText: 'raw',
    verdict: result.verdict,
    missingActions: result.missingActions ?? [],
  })
}

const throwingAnalyze = (err: Error) => async () => { throw err }

test('clampMaxAttempts: clamps and falls back', () => {
  assert.equal(clampMaxAttempts(undefined), 2)
  assert.equal(clampMaxAttempts(0), 1)
  assert.equal(clampMaxAttempts(99), 5)
  assert.equal(clampMaxAttempts(3), 3)
  assert.equal(clampMaxAttempts('not a number'), 2)
})

test('skipped: no vision config → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: null,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'skipped')
  assert.equal(r.error, 'no_vision_config')
})

test('skipped: enabled=false → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: { ...baseConfig, enabled: false },
    analyze: fakeAnalyze({ verdict: 'defect' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'skipped')
  assert.equal(r.error, 'disabled')
})

test('complete: publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'complete')
})

test('defect & under cap → regenerate', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig, // maxAttempts=2
    analyze: fakeAnalyze({ verdict: 'defect', missingActions: ['拔剑'] }),
  })
  assert.equal(r.action, 'regenerate')
  assert.equal(r.verdict, 'defect')
  assert.deepEqual(r.missingActions, ['拔剑'])
})

test('defect at last attempt → publish + defect_exhausted', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 1, prompt: 'p', // attempt+1=2 == max
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'defect', missingActions: ['拔剑'] }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'defect_exhausted')
})

test('unknown verdict → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'unknown' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'unknown')
  assert.equal(r.error, 'unparseable')
})

test('analyze throws → publish + unknown + error', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: throwingAnalyze(new Error('qwen-vision HTTP 401: bad key')),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'unknown')
  assert.match(r.error ?? '', /401/)
})

test('decision always includes attemptedAt and model', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(typeof r.attemptedAt, 'string')
  assert.ok(r.attemptedAt.length > 0)
  assert.equal(r.model, 'qwen3.6-plus')
})
```

- [ ] **Step 3: 把测试加进 backend/package.json 的 test 脚本**

在 `qwen-vision.test.js` 之后追加：

```
 && node dist/services/__tests__/video-defect-check.test.js
```

- [ ] **Step 4: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：video-defect-check 相关用例全部 fail（throw not implemented）。

- [ ] **Step 5: 实现协调器**

替换 `video-defect-check.ts` 的 `runDefectCheck` 与所需 helper：

```ts
function emptyDecision(verdict: DefectCheckVerdict, model: string | null, error: string | null): DefectCheckDecision {
  return {
    action: 'publish',
    verdict,
    missingActions: [],
    rawText: '',
    error,
    model,
    attemptedAt: new Date().toISOString(),
  }
}

export async function runDefectCheck(input: DefectCheckInput): Promise<DefectCheckDecision> {
  if (!input.visionConfig) {
    return emptyDecision('skipped', null, 'no_vision_config')
  }
  if (!input.visionConfig.enabled) {
    return emptyDecision('skipped', input.visionConfig.model, 'disabled')
  }

  const cfg = input.visionConfig
  let result: VisionAnalyzeResult
  try {
    result = await input.analyze({
      videoUrl: input.videoUrl,
      prompt: input.prompt,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ...emptyDecision('unknown', cfg.model, message),
    }
  }

  const attemptedAt = new Date().toISOString()
  if (result.verdict === 'complete') {
    return {
      action: 'publish',
      verdict: 'complete',
      missingActions: [],
      rawText: result.rawText,
      error: null,
      model: cfg.model,
      attemptedAt,
    }
  }
  if (result.verdict === 'unknown') {
    return {
      action: 'publish',
      verdict: 'unknown',
      missingActions: [],
      rawText: result.rawText,
      error: 'unparseable',
      model: cfg.model,
      attemptedAt,
    }
  }
  // defect
  const willExhaust = input.attemptNumber + 1 >= cfg.maxAttempts
  return {
    action: willExhaust ? 'publish' : 'regenerate',
    verdict: willExhaust ? 'defect_exhausted' : 'defect',
    missingActions: result.missingActions,
    rawText: result.rawText,
    error: null,
    model: cfg.model,
    attemptedAt,
  }
}
```

并在文件顶部把 `import type { VisionAnalyzeResult }` 升级为非 type-only（运行期不需要值，仍保持 type-only 即可——保留原样）。

- [ ] **Step 6: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：video-defect-check 9 个用例全部通过。

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/generation/video-defect-check.ts backend/src/services/__tests__/video-defect-check.test.ts backend/package.json
git commit -m "feat(defect-check): 加协调器，纯函数化错误处理矩阵"
```

<!-- TASK-5-END -->

---

## Task 6: video-regeneration（重生成入口）

**Files:**
- Create: `backend/src/services/generation/video-regeneration.ts`
- Test: `backend/src/services/__tests__/video-regeneration.test.ts`

设计要点：
- 只做两件事：(1) 用旧行 + missingActions 拼出新的 `VideoGenerationEnqueueParams`；(2) 调注入的 `enqueue(params)`，返回新 id。
- 重生成用的"原 prompt"取自旧行 `prompt` 字段，**剥掉**之前可能拼接过的"【上次生成存在动作链断裂...】"段落，避免逐次叠加。
- 测试不调真实 `generateVideo`，注入 mock。

- [ ] **Step 1: 写骨架**

```ts
// backend/src/services/generation/video-regeneration.ts
export interface VideoRecordForRegen {
  id: number
  prompt: string | null
  model: string | null
  configId?: number | null
  storyboardId?: number | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  duration?: number | null
  fps?: number | null
  resolution?: string | null
  aspectRatio?: string | null
  defectCheckAttempt?: number | null
}

export interface RegenEnqueueParams {
  prompt: string
  model: string | null
  configId?: number | null
  storyboardId?: number | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  duration?: number | null
  fps?: number | null
  resolution?: string | null
  aspectRatio?: string | null
  defectCheckAttempt: number
  defectCheckParentId: number
}

export interface RegenInput {
  originalRecord: VideoRecordForRegen
  missingActions: string[]
  enqueue: (params: RegenEnqueueParams) => Promise<number>
}

const DEFECT_HINT_BLOCK = '\n\n【上次生成存在动作链断裂，请确保以下动作被完整拍到】'

export function stripPreviousDefectHint(prompt: string): string {
  const idx = prompt.indexOf(DEFECT_HINT_BLOCK)
  return idx < 0 ? prompt : prompt.slice(0, idx).replace(/\s+$/, '')
}

export function buildRegenPrompt(originalPrompt: string, missingActions: string[]): string {
  const base = stripPreviousDefectHint(originalPrompt)
  if (missingActions.length === 0) {
    return `${base}${DEFECT_HINT_BLOCK}\n- 上次生成动作链不完整，请保证所有关键动作被完整拍到`
  }
  const bullets = missingActions.map((a) => `- ${a}`).join('\n')
  return `${base}${DEFECT_HINT_BLOCK}\n${bullets}`
}

export async function enqueueDefectRegeneration(_input: RegenInput): Promise<number> {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: 写 RED 测试**

```ts
// backend/src/services/__tests__/video-regeneration.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRegenPrompt,
  stripPreviousDefectHint,
  enqueueDefectRegeneration,
  type VideoRecordForRegen,
} from '../generation/video-regeneration.js'

const baseRecord: VideoRecordForRegen = {
  id: 42,
  prompt: '一名剑客出鞘并跃下',
  model: 'wanx-v1',
  configId: 7,
  storyboardId: 99,
  imageUrl: 'https://x/a.png',
  firstFrameUrl: 'https://x/f.png',
  lastFrameUrl: null,
  duration: 5,
  fps: 24,
  resolution: '1280x720',
  aspectRatio: '16:9',
  defectCheckAttempt: 0,
}

test('stripPreviousDefectHint: removes prior defect block', () => {
  const withHint = '原始内容\n\n【上次生成存在动作链断裂，请确保以下动作被完整拍到】\n- 拔剑'
  assert.equal(stripPreviousDefectHint(withHint), '原始内容')
})

test('stripPreviousDefectHint: idempotent on plain prompt', () => {
  assert.equal(stripPreviousDefectHint('普通内容'), '普通内容')
})

test('buildRegenPrompt: appends bullet list of missing actions', () => {
  const r = buildRegenPrompt('原始 prompt', ['拔剑', '推门'])
  assert.match(r, /^原始 prompt\n\n【上次生成/)
  assert.match(r, /- 拔剑\n- 推门$/)
})

test('buildRegenPrompt: empty missingActions falls back to generic line', () => {
  const r = buildRegenPrompt('原始', [])
  assert.match(r, /上次生成动作链不完整/)
})

test('buildRegenPrompt: does not stack hints across regenerations', () => {
  const once = buildRegenPrompt('原始', ['拔剑'])
  const twice = buildRegenPrompt(once, ['推门'])
  // 只应有一段【上次生成...】前缀
  const occurrences = twice.split('【上次生成存在动作链断裂').length - 1
  assert.equal(occurrences, 1)
  assert.match(twice, /- 推门$/)
})

test('enqueueDefectRegeneration: forwards params and increments attempt + parent id', async () => {
  let captured: any = null
  const enqueue = async (params: any) => {
    captured = params
    return 88
  }
  const newId = await enqueueDefectRegeneration({
    originalRecord: baseRecord,
    missingActions: ['拔剑'],
    enqueue,
  })
  assert.equal(newId, 88)
  assert.equal(captured.defectCheckParentId, 42)
  assert.equal(captured.defectCheckAttempt, 1)
  assert.equal(captured.model, 'wanx-v1')
  assert.equal(captured.configId, 7)
  assert.equal(captured.storyboardId, 99)
  assert.equal(captured.imageUrl, 'https://x/a.png')
  assert.equal(captured.firstFrameUrl, 'https://x/f.png')
  assert.equal(captured.duration, 5)
  assert.equal(captured.aspectRatio, '16:9')
  assert.match(captured.prompt, /- 拔剑$/)
})

test('enqueueDefectRegeneration: handles null prompt with empty string', async () => {
  let captured: any = null
  const enqueue = async (params: any) => { captured = params; return 1 }
  await enqueueDefectRegeneration({
    originalRecord: { ...baseRecord, prompt: null },
    missingActions: ['x'],
    enqueue,
  })
  assert.match(captured.prompt, /\n- x$/)
})
```

- [ ] **Step 3: 把测试加进 backend/package.json 的 test 脚本**

在 `video-defect-check.test.js` 之后追加：

```
 && node dist/services/__tests__/video-regeneration.test.js
```

- [ ] **Step 4: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：相关用例 fail。

- [ ] **Step 5: 实现 enqueueDefectRegeneration**

替换 `video-regeneration.ts` 末尾函数：

```ts
export async function enqueueDefectRegeneration(input: RegenInput): Promise<number> {
  const rec = input.originalRecord
  const prompt = buildRegenPrompt(rec.prompt ?? '', input.missingActions)
  const previousAttempt = typeof rec.defectCheckAttempt === 'number' ? rec.defectCheckAttempt : 0
  return await input.enqueue({
    prompt,
    model: rec.model,
    configId: rec.configId,
    storyboardId: rec.storyboardId,
    imageUrl: rec.imageUrl,
    firstFrameUrl: rec.firstFrameUrl,
    lastFrameUrl: rec.lastFrameUrl,
    duration: rec.duration,
    fps: rec.fps,
    resolution: rec.resolution,
    aspectRatio: rec.aspectRatio,
    defectCheckAttempt: previousAttempt + 1,
    defectCheckParentId: rec.id,
  })
}
```

- [ ] **Step 6: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：所有 video-regeneration 用例通过。

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/generation/video-regeneration.ts backend/src/services/__tests__/video-regeneration.test.ts backend/package.json
git commit -m "feat(defect-check): 加重生成入口，自动拼缺失动作提示"
```

<!-- TASK-6-END -->

---

## Task 7: 把 defectCheck 嵌入 completeGeneratedVideoJob

**Files:**
- Modify: `backend/src/services/media/assets/media-completion.ts:84-90,199-228`
- Modify (扩充测试): `backend/src/services/__tests__/media-completion.test.ts`

设计要点：
- 给 `CompleteGeneratedVideoJobDeps` 加一个**可选** `defectCheck`，类型签名独立，调用方不传等于"功能未启用"。
- 主体改动：在 `materializeGeneratedVideo` + `publishGeneratedAsset` 拿到 `publicUrl` 之后、`persistVideoCompletion` 之前调用 `defectCheck`；如果返回 `'regenerate'`，**不**走 `persistVideoCompletion` 与 `publishStoryboardVideo`，**直接返回**。
- "写 defectCheckResult、把旧行 status 改 failed_defect、调 enqueueDefectRegeneration" 由 deps 注入的 `defectCheck` 内部完成（这样 media-completion 文件不引用 db schema）。

- [ ] **Step 1: 看测试现状**

Run: `cat backend/src/services/__tests__/media-completion.test.ts | head -80`
摸清 stub 风格，沿用相同模式写新增 case。

- [ ] **Step 2: 写 RED 测试 — 跳过/publish/regenerate 三条路径**

在 `media-completion.test.ts` 末尾追加（类型 import 与已有 `completeGeneratedVideoJob` 一致）：

```ts
test('completeGeneratedVideoJob: defectCheck=publish runs persist + publishStoryboardVideo as before', async () => {
  const calls: string[] = []
  await completeGeneratedVideoJob({
    id: 1,
    source: { type: 'url', videoUrl: 'https://x/v.mp4' },
    duration: 5,
    storyboardId: 9,
  }, {
    now: () => '2026-05-22T00:00:00Z',
    downloadFile: async () => '/tmp/v.mp4',
    uploadGeneratedAsset: async () => 'https://cdn/v.mp4',
    persistVideoCompletion: async () => { calls.push('persist') },
    publishStoryboardVideo: async () => { calls.push('publish') },
    logSuccess: () => {},
    defectCheck: async () => ({ action: 'publish' }),
  })
  assert.deepEqual(calls, ['persist', 'publish'])
})

test('completeGeneratedVideoJob: defectCheck=regenerate skips persist and publishStoryboardVideo', async () => {
  const calls: string[] = []
  await completeGeneratedVideoJob({
    id: 1,
    source: { type: 'url', videoUrl: 'https://x/v.mp4' },
    duration: 5,
    storyboardId: 9,
  }, {
    now: () => '2026-05-22T00:00:00Z',
    downloadFile: async () => '/tmp/v.mp4',
    uploadGeneratedAsset: async () => 'https://cdn/v.mp4',
    persistVideoCompletion: async () => { calls.push('persist') },
    publishStoryboardVideo: async () => { calls.push('publish') },
    logSuccess: () => {},
    defectCheck: async () => ({ action: 'regenerate' }),
  })
  assert.deepEqual(calls, [])
})

test('completeGeneratedVideoJob: omitting defectCheck preserves prior behaviour', async () => {
  const calls: string[] = []
  await completeGeneratedVideoJob({
    id: 1,
    source: { type: 'url', videoUrl: 'https://x/v.mp4' },
    duration: 5,
    storyboardId: 9,
  }, {
    now: () => '2026-05-22T00:00:00Z',
    downloadFile: async () => '/tmp/v.mp4',
    uploadGeneratedAsset: async () => 'https://cdn/v.mp4',
    persistVideoCompletion: async () => { calls.push('persist') },
    publishStoryboardVideo: async () => { calls.push('publish') },
    logSuccess: () => {},
  })
  assert.deepEqual(calls, ['persist', 'publish'])
})

test('completeGeneratedVideoJob: defectCheck receives publicUrl and id', async () => {
  let captured: any = null
  await completeGeneratedVideoJob({
    id: 77,
    source: { type: 'url', videoUrl: 'https://x/v.mp4' },
    duration: 5,
    storyboardId: 9,
  }, {
    now: () => '2026-05-22T00:00:00Z',
    downloadFile: async () => '/tmp/v.mp4',
    uploadGeneratedAsset: async () => 'https://cdn/v.mp4',
    persistVideoCompletion: async () => {},
    publishStoryboardVideo: async () => {},
    logSuccess: () => {},
    defectCheck: async (input) => { captured = input; return { action: 'publish' } },
  })
  assert.equal(captured.id, 77)
  assert.equal(captured.publicUrl, 'https://cdn/v.mp4')
  assert.equal(captured.localPath, '/tmp/v.mp4')
})
```

- [ ] **Step 3: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：四个新用例全部 fail（`defectCheck` 不在类型里 / 调用未走过）。

- [ ] **Step 4: 实现修改**

打开 `backend/src/services/media/assets/media-completion.ts`：

(a) 在 `CompleteGeneratedVideoJobDeps` 中加可选字段（约 84-90 行附近），并将 `DefectCheckCallback` 类型 export 出来，便于其他模块复用：

```ts
export type DefectCheckCallback = (input: {
  id: number
  publicUrl: string
  localPath: string
  duration: number | null | undefined
  storyboardId: number | null | undefined
}) => Promise<{ action: 'publish' | 'regenerate' }>

export type CompleteGeneratedVideoJobDeps = MaterializeGeneratedVideoDeps & {
  now: () => string
  uploadGeneratedAsset: UploadGeneratedAsset
  persistVideoCompletion: (patch: VideoCompletionPatch) => Promise<void>
  publishStoryboardVideo: (storyboardId: number, patch: StoryboardVideoPatch) => Promise<void>
  logSuccess: (taskName: string, event: string, payload: Record<string, unknown>) => void
  defectCheck?: DefectCheckCallback
}
```

(b) 改 `completeGeneratedVideoJob` 主体（199-228 行）：

```ts
export async function completeGeneratedVideoJob(
  input: CompleteGeneratedVideoJobInput,
  deps: CompleteGeneratedVideoJobDeps,
): Promise<CompletedGeneratedJobResult> {
  const materialized = await materializeGeneratedVideo(input.source, deps)
  const localPath = materialized.localPath
  const publicUrl = await publishGeneratedAsset(localPath, deps.uploadGeneratedAsset)

  if (deps.defectCheck) {
    const decision = await deps.defectCheck({
      id: input.id,
      publicUrl,
      localPath,
      duration: input.duration,
      storyboardId: input.storyboardId,
    })
    if (decision.action === 'regenerate') {
      return { publicUrl, localPath }
    }
  }

  await deps.persistVideoCompletion(buildVideoCompletionPatch({
    publicUrl,
    localPath,
    completedAt: deps.now(),
  }))
  deps.logSuccess('VideoTask', 'downloaded', {
    id: input.id,
    localPath,
    publicUrl,
    storyboardId: input.storyboardId,
    duration: input.duration,
  })

  if (input.storyboardId) {
    await deps.publishStoryboardVideo(
      input.storyboardId,
      buildStoryboardVideoPatch(publicUrl, input.duration, deps.now()),
    )
  }

  return { publicUrl, localPath }
}
```

- [ ] **Step 5: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：全部测试通过（包含 vidu-webhook-completion 等下游测试，因为 deps 是可选）。

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/media/assets/media-completion.ts backend/src/services/__tests__/media-completion.test.ts
git commit -m "feat(media-completion): 在视频完成处加可选 defectCheck 钩子"
```

<!-- TASK-7-END -->

---

## Task 8: 把 attempt/parentId 透传到 enqueue 链路

**Files:**
- Modify: `backend/src/services/media/generation/media-generation-enqueue.ts:18-33,58-82`
- Modify (扩充测试): `backend/src/services/__tests__/media-generation-enqueue.test.ts`

设计要点：
- `VideoGenerationEnqueueParams` 加两个**可选**字段 `defectCheckAttempt?` / `defectCheckParentId?`。
- `buildVideoGenerationEnqueueRecord` 把这两个字段写到记录里（如果存在）。
- 不传时，row 取 schema 默认值（attempt=0、parent=null），其他调用方完全不受影响。

- [ ] **Step 1: 看现有测试**

Run: `cat backend/src/services/__tests__/media-generation-enqueue.test.ts | head -80`
确认风格。

- [ ] **Step 2: 写 RED 测试**

在末尾追加：

```ts
test('buildVideoGenerationEnqueueRecord: forwards defectCheckAttempt and parentId', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: {
      prompt: 'p', model: 'm',
      defectCheckAttempt: 2,
      defectCheckParentId: 41,
    } as any,
    config: { provider: 'ali', model: 'm', baseUrl: 'b', apiKey: 'k' } as any,
    enqueuedAt: '2026-05-22T00:00:00Z',
  })
  assert.equal((record as any).defectCheckAttempt, 2)
  assert.equal((record as any).defectCheckParentId, 41)
})

test('buildVideoGenerationEnqueueRecord: omits defect fields when not provided', () => {
  const record = buildVideoGenerationEnqueueRecord({
    params: { prompt: 'p', model: 'm' },
    config: { provider: 'ali', model: 'm', baseUrl: 'b', apiKey: 'k' } as any,
    enqueuedAt: '2026-05-22T00:00:00Z',
  })
  assert.equal((record as any).defectCheckAttempt, undefined)
  assert.equal((record as any).defectCheckParentId, undefined)
})
```

- [ ] **Step 3: 跑测试，确认 RED**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：上述新增 case fail（字段未输出）。

- [ ] **Step 4: 修改类型与构造函数**

在 `VideoGenerationEnqueueParams` 末尾加两行：

```ts
  defectCheckAttempt?: number
  defectCheckParentId?: number
```

修改 `buildVideoGenerationEnqueueRecord` 返回值，添加：

```ts
    defectCheckAttempt: input.params.defectCheckAttempt,
    defectCheckParentId: input.params.defectCheckParentId,
```

注意：保持其他字段顺序与原样。

- [ ] **Step 5: 跑测试，确认 GREEN**

```bash
cd backend && npm test 2>&1 | tail -30
```

预期：通过。

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/media/generation/media-generation-enqueue.ts backend/src/services/__tests__/media-generation-enqueue.test.ts
git commit -m "feat(enqueue): video 入队 params 透传 defectCheckAttempt/parentId"
```

<!-- TASK-8-END -->

---

## Task 9: 共享 binding 模块 + video-generation 接线

**Files:**
- Create: `backend/src/services/generation/video-defect-check-binding.ts`
- Modify: `backend/src/services/generation/video-generation.ts:1-43,249-270`

设计要点：
- 把"读 vision config + 读视频行 + 调 runDefectCheck + 写 result + 触发重生成"全部封装在一个 `buildDefectCheckCallback(enqueueGenerate)` 工厂内，让 video-generation 与 vidu webhook 都能复用同一份逻辑（DRY）。
- Callback 类型直接复用 `media-completion.ts` 导出的 `DefectCheckCallback`，避免重复声明。
- 此处不写新单测（依赖 db + fetch 的胶水代码）；改完后跑全套测试 + 手动冒烟。

- [ ] **Step 1: 创建 binding 模块**

```ts
// backend/src/services/generation/video-defect-check-binding.ts
import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { analyzeVideoForDefects } from '../adapters/qwen-vision.js'
import { DEFECT_CHECK_PROMPT } from '../../utils/defect-check-prompt.js'
import type { DefectCheckCallback } from '../media/assets/media-completion.js'
import {
  clampMaxAttempts,
  runDefectCheck,
  type DefectVisionConfig,
} from './video-defect-check.js'
import {
  enqueueDefectRegeneration,
  type RegenEnqueueParams,
} from './video-regeneration.js'

async function loadActiveVisionConfig(): Promise<DefectVisionConfig | null> {
  const rows = await db
    .select()
    .from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'vision'))
    .all()
  const active = rows.find((r) => r.isActive !== false)
  if (!active || !active.baseUrl || !active.apiKey) return null
  let parsedSettings: Record<string, unknown> = {}
  if (active.settings) {
    try {
      const parsed = JSON.parse(active.settings)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedSettings = parsed as Record<string, unknown>
      }
    } catch {}
  }
  let model = ''
  if (active.model) {
    try {
      const parsed = JSON.parse(active.model)
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') model = parsed[0]
    } catch {
      if (typeof active.model === 'string') model = active.model
    }
  }
  return {
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: model || 'qwen3.6-plus',
    enabled: parsedSettings.enabled === true,
    maxAttempts: clampMaxAttempts(parsedSettings.maxAttempts, 2),
  }
}

async function loadVideoGenerationRow(id: number) {
  const [row] = await db
    .select()
    .from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id))
    .all()
  return row ?? null
}

export type RegenEnqueueFn = (params: RegenEnqueueParams) => Promise<number>

export function buildDefectCheckCallback(enqueueGenerate: RegenEnqueueFn): DefectCheckCallback {
  return async ({ id: rowId, publicUrl }) => {
    const row = await loadVideoGenerationRow(rowId)
    if (!row) return { action: 'publish' }
    const visionConfig = await loadActiveVisionConfig()
    const attemptNumber = typeof row.defectCheckAttempt === 'number' ? row.defectCheckAttempt : 0

    logTaskStart('VideoDefectCheck', 'start', {
      id: rowId,
      attemptNumber,
      hasConfig: !!visionConfig,
    })

    const decision = await runDefectCheck({
      videoUrl: publicUrl,
      attemptNumber,
      visionConfig,
      prompt: DEFECT_CHECK_PROMPT,
      analyze: analyzeVideoForDefects,
    })

    logTaskProgress('VideoDefectCheck', 'decision', {
      id: rowId,
      action: decision.action,
      verdict: decision.verdict,
      model: decision.model,
      error: decision.error,
    })

    await db
      .update(schema.videoGenerations)
      .set({ defectCheckResult: JSON.stringify(decision), updatedAt: now() })
      .where(eq(schema.videoGenerations.id, rowId))
      .run()

    if (decision.action === 'regenerate') {
      await db
        .update(schema.videoGenerations)
        .set({
          status: 'failed_defect',
          errorMsg: '检测判定穿帮，已发起重生成',
          updatedAt: now(),
        })
        .where(eq(schema.videoGenerations.id, rowId))
        .run()
      const newId = await enqueueDefectRegeneration({
        originalRecord: {
          id: row.id,
          prompt: row.prompt,
          model: row.model,
          configId: undefined,
          storyboardId: row.storyboardId,
          imageUrl: row.imageUrl,
          firstFrameUrl: row.firstFrameUrl,
          lastFrameUrl: row.lastFrameUrl,
          duration: row.duration,
          fps: row.fps,
          resolution: row.resolution,
          aspectRatio: row.aspectRatio,
          defectCheckAttempt: row.defectCheckAttempt,
        },
        missingActions: decision.missingActions,
        enqueue: enqueueGenerate,
      })
      logTaskSuccess('VideoDefectCheck', 'regenerate-enqueued', {
        id: rowId,
        newId,
        parentId: rowId,
      })
    }

    return { action: decision.action }
  }
}
```

- [ ] **Step 2: 在 video-generation.ts 顶部加 import**

替换原 import 块加一行：

```ts
import { buildDefectCheckCallback } from './video-defect-check-binding.js'
```

- [ ] **Step 3: 改写 `completeGeneratedVideo`**

```ts
async function completeGeneratedVideo(
  id: number,
  source: GeneratedVideoSource,
  duration: number | null | undefined,
  storyboardId?: number | null,
) {
  const persistence = createVideoGenerationDbPersistence(id)

  await completeGeneratedVideoJob({
    id,
    source,
    duration,
    storyboardId,
  }, {
    now,
    downloadFile,
    uploadGeneratedAsset: uploadStaticAssetToCos,
    persistVideoCompletion: persistence.persistVideoCompletion,
    publishStoryboardVideo: persistence.publishStoryboardVideo,
    logSuccess: logTaskSuccess,
    defectCheck: buildDefectCheckCallback(async (params) => {
      return await generateVideo({
        storyboardId: params.storyboardId ?? undefined,
        prompt: params.prompt,
        model: params.model ?? undefined,
        imageUrl: params.imageUrl ?? undefined,
        firstFrameUrl: params.firstFrameUrl ?? undefined,
        lastFrameUrl: params.lastFrameUrl ?? undefined,
        duration: params.duration ?? undefined,
        aspectRatio: params.aspectRatio ?? undefined,
        configId: undefined,
        defectCheckAttempt: params.defectCheckAttempt,
        defectCheckParentId: params.defectCheckParentId,
      })
    }),
  })
}
```

注意：`generateVideo` 内部基于 `getActiveConfig('video')` 取活跃 video config，重生成时 configId 用 undefined（旧行 schema 未存 configId 列，无法回填）。

- [ ] **Step 4: typecheck**

```bash
cd backend && npm run typecheck
```

预期：无错误。

- [ ] **Step 5: 跑全套后端测试**

```bash
cd backend && npm test 2>&1 | tail -40
```

预期：所有测试 pass。

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/generation/video-defect-check-binding.ts backend/src/services/generation/video-generation.ts
git commit -m "feat(video-generation): 视频完成后注入 vision 穿帮检测与自动重生成"
```

<!-- TASK-9-END -->

---

## Task 10: vidu webhook 也注入 defectCheck

**Files:**
- Modify: `backend/src/routes/webhooks/webhooks.ts`（找 `completeViduWebhookVideo` 调用点）

设计要点：
- `CompleteViduWebhookVideoDeps = CompleteGeneratedVideoJobDeps`，可选 `defectCheck` 字段已自动继承，无需改类型。
- 复用 Task 9 的 `buildDefectCheckCallback`，二行 import + 一段同样的 enqueue 函数即可。

- [ ] **Step 1: 看调用点**

```bash
grep -n "completeViduWebhookVideo" backend/src/routes/webhooks/webhooks.ts
```

- [ ] **Step 2: 在 webhooks.ts 顶部加 import**

```ts
import { buildDefectCheckCallback } from '../../services/generation/video-defect-check-binding.js'
import { generateVideo } from '../../services/generation/video-generation.js'
```

（如果 generateVideo 已 import 则不重复加。）

- [ ] **Step 3: 在 `completeViduWebhookVideo` 调用处的 deps 末尾追加 defectCheck**

```ts
defectCheck: buildDefectCheckCallback(async (params) => {
  return await generateVideo({
    storyboardId: params.storyboardId ?? undefined,
    prompt: params.prompt,
    model: params.model ?? undefined,
    imageUrl: params.imageUrl ?? undefined,
    firstFrameUrl: params.firstFrameUrl ?? undefined,
    lastFrameUrl: params.lastFrameUrl ?? undefined,
    duration: params.duration ?? undefined,
    aspectRatio: params.aspectRatio ?? undefined,
    configId: undefined,
    defectCheckAttempt: params.defectCheckAttempt,
    defectCheckParentId: params.defectCheckParentId,
  })
}),
```

- [ ] **Step 4: 跑全套测试**

```bash
cd backend && npm test 2>&1 | tail -40
```

预期：通过。`vidu-webhook-completion.test.ts` 不强制需要新增 case（其 deps 是注入的，对 defectCheck 透明）。

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/webhooks/webhooks.ts
git commit -m "feat(defect-check): vidu webhook 路径也接入穿帮检测回调"
```

<!-- TASK-10-END -->

---

## Task 11: aiConfigs probe 加 vision 分支

**Files:**
- Modify: `backend/src/routes/configs/aiConfigs.ts:65-140`

- [ ] **Step 1: 在 `buildProbe` 加 vision 路径**

在 `if (p === 'ali')` 分支内增强：

```ts
  if (p === 'ali') {
    if (serviceType === 'vision') {
      return {
        method: 'POST',
        url: joinProviderUrl(baseUrl, '/compatible-mode/v1', '/chat/completions'),
        headers: bearerHeaders(apiKey, true),
        body: { model: m || 'qwen3.6-plus', messages: [{ role: 'user', content: 'ping' }] },
      }
    }
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', serviceType === 'video'
        ? '/services/aigc/video-generation/video-synthesis'
        : '/services/aigc/image-generation/generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }
```

- [ ] **Step 2: typecheck**

```bash
cd backend && npm run typecheck
```

预期：无错误。

- [ ] **Step 3: 跑测试**

```bash
cd backend && npm test 2>&1 | tail -10
```

预期：通过。

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/configs/aiConfigs.ts
git commit -m "feat(ai-config): vision 服务的 ali probe 走 OpenAI 兼容路径"
```

<!-- TASK-11-END -->

---

## Task 12: 前端 SettingsView 加 'vision' 类型

**Files:**
- Modify: `frontend/src/pages/SettingsView.vue` (`serviceTypes` / `serviceMeta` / `providerPresets` / `endpointPrefixes` / 表单)

设计要点：
- 复用现有 type-driven 渲染。新增一项后所有 CRUD/test 流程自动覆盖。
- 仅在 `serviceType === 'vision'` 时渲染开关与最大次数字段。

- [ ] **Step 1: 摸一下文件结构**

```bash
grep -n "serviceTypes\|serviceMeta\|providerPresets\|endpointPrefixes" frontend/src/pages/SettingsView.vue
```

- [ ] **Step 2: 改 4 处常量 + 加 2 个表单字段**

(a) `serviceTypes`：

```ts
const serviceTypes = ['text', 'image', 'video', 'vision'] as const
```

(b) `serviceMeta`：

```ts
const serviceMeta = {
  text:   { label: '文本生成', desc: '...' },     // 保留原样
  image:  { label: '图像生成', desc: '...' },     // 保留原样
  video:  { label: '视频生成', desc: '...' },     // 保留原样
  vision: { label: '视频理解', desc: '用于视频穿帮检测，默认阿里百炼 qwen3.6-plus' },
}
```

(c) `providerPresets.ali` 加 vision 段（保持原对象结构；如果原来是 `{ image: {...}, video: {...} }`，加入 `vision: { baseUrl: 'https://dashscope.aliyuncs.com', models: ['qwen3.6-plus'] }`）。

(d) `endpointPrefixes`：让 vision 走 `/compatible-mode/v1`：

```ts
const endpointPrefixes = {
  ali: { /* 原值保留 */ vision: '/compatible-mode/v1' },
}
```

如果 `endpointPrefixes` 当前是单层 `{ ali: '/api/v1' }`，需要改成"按服务类型拆 + 默认值兜底"或在使用处 `serviceType === 'vision' ? '/compatible-mode/v1' : '/api/v1'`，**采用最小改动方案**：在使用 `endpointPrefixes[provider]` 的地方加一行三元判断即可，不要重构成嵌套对象。

(e) 表单字段：找到当前根据 `serviceType` 渲染字段的 v-if 块，**末尾**加：

```vue
<div v-if="form.service_type === 'vision'" class="form-row">
  <label class="form-label">启用穿帮检测</label>
  <input type="checkbox" v-model="form.settings.enabled" />
</div>
<div v-if="form.service_type === 'vision'" class="form-row">
  <label class="form-label">最大生成尝试次数</label>
  <input type="number" min="1" max="5" v-model.number="form.settings.maxAttempts" />
  <small>含首次。默认 2，即首次未通过自动重生成 1 次。</small>
</div>
```

确保 `form.settings` 在初始化时是个对象（`{ enabled: false, maxAttempts: 2 }`），如果当前 form 默认 settings 不是对象，需要在初始化处补：

```ts
function emptyForm() {
  return {
    service_type: '',
    provider: '',
    name: '',
    base_url: '',
    api_key: '',
    model: [],
    settings: { enabled: false, maxAttempts: 2 } as Record<string, unknown>,
    priority: 0,
  }
}
```

并在打开"编辑"对话框时把后端返回的 `settings` 对象合并进 form。

- [ ] **Step 3: 起前端 + 后端，手动验证**

后端：
```bash
cd backend && npm run dev
```
前端：
```bash
cd frontend && npm run dev
```

打开 `http://localhost:3013` → 设置 → 看到"视频理解"分类，新增一条 ali / qwen3.6-plus / API key，勾选启用、最大次数 2。

- [ ] **Step 4: 前端 layout 测试（项目脚本）**

```bash
cd frontend && npm run test:layout
```

预期：通过（不被本次新增字段影响）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SettingsView.vue
git commit -m "feat(settings): 设置页加视频理解配置 + 启用开关与最大次数"
```

<!-- TASK-12-END -->

---

## Task 13: 端到端冒烟（手动验证）

**Files:** 无文件改动

- [ ] **Step 1: 在 UI 上配置 vision config**

按 Task 12 配置一条 ali / qwen3.6-plus，启用开关勾选，最大次数 2。

- [ ] **Step 2: 触发一次正常视频生成**

走任意分镜的"生成视频"，关注 backend 日志：应该看到
- `VideoDefectCheck:start` { id, attemptNumber:0, hasConfig:true }
- `VideoDefectCheck:decision` { action:'publish', verdict:..., model:'qwen3.6-plus' }

视频应当正常出现在前端分镜卡。

- [ ] **Step 3: 关闭开关再生成一次**

把 settings.enabled 改 false（或删掉 vision config），再生成视频。

后端日志应见 `decision: { action:'publish', verdict:'skipped', error:'disabled'|'no_vision_config' }`，行为与未上线本期完全一致。

- [ ] **Step 4: 验证无 vision config 时旧链路完全等价**

DB 中删除 vision 行，跑一次生成，断言 `videoGenerations` 行的 `defectCheckResult` 仍被写入（verdict='skipped', error='no_vision_config'）。

- [ ] **Step 5: 回归 vidu webhook 路径（如果环境支持）**

切换 video config 到 vidu provider 触发一次（或直接在数据库找一条 vidu 历史 row，调用 webhook 模拟）。日志同样应见 `VideoDefectCheck` 链路。

无需 commit。

<!-- TASK-13-END -->

---

## 自查清单（实施前最后一遍过）

- [ ] schema 三列名与代码、JSON 字段名完全一致：`defectCheckAttempt` / `defectCheckParentId` / `defectCheckResult`
- [ ] serviceType 字面量统一 `'vision'`，无大小写漂移
- [ ] DEFECT_CHECK_PROMPT 只在 `defect-check-prompt.ts` 一处定义
- [ ] 所有被检测路径（轮询 + vidu webhook）都经过同一份 `buildDefectCheckCallback`
- [ ] 关闭开关 / 无配置 / 检测异常三种情况都 fall-through 为 publish
- [ ] 重生成时 prompt 拼接幂等（不会逐次叠加多个【上次生成】块）
- [ ] backend/package.json 的 `test` 脚本里追加了三个新测试文件





