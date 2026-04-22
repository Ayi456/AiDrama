# AiDrama 纯视频合成化改造设计

日期：2026-04-22

## 1. 背景

当前项目虽然已经完成品牌切换到 `AiDrama`，但产品链路仍然包含一整套音频相关能力：

- AI 服务配置中存在 `audio` 服务类型
- 剧集创建时强制要求 `audio_config_id`
- 工作台包含音色分配、角色试听、镜头 TTS 配音生成
- Agent 默认能力中包含 `voice_assigner`
- 后端存在 `ai-voices`、角色试听、镜头 TTS 生成等接口
- FFmpeg 合成逻辑会尝试生成音频并烧录字幕

用户当前需求已经明确为：

- 硬移除推荐配置和一键配置
- 硬移除音频、配音、音色、试听、TTS 相关产品能力
- 保留视频合成，但改为“纯视频合成”

## 2. 目标

本次改造完成后，项目应满足以下目标：

1. 前端不再展示任何音频、音色、配音、试听、TTS 相关入口。
2. 新建剧集时只依赖文本、图片、视频配置，不再要求音频配置。
3. 后端不再暴露音频相关 API，也不再要求音频配置存在。
4. Agent 体系中不再存在音色分配相关能力。
5. 单镜头合成只基于已有视频素材输出合成结果，不再内联生成语音或字幕。
6. README、设置页、工作台文案统一反映“纯视频合成”定位。

## 3. 非目标

本次改造不处理以下事项：

- 物理删除 SQLite 中已有的音频相关字段
- 清理已有历史数据中的音色、试听、TTS 文件
- 重新设计数据库结构迁移方案
- 调整文件存储、FFmpeg 部署方案或云函数部署方案

也就是说，本次以“运行时彻底停用音频能力”为主，数据库字段可暂时保留以兼容旧数据。

## 4. 设计原则

### 4.1 产品原则

- 页面只保留当前可用的能力入口，不保留“暂未启用”的音频模块。
- “配音生成”“音色分配”“试听”等概念从用户主流程中完全移除。
- 合成页面和合成状态统一使用“视频合成”语义。

### 4.2 技术原则

- 优先删除调用链，而不是仅隐藏按钮。
- 前后端接口契约同步收敛，避免前端不显示但后端仍强依赖音频配置。
- 尽量保留数据库兼容性，避免本轮因为 SQLite 结构变更扩大风险。

## 5. 当前问题

当前实现存在以下阻塞：

1. 设置页仍把 `audio` 视为一类核心 AI 服务。
2. 剧集创建接口 `POST /episodes` 强制要求 `audio_config_id`。
3. 单集工作台脚本阶段依赖音色分配，制作阶段依赖配音生成。
4. `voice_assigner` Agent 与 `voice-tools` 工具仍是默认能力。
5. `composeStoryboard` 会尝试：
   - 自动推断角色音色
   - 生成 TTS 音频
   - 写入 `tts_audio_url`
   - 生成并烧录字幕
6. README 仍将“角色音色分配与试听”“TTS 配音生成”作为核心特性。

## 6. 目标架构

改造后保留的主流程应为：

1. 剧集创建：文本配置、图片配置、视频配置
2. 脚本阶段：原文、改写、角色提取、场景提取、分镜提取
3. 制作阶段：图片生成、视频生成、视频合成、整集合并

删除后的能力边界如下：

- 不再有音频配置
- 不再有音色库和同步逻辑
- 不再有角色试听
- 不再有镜头 TTS 配音生成
- 不再有字幕烧录作为默认合成内容

## 7. 前端改造设计

### 7.1 设置页

`frontend/app/pages/settings.vue`

- 删除“推荐配置”和“一键配置”整块 UI
- 删除 `audio` 服务类型与对应说明
- 删除音频相关预设数据
- 删除 `voice_assigner` Agent 定义和默认提示词
- 保留文本、图片、视频三类服务配置

### 7.2 剧集创建页

`frontend/app/pages/drama/[id]/index.vue`

- 删除音频配置加载与展示
- 删除“音频可选”统计
- 创建剧集时不再传递 `audio_config_id`

### 7.3 单集工作台

`frontend/app/pages/drama/[id]/episode/[episodeNumber].vue`

- 删除音色分配面板
- 删除试听生成面板
- 删除配音生成面板
- 删除依赖 `audioConfigs`、`voicesAPI`、`generateTTS`、`voiceSample` 的状态和方法
- 调整步骤标签、统计卡片、完成度计算，使其只反映纯视频流程
- 保留角色、场景、分镜、图片、视频、合成、合并能力

### 7.4 前端 API 包装

`frontend/app/composables/useApi.ts`

- 删除 `storyboardAPI.generateTTS`
- 删除 `characterAPI.voiceSample`
- 删除 `voicesAPI`

## 8. 后端改造设计

### 8.1 路由层

- 删除 `backend/src/routes/aiVoices.ts`
- `backend/src/index.ts` 中移除 `/ai-voices` 注册
- `backend/src/routes/characters.ts` 中删除试听生成接口
- `backend/src/routes/storyboards.ts` 中删除 `generate-tts` 接口
- `backend/src/routes/episodes.ts` 中取消 `audio_config_id` 必填校验，并移除响应中的该字段
- `pipeline-status` 去掉 `assign_voices` 与 `generate_voice_samples`

### 8.2 AI 配置服务

- `backend/src/services/ai.ts` 的 `ServiceType` 收敛为 `text | image | video`
- 删除 `getAudioConfig`、`getAudioConfigById`
- `backend/src/routes/aiConfigs.ts` 删除音频预设

### 8.3 Agent 能力

- `backend/src/agents/index.ts` 删除 `voice_assigner`
- `backend/src/agents/skills.ts` 删除 `voice_assigner` 关联
- 删除 `backend/src/agents/tools/voice-tools.ts`

### 8.4 视频合成

`backend/src/services/ffmpeg-compose.ts`

目标行为改为：

- 只要求镜头视频存在
- 不生成 TTS 音频
- 不写入 `tts_audio_url`
- 不生成字幕文件
- 直接将原始视频转码或标准化输出为 composed video

这意味着“合成”从“视频 + 音频 + 字幕混流”变为“纯视频标准化输出”。

## 9. 数据兼容策略

本轮不执行 SQLite 物理删列，理由如下：

- 当前代码中已有旧字段读写历史
- SQLite 删列成本高，且容易牵扯迁移逻辑
- 用户当前诉求是产品硬移除，不是数据库清仓

兼容策略：

- 保留 schema 中相关字段
- 运行时停止写入与读取这些字段作为流程依赖
- 前端响应中尽量不再暴露这些字段用于页面主流程

## 10. 文案与产品语义

需要统一更新以下语义：

- “音色分配”删除
- “配音生成”删除
- “试听”删除
- “角色、场景与音色”改为“角色与场景”
- “视频合成失败，请检查视频、配音或字幕素材”改为纯视频语义

## 11. 验证标准

改造完成后，应至少满足以下验证：

1. 后端 `npm run typecheck` 通过。
2. 前端 `npm run build` 通过。
3. 设置页中只剩文本、图片、视频配置。
4. 剧集创建无需音频配置即可成功。
5. 单集工作台不存在音色、试听、配音相关模块。
6. 触发镜头合成时，不再依赖任何 TTS 或字幕逻辑。

## 12. 风险与注意事项

1. 单集工作台文件较大，删除音频模块时容易遗漏计算属性或文案引用。
2. 虽然数据库字段保留，但如果仍有旧前端缓存数据，页面可能出现空字段兼容场景。
3. 纯视频合成后，历史“带字幕或配音”的预期会发生变化，需要确保文案同步，避免误解。

## 13. 结论

本次改造应采用“前后端调用链整体移除、数据库字段暂时保留”的策略，把 AiDrama 收敛为一个聚焦于脚本拆解、镜头资产生成和纯视频合成的产品。这样可以在不引入数据库迁移风险的前提下，尽快完成产品能力收缩，并为后续继续简化部署形态打基础。
