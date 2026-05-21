# 视频拼接过渡优化 - 方案 A 设计

> 关联调研文档：`docs/video-transition-plan.md`
>
> **实施状态：已落地（2026-05-21）**。本节内容含最终实施的偏差。

## 选型决策：留在 xfade，暂不引入 editly

调研文档列了方案 B（editly），最初定位是中期重构候选。落地过程中重新评估，**决定继续留在原生 xfade 路线、扩充转场白名单，不引入 editly / gl-transitions**。

考量：

| 维度 | 扩 xfade 白名单（当前选择） | editly / gl-transitions |
|------|------------------------------|---------------------------|
| 依赖 | 零新增 | `node-canvas` + GL 系列原生库，Windows / SCF 装机有风险 |
| 转场覆盖 | xfade 内置 50+ 种 | gl-transitions 30+ 种 |
| 短剧 0.4–0.6s 场景差异 | 视觉差异在用户端基本不可辨 | 同上 |
| 架构改动 | 后端常量 + 前端 label 字典，半小时 | 重写整个 merge 编排层 |
| 可逆性 | 高 | 锁死方向 |

**结论**：editly 真正独特的是它包装的 gl-transitions（旋转、扭曲、像素溶解等 WebGL shader 转场），但在 0.4–0.6s 的短剧节奏里，这些"炫酷感"与 xfade 的 slide/wipe/circle 类基本看不出差异；为可能用不上的视觉差异引入重依赖不划算。

**何时重新评估 editly**：若产品决定把"花哨转场"作为差异化卖点（如抖音页面级翻转、像素溶解作为视觉标识），届时再做 POC 并验证 SCF 上的 GL 依赖可用性。

## 实施总览

| 项 | 状态 | 说明 |
|----|------|------|
| 后端 xfade 策略链 | ✅ 已实现 | `[xfade → transcode → copy]`，启动前探测 ffmpeg 是否支持 xfade |
| 集级过渡配置 | ✅ 已实现 | `episodes.transition_type` / `transition_duration_ms` |
| 合并任务快照 | ✅ 已实现 | `video_merges` 表同名两列写入 |
| 过渡类型白名单 | ✅ 已实现 | 10 种常用 xfade 转场，分组（淡变 / 滑动 / 圆形 / 擦除 / 像素）见下方"过渡类型白名单" |
| 前端集页面弹窗 | ✅ 已实现 | 合并按钮旁齿轮 → 类型 + 0–1000ms 滑块 |
| `anullsrc` 静音兜底 | ❌ 已撤销 | 决策：所有分镜自带音轨，不再做缺音轨补静音 |
| 接缝级降级 | ✅ 已实现 | 接缝有效时长 < 50ms 自动降级为该接缝硬切 |
| **流参数归一化** | ✅ 新增 | 在 xfade 前对每路视频/音频做 `fps=30,format=yuv420p,setpts=PTS-STARTPTS` 与 `aformat=48k/stereo,asetpts=PTS-STARTPTS`，否则不同分镜的 fps/timebase 微差会让 xfade 报 "Invalid argument" |
| **ffmpeg xfade 能力探测** | ✅ 新增 | 首次合并时缓存 `ffmpeg -filters` 结果。老版（< 4.3，无 xfade）直接跳过 xfade 走 transcode，日志事件 `ffmpeg-xfade-unsupported` |
| **根 `.env` 注入 process.env** | ✅ 新增 | 项目原先只手动 parse `.env` 用于 DB 配置；新建 `backend/src/utils/project-env.ts` 在 ffmpeg / db 启动时统一注入，确保 `FFMPEG_PATH` 等被全模块读到 |

## 运行环境备注

- **本地开发**：默认 bundle 是 `@ffmpeg-installer/win32-x64`（2018 年版，无 xfade）。会被探测命中并跳过 xfade。如需本地验证淡入淡出效果，在根 `.env` 加 `FFMPEG_PATH` / `FFPROBE_PATH` 指向系统新版（≥ 4.3）即可。
- **生产 SCF**：层挂载的是 2026 年 2 月下载的 ffmpeg，xfade 正常生效。

## 目标

替换现有 FFmpeg concat demuxer 的硬切拼接，在 N 段分镜之间叠加 `xfade`（视频淡入淡出）+ `acrossfade`（音频交叉淡化），消除视觉跳变与音频爆音。集级可配置过渡类型与时长，可选关闭。

## 范围

- 后端 merge 服务：新增 xfade 策略，与现有 copy / transcode 形成 `[xfade, transcode, copy]` 降级链。
- 数据库：`episodes` 与 `merges` 表各新增 2 列（类型 + 时长）。
- API：暴露集级过渡配置的读写。
- 前端：集页面"合并视频"按钮旁新增设置弹窗。

非范围：editly 接入、字幕、BGM、Ken Burns、过渡音效。

## 数据模型

### episodes 新增列

| 列 | 类型 | 默认 | 说明 |
|----|------|------|------|
| `transition_type` | `varchar(32)` nullable | NULL | 集级过渡类型；NULL 走全局默认 |
| `transition_duration_ms` | `int` nullable | NULL | 集级过渡时长（毫秒）；NULL 走全局默认；`0` 表示关闭 |

### merges 新增列

同样两列，作为本次合并任务的快照（便于追溯）。

### 全局默认

- 类型：`fade`
- 时长：`500` ms

定义在后端常量中，不进数据库。

## 过渡类型白名单

10 种常用 xfade 转场，按视觉风格分组（前端弹窗按分组渲染）：

| 分组 | 类型值 | 中文标签 | 说明 |
|------|--------|---------|------|
| 淡变 | `fade` | 淡入淡出 | 默认，最稳妥 |
| 淡变 | `fadeblack` | 淡入黑场 | 经过中间黑帧 |
| 淡变 | `fadewhite` | 淡入白场 | 经过中间白帧 |
| 滑动 | `slideleft` | 向左滑动 | 后一帧从右侧推入 |
| 滑动 | `slideright` | 向右滑动 | 后一帧从左侧推入 |
| 滑动 | `slideup` | 向上滑动 | 后一帧从下方推入 |
| 圆形 | `circleopen` | 圆形展开 | 圆心向外扩张 |
| 圆形 | `circleclose` | 圆形收缩 | 圆心向内收拢 |
| 擦除 | `wipeleft` | 向左擦除 | 横向擦除 |
| 像素 | `pixelize` | 像素溶解 | 经过马赛克过渡 |

后端在 `TRANSITION_TYPE_WHITELIST` 做白名单校验；非法值视作 `null`，回退默认 `fade`。


## 过渡时长约束

- 范围：`[0, 2000]` ms。
- `duration === 0`：等价于"关闭过渡"，走原 `[copy, transcode]` 链。
- `duration > 任一相邻片段时长的一半`：当条接缝降级为硬切（不影响其他接缝）。
- 单段视频（n=1）：无接缝，xfade 跳过，直接 transcode 或 copy。

## 策略链与降级

```
xfade  →  transcode  →  copy
```

- 当 episode 的 effective duration > 0 时进入 xfade 分支；失败则按现有顺序回退。
- duration === 0 时跳过 xfade，直接走 copy→transcode（与现状一致）。
- **能力探测**：进入 xfade 前先调用 `ffmpegSupportsXfade()`（缓存 `ffmpeg -filters` 输出），若不支持直接换成 `[copy, transcode]`，日志事件 `ffmpeg-xfade-unsupported`。
- xfade 路径全程重编码，编码参数对齐现有 transcode：`libx264 veryfast crf 23 / aac 48k 192k / yuv420p / +faststart`。
- xfade 失败时附带 ffmpeg stderr 末 4KB 到错误信息（事件 `ffmpeg-xfade-fallback`），便于定位 filter graph 问题。

## FFmpeg filter graph 构造

输入 N 段视频，每段先 `getVideoDurationPrecise` 探测精确时长。设过渡时长 `d`，第 `k` 段累计时间 `T_k = Σ dur[0..k]`。

**1. 输入归一化（必须）**：每路视频/音频先经过参数统一，否则不同分镜的 fps/pixel format/timebase 差异会让 xfade 报 "Invalid argument"。

```
[0:v] fps=30,format=yuv420p,setpts=PTS-STARTPTS [v0n]
[0:a] aformat=sample_rates=48000:channel_layouts=stereo,asetpts=PTS-STARTPTS [a0n]
... (每路都做)
```

**2. 视频链**：
```
[v0n][v1n] xfade=transition=<type>:duration=d:offset=T_0 - d [v01]
[v01][v2n] xfade=transition=<type>:duration=d:offset=T_1 - 2d [v012]
...
```

**3. 音频链**：
```
[a0n][a1n] acrossfade=d=d [a01]
[a01][a2n] acrossfade=d=d [a012]
...
```

**音轨缺失兜底**：~~`anullsrc` 补静音~~ — 已撤销。所有分镜自带音轨；若个别片段确实无音轨，xfade 路径会失败并降级到 transcode 硬切，这是可接受的兜底行为。

**接缝级降级**：每条接缝有效时长 `seamD = min(d, dur[k]/2, dur[k+1]/2)`；若 `seamD < 50ms`（`MIN_SEAM_DURATION_SECONDS`），该接缝改用 `concat=n=2:v=1:a=0` / `concat=n=2:v=0:a=1` 硬切（不影响其他接缝）。当 N 段所有接缝都退化为 0 时，`buildXfadeFilter` 返回 `null`，整体走 transcode。

## 模块改动（落地清单）

后端：

| 文件 | 改动 |
|------|------|
| `backend/src/db/schema.ts` | `episodes`、`video_merges` 各新增 `transition_type` / `transition_duration_ms` |
| `backend/src/db/index.ts` | `CREATE TABLE` 与 `ensureColumn` 迁移这两列；启动时调用 `ensureProjectEnvLoaded()` |
| `backend/src/services/merge/merge-transition-policy.ts` | **新建**：白名单、时长校验、`computeSeamDurations`、`buildXfadeFilter`（含归一化输入、接缝级降级） |
| `backend/src/services/merge/merge-ffmpeg-strategy.ts` | 新增 `xfade` 策略；`ffmpegMergeStrategiesWithXfade` 与 `resolveStrategyChain` |
| `backend/src/services/merge/merge-ffmpeg-execution.ts` | xfade 分支：能力探测 → 探测时长 → 构造 filter_complex → 运行；保留 concat demuxer 分支；失败时附 stderr 末 4KB |
| `backend/src/services/merge/ffmpeg-merge.ts` | 读取 episode 配置传入 merge；写入 merges 快照 |
| `backend/src/services/merge/merge-job-state.ts` | `createEpisodeMergeRecord` 接收并写入过渡字段 |
| `backend/src/services/ffmpeg/ffmpeg.ts` | 新增 `getVideoDurationPrecise`、`ffmpegSupportsXfade`、`resetXfadeSupportCache`；启动时调用 `ensureProjectEnvLoaded()` |
| `backend/src/utils/project-env.ts` | **新建**：根 `.env` 解析并注入 `process.env` |
| `backend/src/routes/policies/chapter-route-policy.ts` | `buildChapterUpdatePatch` 接受 `transition_type` / `transition_duration_ms` |

前端：

| 文件 | 改动 |
|------|------|
| `frontend/src/components/chapter/ChapterTransitionDialog.vue` | **新建**：过渡设置弹窗（类型 3 选 + 0–1000ms 滑块） |
| `frontend/src/components/chapter/ChapterExportPanel.vue` | 合并按钮旁加齿轮入口；新增 `transitionType`、`transitionDurationMs`、`transitionSaving` 三个 prop 与 `save-transition` 事件 |
| `frontend/src/pages/ChapterStudioView.vue` | 注入 `episode.transition_*`，监听保存事件调用 `chapterAPI.update` |

测试：

| 文件 | 说明 |
|------|------|
| `backend/src/services/__tests__/merge-transition-policy.test.ts` | **新建**：11 个用例覆盖白名单、时长 clamp、接缝降级、N=1/2/3+ 等 |
| `backend/src/services/__tests__/merge-job-state.test.ts` | 既有用例补 `transitionType` / `transitionDurationMs` 字段 |

## API 契约

### 读取集详情
返回值增加：
```json
{ "transitionType": "fade" | null, "transitionDurationMs": 500 | null }
```

### 更新集配置
`PUT /api/chapters/:id`
```json
{ "transitionType": "fade" | "fadeblack" | "fadewhite" | null,
  "transitionDurationMs": 0..2000 | null }
```
后端：白名单校验；超界裁剪；NULL 表示清除集级覆盖。

### 触发合并
合并接口未引入 override；前端始终使用 episode 上的最新配置。

## 前端 UI

集页面"合并视频"按钮旁新增齿轮入口（`ChapterTransitionDialog`）：

- 过渡类型：单选 `淡入淡出` / `淡入黑场` / `淡入白场`
- 过渡时长：滑块 0–1000 ms，步长 100；时长为 0 自动视作"关闭"，类型置为 `null`
- 操作：`保存` → `PUT /chapters/:id` → 关闭弹窗；`取消` → 关闭不保存

不在弹窗里直接触发合并；用户保存后仍点"合并视频"按钮，使用最新配置。

## 验收

- 单元（已通过）：
  - 白名单校验拒绝非法 type
  - duration 超界被裁剪、`null` 保持 `null`
  - 单段视频跳过 xfade
  - 接缝级降级：seamD < 50ms 时该接缝退化为硬切
  - N=2/3+ 分别产出正确数量的 xfade / acrossfade 步骤
- 行为（已部分验证）：
  - 时长 ≈ Σ 分镜时长 − Σ 实际过渡时长
  - 失败链路按 `xfade → transcode → copy` 顺序落地，日志带 strategy 字段
  - 本地老 bundle 触发 `ffmpeg-xfade-unsupported` → 直接走 copy，不产生失败堆栈
  - **生产 SCF 上的真实淡入淡出效果**：待部署后通过实际产物核对

## 风险与缓解（落地后回顾）

| 风险 | 缓解 |
|------|------|
| 重编码 CPU 显著上升 | 沿用 14 分钟超时；超时则降级 transcode |
| filter graph 字符串拼接易错 | 抽 `buildXfadeFilter`，11 个单元用例覆盖 |
| ffmpeg 版本不支持 xfade | 启动前 `ffmpegSupportsXfade()` 探测，缓存结果，不支持则跳过策略 |
| 不同分镜 fps/timebase 微差导致 xfade 报错 | 进入 xfade 前对每路视频/音频做归一化（`fps=30,format=yuv420p,setpts` + `aformat=48k/stereo,asetpts`） |
| `.env` 中 `FFMPEG_PATH` 不生效 | `project-env.ts` 在 ffmpeg / db 启动时统一把根 `.env` 注入 `process.env` |
| 现有合并任务在升级后跑老数据 | `video_merges` 字段允许 NULL，老任务读出来即"未配置" |
| 个别分镜确实无音轨 | 走 transcode 硬切兜底；前期决策不引入 anullsrc 静音补齐 |

## 推迟项

- 集级以上的剧级默认配置
- 前端预览效果（弹窗里的转场实时预览）
- editly / gl-transitions 集成（见顶部"选型决策"，仅在产品策略需要差异化转场时重启评估）
- 合并接口的 per-call 过渡 override

