# 视频拼接过渡优化方案

## 背景

当前 `backend/src/services/merge/` 下的视频合并流程使用 FFmpeg 的 **concat demuxer** 做硬切拼接（见 `merge-ffmpeg-execution.ts:84-88`），不存在任何过渡效果：

- 视频之间是 0 帧切换 → 视觉跳变
- 音频之间是瞬间截断 → 听觉"啪"的爆音
- 优先走 `-c copy`（见 `merge-ffmpeg-strategy.ts`），缺少编码归一化，不同分镜的色调/码率差异被放大

用户反馈"拼接过于生硬"，本文档列出两种可行的改造方案。

---

## 方案 A：FFmpeg 原生改造（推荐先做）

### 思路

把 concat demuxer 换成 `filter_complex` + **xfade**（视频过渡）+ **acrossfade**（音频淡入淡出）。代价是必须全部重编码，`-c copy` 策略要在过渡路径上退役，但现有 fallback 已经验证过 `libx264 veryfast` 的可行性。

### 命令示例

两段视频 0.5 秒淡入淡出：

```bash
ffmpeg -i clip0.mp4 -i clip1.mp4 \
  -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=<clip0_dur-0.5>[v01]; \
                   [0:a][1:a]acrossfade=d=0.5[a01]" \
  -map "[v01]" -map "[a01]" \
  -c:v libx264 -preset veryfast -crf 23 \
  -c:a aac -b:a 192k \
  -pix_fmt yuv420p -movflags +faststart \
  out.mp4
```

N 段视频时需要链式构造 filter graph：`[v01]` 与 `[2:v]` 再做 xfade → `[v012]`，以此类推；offset 要累加每段的实际时长并扣除已用过的过渡时长。

### 可选过渡类型

xfade 内置 50+ 种：`fade` / `fadeblack` / `fadewhite` / `slideleft` / `slideright` / `slideup` / `slidedown` / `circleopen` / `circleclose` / `pixelize` / `wipeleft` / `radial` / `smoothleft` …  
建议默认 `fade`，其他类型按分镜节奏开关。

### 落地点

| 文件 | 改动 |
|------|------|
| `backend/src/services/merge/merge-ffmpeg-strategy.ts` | 新增 `xfade` 策略，与 `copy` / `transcode` 并列 |
| `backend/src/services/merge/merge-ffmpeg-execution.ts` | 构造 `filter_complex` 字符串；优先走 xfade，失败回退 transcode |
| `backend/src/services/ffmpeg/ffmpeg.ts` | 复用 `getVideoDuration` 累加 offset |
| `backend/src/services/merge/ffmpeg-merge.ts` | 调度处传入过渡时长 / 类型配置 |

### 配置建议

- 默认过渡时长：**0.4–0.6 秒**（短剧节奏紧）
- 默认类型：`fade`
- 过渡时长不得超过任一相邻片段时长的一半，否则降级为硬切
- 编码参数与现有 `transcode` 策略对齐：`libx264 veryfast crf 23`、`aac 48k/192k`、`yuv420p`
- 在数据库或 `configs/config.yaml` 中暴露开关，便于关闭过渡做对比测试

### 风险与权衡

| 项 | 说明 |
|----|------|
| 性能 | 全程重编码，CPU 消耗显著上升；可参考现有 14 分钟超时，必要时分批合并 |
| 容错 | 单段输入异常会让整条 filter graph 失败；建议构造前做时长/流校验 |
| 音轨缺失 | 若部分分镜没有音轨，需先用 `anullsrc` 补静音（compose 流程已有先例） |
| 关键帧 | 不再受 stream copy 的关键帧限制，过渡时间可以任意 |

### 验收点

- 同一集所有分镜按预期叠加 xfade / acrossfade
- 输出文件可被浏览器直接播放，时长 = Σ 分镜时长 − (n-1) × 过渡时长
- 关闭过渡（duration=0 或回退 copy）时与现有产物字节级一致或仅编码差异

---

## 方案 B：接入 editly（中期重构候选）

### 项目简介

- 仓库：<https://github.com/mifi/editly>
- 语言：Node.js / JavaScript
- 本质：声明式 JSON 配置 → 内部包装 FFmpeg
- 原生支持 30+ 过渡、Ken Burns、字幕、BGM crossfade、转场音效
- License：MIT
- 与本项目契合度：TypeScript 后端可直接 `import editly from 'editly'`，无跨语言桥接

### 最小可行示例

```ts
import editly from 'editly'

await editly({
  outPath: 'episode-001.mp4',
  width: 1080,
  height: 1920,
  fps: 30,
  defaults: {
    transition: { name: 'fade', duration: 0.5 },
  },
  clips: [
    { layers: [{ type: 'video', path: 'storyboard-001.mp4' }] },
    { layers: [{ type: 'video', path: 'storyboard-002.mp4' }] },
    { layers: [{ type: 'video', path: 'storyboard-003.mp4' }] },
  ],
  audioTracks: [
    { path: 'bgm.mp3', mixVolume: 0.3 },
  ],
})
```

### 与方案 A 的对比

| 维度 | 方案 A（裸 FFmpeg） | 方案 B（editly） |
|------|---------------------|------------------|
| 改动量 | 小，几个文件即可 | 中，要重写 merge 编排层 |
| 过渡类型 | xfade 内置约 50 种 | 30+ 种，并可接 gl-transitions |
| BGM / 字幕 | 需要自己写 filter | 配置项一行搞定 |
| 调试体验 | 命令拼字符串，难读 | JSON 描述，易序列化和回放 |
| 依赖 | 只依赖 ffmpeg 二进制 | 额外引入 editly、canvas、gl 系列原生依赖 |
| Windows 部署 | 现有方案已跑通 | 需验证 `node-canvas` 在 Windows / 容器内的安装 |
| 长期扩展性 | 每加一个能力都要造轮子 | 与编辑器化路线天然契合 |

### 接入要点

1. 抽象出 `MergePlan` 数据结构（分镜列表 + 过渡 + 音轨），先与现有 FFmpeg 实现并行落地。
2. `merge-ffmpeg-execution.ts` 后增加一个 `runEditly(plan)` 适配器，通过 feature flag 切换。
3. 用一集真实分镜跑 A/B 对比，关注：产物体积、画质、合成耗时、内存峰值。
4. 验证 Windows 与生产容器（Linux）上的 `canvas` / GL 依赖安装。
5. 编辑器化的字幕、Ken Burns、BGM 需求确认要做之后再正式切换。

### 风险

- `node-canvas` / GL 依赖在某些 Windows 环境装机失败概率较高，需要预先验证。
- editly 维护节奏较慢，遇到 bug 可能要 fork。
- 全程重编码，性能特征与方案 A 一致。

---

## 推荐路线

1. **第一步（短期）**：实施方案 A，0.5 秒 `fade` + `acrossfade`，作为默认开关上线，立即解决"生硬"反馈。
2. **第二步（中期）**：评估 editly POC，若字幕 / BGM / Ken Burns 需求落地，再迁移合并编排层。
3. **第三步（长期）**：保留 `MergePlan` 抽象，使方案 A 与 editly 可共存切换。
