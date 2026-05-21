# 视频拼接过渡优化 - 方案 A 设计

> 关联调研文档：`docs/video-transition-plan.md`

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

## 过渡类型白名单（MVP）

```
fade | fadeblack | fadewhite
```

后端必须做白名单校验；非法值视作 NULL 并回退默认。

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
- duration === 0 时跳过 xfade，直接走 transcode→copy（与现状一致）。
- xfade 路径全程重编码，编码参数对齐现有 transcode：`libx264 veryfast crf 23 / aac 48k 192k / yuv420p / +faststart`。

## FFmpeg filter graph 构造

输入 N 段视频，每段先 `getVideoDuration` 探测。设过渡时长 `d`，第 `k` 段累计时间 `T_k = Σ dur[0..k]`。

视频链：
```
[0:v][1:v] xfade=transition=<type>:duration=d:offset=T_0 - d [v01]
[v01][2:v] xfade=transition=<type>:duration=d:offset=T_1 - 2d [v012]
...
```

音频链：
```
[0:a][1:a] acrossfade=d=d [a01]
[a01][2:a] acrossfade=d=d [a012]
...
```

**音轨缺失**：探测阶段若发现某段无音轨，先用 `anullsrc=channel_layout=stereo:sample_rate=48000` 生成等长静音占位（沿用 compose 流程现有做法）。

**接缝级降级**：如果第 k 段或 k+1 段时长 < 2d，本条接缝把 `xfade` 改为零时长的 concat（offset = T_k，duration = 0 → 退化为硬切）。实现上通过将 `d_k` 单独裁剪为该接缝可用的最大值（`min(d, dur[k]/2, dur[k+1]/2)`），保证 filter graph 不报错。

## 模块改动

| 文件 | 改动 |
|------|------|
| `backend/src/db/schema.ts` | episodes、merges 表新增两列 |
| `backend/src/services/merge/merge-ffmpeg-strategy.ts` | 新增 `xfade` 策略；`ffmpegMergeStrategies` 改为按 effective duration 动态生成；新增白名单常量与校验函数 |
| `backend/src/services/merge/merge-ffmpeg-execution.ts` | xfade 分支：探测时长 → 构造 filter_complex → 运行；保留现有 concat demuxer 分支 |
| `backend/src/services/merge/ffmpeg-merge.ts` | 读取 episode/override 配置传入 merge；写入 merges 表快照 |
| `backend/src/services/merge/merge-job-state.ts` | `createEpisodeMergeRecord` 接收并写入过渡字段 |
| `backend/src/services/ffmpeg/ffmpeg.ts` | 无新增导出；`getVideoDuration`、`hasAudioStream` 复用 |
| `backend/src/routes/episodes.ts`（或对应路由文件） | `PATCH` 接受 `transitionType`、`transitionDurationMs` |
| `backend/src/routes/merge.ts`（或对应路由文件） | 合并接口接受可选 override |
| `frontend/src/components/chapter/*`（合并按钮所在组件） | 按钮旁加齿轮 → 弹窗 |
| `frontend/src/composables/chapter/*` | 弹窗状态、保存、触发合并 |
| `frontend/src/composables/useApi.ts` | 集级 PATCH 增加新字段 |

## API 契约

### 读取集详情
返回值增加：
```json
{ "transitionType": "fade" | null, "transitionDurationMs": 500 | null }
```

### 更新集配置
`PATCH /api/episodes/:id`
```json
{ "transitionType": "fade" | "fadeblack" | "fadewhite" | null,
  "transitionDurationMs": 0..2000 | null }
```
后端：白名单校验；超界裁剪；NULL 表示清除集级覆盖。

### 触发合并（可选 override，本次默认不暴露）
预留参数位置但 MVP 前端不传，永远使用 episode 上的配置。

## 前端 UI

集页面现有"合并视频"按钮右侧新增齿轮 icon（小按钮）→ 点击弹窗：

- 过渡类型：单选 `淡入淡出` / `淡入黑场` / `淡入白场` / `关闭`
- 过渡时长：滑块 0–1000 ms，步长 100；选"关闭"时禁用
- 操作：`保存` → `PATCH` → 关闭弹窗；`取消` → 关闭不保存

不在弹窗里直接触发合并；用户保存后仍点旧的"合并视频"按钮，使用最新配置。

## 验收

- 单元/集成：
  - 白名单校验拒绝非法 type
  - duration 超界被裁剪
  - 单段视频跳过 xfade
  - 接缝级降级：当 d > dur/2，filter graph 不报错且产物完整
  - 缺音轨片段：anullsrc 补齐后 acrossfade 正常
- 行为：
  - 时长 ≈ Σ 分镜时长 − Σ 实际过渡时长
  - duration=0 时与现产物等价（仅可能 byte 差异来自重新走 transcode 的接缝；MVP 接受）
  - 失败链路按 `xfade → transcode → copy` 顺序落地，日志带 strategy 字段

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 重编码 CPU 显著上升 | 沿用 14 分钟超时；超时则降级 transcode |
| filter graph 字符串拼接易错 | 抽独立函数 `buildXfadeFilter(durations, type, d)`，单元测试覆盖 N=1/2/3+ 与降级 |
| 缺音轨片段导致 acrossfade 失败 | 探测后注入 anullsrc 输入 |
| 现有合并任务在升级后跑老数据 | merges 表字段允许 NULL，老任务读出来即"未配置" |

## 推迟项

- 集级以上的剧级默认配置
- 更多过渡类型（slide / circle / wipe …）
- 前端预览效果
- editly 集成
