# 视频生成穿帮自动检测与重生成 — 设计文档

- 日期：2026-05-22
- 作者：Claude Code 协作设计
- 范围：在视频生成成功后接入视觉理解模型（默认阿里百炼 qwen3.6-plus），对结果做"穿帮检测"，若判定为穿帮则自动重生成；上限可配，过程可观测，可一键关闭。

## 1. 背景与目标

当前视频生成流程在 `processVideoGeneration` → `pollVideoTask` / vidu webhook → `completeGeneratedVideoJob` 这条链路上以 fire-and-forget 异步方式跑，所有 provider 的成功路径都汇聚在 `completeGeneratedVideoJob`。链路目前没有任何"内容质量"层面的校验，模型偶发的"动作链断裂"（即用户口中的"穿帮"，例如剑从入鞘直接跳到出鞘但中间没有拔剑动作）会被静默放行。

本期目标是在不改动既有 provider 适配层的前提下：

1. 在设置中允许配置一个"视频理解模型"（URL + key + model），默认阿里百炼。
2. 视频生成成功后，将视频 URL 交给该理解模型用一段固定的硬性规则 prompt 跑一遍。
3. 如果模型判定有穿帮，自动用"原 prompt + 缺失动作提示"重新生成，最多 N 次（用户在设置里配）。
4. 如果模型未判定为穿帮、检测异常、或重试次数耗尽，则把视频按既有逻辑发布给前端，并在记录里保留检测结果以便前端日后展示。

非目标：

- 不改 provider 适配层（ali / volcengine / minimax / vidu 视频生成路径不动）。
- 不引入任务队列、不引入新数据库（继续 MySQL + 现有 `videoGenerations` 表）。
- 不在本期前端实现"疑似穿帮"角标，但数据字段会预留好。

## 2. 用户故事

- 作为用户，我在"设置"里新增一类 AI 服务"视频理解"，填写 URL（默认 `https://dashscope.aliyuncs.com`）、API Key、模型名（默认 `qwen3.6-plus`），再开启"启用穿帮检测"开关、设置最大重试次数（默认 2）。
- 之后每次生成视频，系统在拿到视频 URL 后会先让视觉模型按硬性规则跑一遍。
- 若判定为穿帮，系统自动重生成；若仍穿帮且达到上限，把当前视频和检测结果一并落库后照常返回给我。
- 如果我没配视频理解模型、或关闭了开关，所有视频生成行为与现在完全一致。

## 3. 总体架构

### 3.1 注入点

唯一注入点：`backend/src/services/media/assets/media-completion.ts` 的 `completeGeneratedVideoJob`。原因：

- 轮询型 provider（ali / volcengine / minimax）和 webhook 型 provider（vidu）的成功完成都会汇入这里。
- 在 `materializeGeneratedVideo`（已下载 + 上传 COS，拿到 publishable URL）之后、`persistVideoCompletion`（写入 `storyboards.videoUrl`）之前注入，可保证：
  - 检测时已有可访问的最终 URL；
  - 检测失败决定重生成时，storyboards 还未被更新，前端不会"先看到再被替换"。

### 3.2 数据流

术语：

- `defectCheckAttempt`：当前 `videoGenerations` 行是这条检测链上的第几次尝试，从 `0` 开始。首次生成 = 0。
- `maxAttempts`：用户在设置里配的总尝试次数（含首次），默认 2，含义"最多生成 2 次"，即允许 1 次重生成。
- "是否还能重生成" 的判定：`defectCheckAttempt + 1 < maxAttempts`。

```
... materialize 拿到 publishableUrl ...
   │
   ▼
[runDefectCheckIfEnabled]
   ├─ 无 vision config                     → { action: 'publish', verdict: 'skipped' }
   ├─ 开关关                                 → { action: 'publish', verdict: 'skipped' }
   ├─ 调 vision adapter（qwen3.6-plus）
   │     ├─ 网络/4xx/解析异常             → { action: 'publish', verdict: 'unknown', error }
   │     ├─ verdict='complete'             → { action: 'publish', verdict: 'complete' }
   │     └─ verdict='defect'
   │            ├─ attempt+1 < max          → { action: 'regenerate', verdict: 'defect', missingActions }
   │            └─ attempt+1 ≥ max          → { action: 'publish',    verdict: 'defect_exhausted', missingActions }
   ▼
case action of
  publish    → 写 defectCheckResult → persist → done
  regenerate → 写 defectCheckResult（旧行 status='failed_defect'）
              → enqueueDefectRegeneration（创建新行，defectCheckAttempt+1，defectCheckParentId 链回旧行）
              → 不更新 storyboards.videoUrl
              → done
```

注：当 `defectCheckAttempt + 1 ≥ maxAttempts` 时，协调器**仍然调用 vision adapter** 跑一遍检测，仅在"判定为穿帮"的分支才把 `action` 改回 `publish` 并把 verdict 标为 `defect_exhausted`。这样能保留"最后一次的检测结果"在 `defectCheckResult` 里，便于 DB 排查和未来前端展示。判定为 `complete` 或 `unknown` 时分支与未到上限时一致。

### 3.3 关键不变量

- 任何分支下 `defectCheckResult` 都会被写到当前 `videoGenerations` 行（包括"跳过"也写一条 `verdict:'skipped'`），便于 DB 排查。
- 重生成永远基于"原 prompt + 缺失动作提示"，不会改 provider、不会改其他参数。
- 检测被跳过时一定有 `task-logger.info` 一条说明原因，不静默放行。
- 全局开关关闭 = 整条链路完全旁路，与未上线本期前的行为完全一致。

## 4. 组件清单

### 4.1 新增后端文件

#### `backend/src/utils/defect-check-prompt.ts`

导出 prompt 常量。本期硬编码以下文本（用户提供的硬性规则版本，末尾追加固定标记输出要求）：

```
【硬性规则】
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
请在输出的最后一行单独输出固定标记之一（不带任何其他字符）：
[结论:完整]
或
[结论:穿帮]
若判定为[结论:穿帮]，请在倒数第二行用以下格式列出所有缺失的关键动作：
[缺失动作]: 动作1 | 动作2 | 动作3
```

#### `backend/src/services/adapters/qwen-vision.ts`

视觉理解 adapter。窄接口：

```ts
export interface VisionAnalyzeParams {
  videoUrl: string;
  prompt: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface VisionAnalyzeResult {
  rawText: string;
  verdict: 'complete' | 'defect' | 'unknown';
  missingActions: string[];
}

export async function analyzeVideoForDefects(
  params: VisionAnalyzeParams
): Promise<VisionAnalyzeResult>;
```

实现要点：

- 走阿里百炼 OpenAI 兼容路径：`POST {baseUrl}/compatible-mode/v1/chat/completions`
- Body：`{ model, messages: [{ role:'user', content:[{type:'video_url', video_url:{url:videoUrl}}, {type:'text', text:prompt}] }] }`
- 复用 `backend/src/services/media/provider/media-provider-transport.ts` 的 `sendProviderJsonRequest` + `isProviderApiError`，错误归一化与现有视频/图片 adapter 一致。
- verdict 解析：
  - 取 `choices[0].message.content` 拼为 rawText（兼容字符串或 part 数组）。
  - 在 rawText 末尾按行倒查找第一行非空文本，正则匹配 `^\s*\[结论:(完整|穿帮)\]\s*$`，命中映射到 `complete` / `defect`，否则 `unknown`。
  - 当 verdict 为 `defect` 时，倒查找 `^\s*\[缺失动作\]:\s*(.+)$`，按 `|` 分割并 trim，得到 `missingActions`；找不到则 `[]`。
- 不在 adapter 内做日志（由协调器统一打日志，符合"adapter 只做 HTTP + 解析"的窄接口）。

#### `backend/src/services/generation/video-defect-check.ts`

协调器。窄接口：

```ts
export interface DefectCheckInput {
  generationRecord: VideoGenerationRecord; // 包含 attempt 等
  publishableUrl: string;
}

export interface DefectCheckDecision {
  action: 'publish' | 'regenerate';
  verdict: 'complete' | 'defect' | 'defect_exhausted' | 'unknown' | 'skipped';
  missingActions?: string[];
  rawText?: string;
  error?: string;
  model?: string;
  attemptedAt: string; // ISO
}

export async function runDefectCheckIfEnabled(
  input: DefectCheckInput
): Promise<DefectCheckDecision>;
```

职责：

- 读取活跃 `serviceType='vision'` 的 `aiServiceConfigs` 行；缺失 → 返回 `{ action:'publish', verdict:'skipped' }`，`error:'no_vision_config'`。
- 解析其 `settings` JSON：`enabled: boolean`、`maxAttempts: int`（合法范围 1–5，越界则 clamp，缺省 2）；`enabled !== true` → 返回 `{ action:'publish', verdict:'skipped' }`，`error:'disabled'`。
- 调 adapter；任何抛出（网络、4xx、解析异常）一律 catch 后返回 `{ action:'publish', verdict:'unknown' }`，并把异常摘要写到 `error` 字段。
- adapter 成功后：
  - verdict='complete' → `{ action:'publish', verdict:'complete' }`。
  - verdict='defect'：
    - `defectCheckAttempt + 1 < maxAttempts` → `{ action:'regenerate', verdict:'defect', missingActions }`。
    - 否则 → `{ action:'publish', verdict:'defect_exhausted', missingActions }`。
  - verdict='unknown' → `{ action:'publish', verdict:'unknown' }`。
- 不读写 DB（写 `defectCheckResult` 由调用方完成，便于测试）；不发起重生成。

#### `backend/src/services/generation/video-regeneration.ts`

重生成入口。窄接口：

```ts
export interface DefectRegenerationInput {
  originalRecord: VideoGenerationRecord;
  missingActions: string[];
}

export interface DefectRegenerationResult {
  newGenerationId: number;
}

export async function enqueueDefectRegeneration(
  input: DefectRegenerationInput
): Promise<DefectRegenerationResult>;
```

职责：

- 从 `originalRecord` 重建 `VideoGenerationEnqueueParams`（`prompt`、`model`、`imageUrl`、`firstFrameUrl`、`configId` 等列已存在）。
- 构造新的 prompt：

  ```
  {原 prompt}

  【上次生成存在动作链断裂，请确保以下动作被完整拍到】
  - {missingAction 1}
  - {missingAction 2}
  ...
  ```

  注意：用户提供的"原 prompt"已经包含动作描述，本期仅在末尾追加补充提示，不删改原文。`missingActions` 为空时只写一句 "上次生成动作链不完整，请保证所有关键动作被完整拍到"。

- 调用现有 `generateVideo(params)`，新行携带 `defectCheckAttempt = old + 1`、`defectCheckParentId = old.id`。
- 不更新 `storyboards.videoUrl`、不修改旧行（旧行的 status 由调用方在 `completeGeneratedVideoJob` 内设为 `'failed_defect'`）。

### 4.2 既有文件改动

#### `backend/src/db/schema.ts`

`videoGenerations` 表新增三列：

```ts
defectCheckAttempt: int('defect_check_attempt').default(0).notNull(),
defectCheckParentId: bigint('defect_check_parent_id', { mode: 'number' }), // nullable
defectCheckResult: json('defect_check_result'),                              // nullable
```

`defectCheckResult` 存 `DefectCheckDecision` 完整对象，便于 DB 排查。

#### `backend/src/routes/policies/ai-config-route-policy.ts`

```ts
export const VALID_AI_SERVICE_TYPES = new Set(['text', 'image', 'video', 'vision']);
```

#### `backend/src/routes/configs/aiConfigs.ts`

`buildProbe` 增加 `serviceType==='vision'` 分支：构造一次极简 chat completions 请求（model 用 user 选的、messages 一句 "ping"），用于"测试"按钮。失败由现有错误处理统一返回。

#### `backend/src/services/media/assets/media-completion.ts` 的 `completeGeneratedVideoJob`

增加约 10 行：

```ts
const decision = await runDefectCheckIfEnabled({
  generationRecord: record,
  publishableUrl,
});

await db.update(videoGenerations)
  .set({ defectCheckResult: decision })
  .where(eq(videoGenerations.id, record.id));

if (decision.action === 'regenerate') {
  await db.update(videoGenerations)
    .set({ status: 'failed_defect', errorMsg: '检测判定穿帮，已发起重生成' })
    .where(eq(videoGenerations.id, record.id));
  await enqueueDefectRegeneration({
    originalRecord: record,
    missingActions: decision.missingActions ?? [],
  });
  return; // 不 persist
}
// 落库 + persist 走原逻辑
```

### 4.3 前端改动

#### `frontend/src/pages/SettingsView.vue`

- `serviceTypes` 数组追加 `'vision'`。
- `serviceMeta.vision = { label: '视频理解', desc: '用于视频穿帮检测，默认阿里百炼 qwen3.6-plus' }`。
- `providerPresets.ali` 增加 vision 段：`{ baseUrl: 'https://dashscope.aliyuncs.com', models: ['qwen3.6-plus'] }`。
- `endpointPrefixes` vision 用 `/compatible-mode/v1`。
- 当 `serviceType === 'vision'` 时，弹窗里多渲染两个字段：
  - `enabled`：Switch，绑定 `form.settings.enabled`（默认 false）
  - `maxAttempts`：number input，1–5，绑定 `form.settings.maxAttempts`（默认 2）
- 提交时把这两个字段塞进 `settings` JSON 一并提交。

#### 不变项

- `frontend/src/composables/useApi.ts` 的 `aiConfigAPI` 不需要改（serviceType 是字符串）。
- 视频生成相关 composable / 组件不改（检测对前端透明）。

## 5. 错误处理矩阵

| # | 情况 | action | verdict | error 字段 | 是否写 defectCheckResult | 日志级别 |
|---|---|---|---|---|---|---|
| 1 | 全局开关关 | publish | skipped | `disabled` | 是 | info |
| 2 | 无 vision 配置 | publish | skipped | `no_vision_config` | 是 | info |
| 3 | qwen 网络/超时 | publish | unknown | `network` / `timeout` | 是 | warn |
| 4 | qwen 4xx（key/欠费） | publish | unknown | `auth` / `quota` / `http_4xx` | 是 | warn |
| 5 | qwen 200 但无标记 | publish | unknown | `unparseable` | 是 | warn |
| 6 | qwen 判定 [结论:完整] | publish | complete | — | 是 | info |
| 7 | qwen 判定 [结论:穿帮] 且 attempt+1 < max | regenerate | defect | — | 是（旧行） | info |
| 8 | qwen 判定 [结论:穿帮] 且 attempt+1 ≥ max | publish | defect_exhausted | — | 是 | warn |

任何分支结束后调用方都会执行原有 persist 流程（除 regenerate 外），不会出现"既不重生成也不发布"的悬挂状态。

## 6. 测试计划

后端走现有 `npm test`（build + 测试套件）。本期新增三个测试文件：

- **`qwen-vision.test.ts`**：mock HTTP，覆盖三种 verdict 解析（完整 / 穿帮 + 缺失动作 / 无标记）+ 网络异常 + 4xx。
- **`video-defect-check.test.ts`**：表驱动测错误处理矩阵 8 行，每行断言 `action` 与 `verdict`；mock vision config 与 adapter。
- **`video-regeneration.test.ts`**：断言 prompt 拼接正确（含 missingActions 为空时的回退文案）、`defectCheckAttempt` 正确递增、`defectCheckParentId` 正确链接、调用 `generateVideo` 时参数与原行一致。

不在本期范围：

- 真实 qwen3.6-plus 联调（手动验证）。
- 真实视频文件下载/上传集成测试（已有路径，非本期改动）。

## 7. 可观测性

统一 taskName `'VideoDefectCheck'`，每一步通过现有 `backend/src/utils/task-logger.ts` 输出：

- start：`{ generationId, attempt, max }`
- success / warn：`{ verdict, model, durationMs }`
- payload：写入完整 rawText 截断（最多 2KB）方便排查
- 重生成：`{ parentId, newId, attempt }`

DB 侧通过 `defectCheckResult` 字段 + `defectCheckParentId` 自连接即可还原任意视频的检测链路。

## 8. 回滚

- 把数据库里 vision config 的 `settings.enabled` 改为 `false`，整条链路立刻旁路。
- 删除 vision config 行同样可立即旁路。
- 代码层无须回滚即可关闭功能。

## 9. 范围外（明确不做）

- 视频生成失败（非穿帮）的自动重试：维持现状，由 provider 错误流程处理。
- 多模态 prompt 优化 / 自动调参：本期 prompt 硬编码，后续如需迭代再单独成项。
- 前端"疑似穿帮"角标：数据已落 `defectCheckResult`，UI 留待后续。
- 多视频理解 provider：本期只写 qwen 一个 adapter，serviceType=vision 但 provider 字段允许扩展，后续按需加 adapter。
- 系统级配置表：开关与重试次数复用 vision config 的 `settings` JSON，不引入新表。

## 10. 命名与一致性约定

- 数据库列、TS 类型、前端字段三处同名：`defectCheckAttempt` / `defectCheckParentId` / `defectCheckResult`。
- serviceType 字面量统一 `'vision'`。
- 所有日志 taskName 统一 `'VideoDefectCheck'`。
- prompt 常量统一从 `backend/src/utils/defect-check-prompt.ts` 导入，不内联到任何调用处。
