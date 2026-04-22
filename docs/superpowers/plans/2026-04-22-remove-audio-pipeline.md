# AiDrama 纯视频合成化改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 硬移除音频、配音、音色、试听、TTS 相关能力，并将合成链路收敛为纯视频合成。

**Architecture:** 先收缩前端入口与 API 包装，确保页面主流程不再依赖音频；再删除后端路由、Agent 与服务配置；最后将 FFmpeg 合成逻辑改为纯视频输出，并同步 README 与文案。

**Tech Stack:** Nuxt 3、Vue 3、Hono、TypeScript、Drizzle ORM、SQLite、fluent-ffmpeg

---

### Task 1: 写入设计文档并锁定改造边界

**Files:**
- Create: `docs/superpowers/specs/2026-04-22-remove-audio-pipeline-design.md`
- Create: `docs/superpowers/plans/2026-04-22-remove-audio-pipeline.md`

- [ ] **Step 1: 写入设计文档**

写入内容应覆盖：

- 删除的产品能力：音频配置、音色分配、试听、TTS、字幕烧录
- 保留的主流程：文本、图片、视频、纯视频合成
- 兼容策略：数据库字段保留但运行时停用

- [ ] **Step 2: 自检文档边界**

检查文档中是否明确：

- 前端改哪些文件
- 后端改哪些文件
- 合成逻辑如何变化
- 如何验证结果

- [ ] **Step 3: 记录计划文件**

确认计划内后续任务已覆盖设置页、剧集创建页、工作台、后端路由、Agent、合成服务、README 和验证。

### Task 2: 收缩前端入口到纯视频流程

**Files:**
- Modify: `frontend/app/pages/settings.vue`
- Modify: `frontend/app/pages/drama/[id]/index.vue`
- Modify: `frontend/app/composables/useApi.ts`
- Modify: `frontend/app/pages/drama/[id]/episode/[episodeNumber].vue`

- [ ] **Step 1: 写前端回归检查点**

手工确认需要消失的入口：

- 设置页中的“推荐配置”“一键配置”“音频”
- 剧集创建弹窗中的音频配置选择
- 单集页中的音色分配、试听、配音生成

- [ ] **Step 2: 移除设置页音频配置能力**

要点：

- 删除快速推荐配置区块
- `serviceTypes` 只保留 `text`、`image`、`video`
- 删除 `audio` 元数据与音频预设
- 删除 `voice_assigner` Agent 定义与默认 prompt

- [ ] **Step 3: 移除剧集创建时的音频依赖**

要点：

- 停止请求 `aiConfigAPI.list('audio')`
- 不再维护 `audioConfigs`、`newEpisodeAudioConfigId`
- 创建剧集时只提交文本标题和图像/视频配置

- [ ] **Step 4: 清理前端 API 包装**

要点：

- 删除 `storyboardAPI.generateTTS`
- 删除 `characterAPI.voiceSample`
- 删除 `voicesAPI`

- [ ] **Step 5: 清理单集工作台音频模块**

要点：

- 删除音色分配面板、试听按钮、配音生成卡片
- 删除相关计算属性、方法、步骤统计和文案
- 更新阶段步骤，使脚本阶段与制作阶段只反映纯视频流程

- [ ] **Step 6: 运行前端构建验证**

Run: `npm run build`

Workdir: `frontend`

Expected: build 成功，无音频相关类型错误或模板引用错误。

### Task 3: 删除后端音频接口与 Agent 能力

**Files:**
- Modify: `backend/src/index.ts`
- Delete: `backend/src/routes/aiVoices.ts`
- Modify: `backend/src/routes/characters.ts`
- Modify: `backend/src/routes/storyboards.ts`
- Modify: `backend/src/routes/episodes.ts`
- Modify: `backend/src/routes/aiConfigs.ts`
- Modify: `backend/src/services/ai.ts`
- Modify: `backend/src/agents/index.ts`
- Modify: `backend/src/agents/skills.ts`
- Delete: `backend/src/agents/tools/voice-tools.ts`

- [ ] **Step 1: 删除音频路由注册**

要点：

- `backend/src/index.ts` 不再 import 和挂载 `aiVoices`

- [ ] **Step 2: 删除角色试听与镜头 TTS 接口**

要点：

- `characters.ts` 删除 `generate-voice-sample`
- `storyboards.ts` 删除 `generate-tts`
- 更新相关清空逻辑，避免继续维护 `ttsAudioUrl` 依赖

- [ ] **Step 3: 放宽剧集创建接口**

要点：

- `POST /episodes` 只要求 `image_config_id` 与 `video_config_id`
- 返回体不再暴露 `audio_config_id`
- `pipeline-status` 删除音色和试听步骤

- [ ] **Step 4: 删除 AI 与 Agent 层的音频能力**

要点：

- `ServiceType` 去掉 `audio`
- 删除音频 preset
- 删除 `voice_assigner`
- 删除 `voice-tools`

- [ ] **Step 5: 运行后端类型检查**

Run: `npm run typecheck`

Workdir: `backend`

Expected: typecheck 成功，无已删除接口或能力的残留引用。

### Task 4: 将合成链路改为纯视频合成

**Files:**
- Modify: `backend/src/services/ffmpeg-compose.ts`
- Modify: `backend/src/routes/compose.ts`

- [ ] **Step 1: 写合成行为检查点**

期望行为：

- 有视频即可合成
- 不生成音频
- 不生成字幕
- 输出 composed video

- [ ] **Step 2: 删除合成中的 TTS 与字幕逻辑**

要点：

- 去掉 `generateTTS` 依赖
- 去掉 `ttsAudioUrl` 生成和缓存
- 去掉 `subtitleUrl` 生成和烧录逻辑
- FFmpeg 输出只处理视频流

- [ ] **Step 3: 收敛错误文案**

要点：

- 将“检查视频、配音或字幕素材”改为纯视频描述

- [ ] **Step 4: 运行后端类型检查**

Run: `npm run typecheck`

Workdir: `backend`

Expected: 合成服务与路由引用全部对齐。

### Task 5: 清理文档与最终验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 更新 README 功能描述**

要点：

- 删除音色、试听、TTS 相关特性
- 更新 Agent 列表
- 更新工作台说明为纯视频合成

- [ ] **Step 2: 执行最终验证**

Run: `npm run typecheck`

Workdir: `backend`

Expected: 成功

Run: `npm run build`

Workdir: `frontend`

Expected: 成功

- [ ] **Step 3: 手工核对需求覆盖**

检查以下事项全部成立：

- 页面已无推荐配置与一键配置
- 页面已无音频配置入口
- 页面已无配音、音色、试听
- 合成已改为纯视频合成
- README 已同步为 AiDrama 当前能力描述
