---
name: grid-image-generator
description: Seedream 5.0 图片提示词生成指南 — 角色、场景、宫格图三类提示词规范
---

# 图片提示词生成指南

本 SKILL 对应 `grid_prompt_generator` Agent，支持生成三类图片提示词：

1. **角色图片提示词** — 三视图人物外观参考图
2. **场景图片提示词** — 空场景资产图
3. **宫格图提示词** — 多镜头网格拼图

详细模板见 `reference/` 目录。

---

## 角色图片提示词

参考：`reference/character-prompt.md`

### 模板结构
```
[角色名仅用于提示词定义], [人物外观参考图用途], [稳定外貌/气质/身份], [三视图：正面、侧面、背面], [纯白背景或浅灰背景], [cinematic quality], [consistent art style], [no text, no watermark]
```

### 生成规则
- 以 `appearance`（外貌描述）为核心
- `personality` 决定气质基调（内敛/张扬/神秘等）
- `role` 决定服装和道具风格
- 必须写明这是用于后续多模态视频生成的人物外观参考图
- 必须保留三视图：正面、侧面、背面
- 保持人物外貌、发型、服装和体型一致
- 避免出现角色名、视图名称、文字、签名、Logo、水印、其他人物、剧情道具或场景

---

## 场景图片提示词

参考：`reference/scene-prompt.md`

### 模板结构
```
[空场景资产图用途], [location], [time period], [lighting atmosphere], [space structure and direction], [materials and props], [cinematic quality], [consistent art style], [no people, no text, no watermark]
```

### 生成规则
- 以 `location`（地点）为基础
- `time` 决定光线色调（白天/夜晚/黄昏）
- 必须写明这是用于后续多模态视频生成的空场景资产图
- 强调空间结构和方向保持稳定，明确入口、出口、墙面、主要家具或陈设的位置关系
- 只描述环境、建筑、陈设、光线、色调、材质、空间氛围和镜头质感
- 避免出现人物、剧情动作、对白、临时剧情道具、字幕、Logo、水印或 UI

---

## 宫格图提示词

参考：`reference/shot-prompt.md`

### 三种模式

#### 首帧模式 (first_frame)
每个格子 = 一个镜头的起始画面，但必须严格生成用户指定的 `rows x cols` 总格数。

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style, [style description],
格1: [shot 1 opening scene],
格2: [shot 2 opening scene],
格3: [shot 3 opening scene],
...
格N: [opening scene],
high quality, cinematic lighting, no merged panels, no missing panels, no text, no watermark
```

#### 首尾帧模式 (first_last)
保持首尾帧节奏感，但仍然必须严格生成用户指定的 `rows x cols` 总格数，不允许偷偷改成 `Nx2`。

```
[rows x cols grid layout], exactly [rows*cols] visible panels, consistent art style, [style description],
格1: [opening beat],
格2: [closing beat],
格3: [opening beat],
格4: [closing beat],
...
high quality, cinematic, continuous motion implied, no merged panels, no missing panels, no text
```

#### 多参考模式 (multi_ref)
所有格子都是同一镜头的不同角度/构图参考，但仍然必须严格生成用户指定的 `rows x cols` 总格数。

```
[rows x cols grid layout], exactly [rows*cols] visible panels, same scene different angles, [style description],
[main scene description],
格1: wide shot establishing,
格2: medium shot character focus,
格3: close-up detail,
格4: dramatic angle,
...
consistent lighting and color palette, no merged panels, no missing panels, no text
```

### 通用规则
1. 提示词使用**英文**
2. 必须明确写出用户指定的 `rows x cols grid layout`
3. 必须包含 `consistent art style` 保持风格统一
4. 必须明确要求 `exactly N visible panels`
5. 必须明确要求 `no merged panels, no missing panels`
6. 避免在格子间出现分割线的描述
7. 尺寸建议：每格 960x540，总图 = 960×cols × 540×rows
8. 当存在参考图映射时，统一使用 `图片1/图片2/...` 指代参考图，不要把它和 `格1/格2/...` 混用
