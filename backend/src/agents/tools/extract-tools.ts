/**
 * 角色/场景提取 Agent 工具
 * 工厂函数模式 — 注入 episodeId + dramaId
 *
 * 单 Agent 一步流程：
 * 1. 读取剧本内容
 * 2. 读取项目中已存在的角色/场景（用于去重）
 * 3. 提取角色/场景并智能去重后直接保存
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq, and } from 'drizzle-orm'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskSuccess } from '../../utils/task-logger.js'
import { resolveSceneEnvironmentPrompt } from '../visual-prompt-policy.js'

type ExtractToolOptions = {
  replaceExisting?: boolean
}

// ─── 关联辅助 ────────────────────────────────────────────────
async function linkCharToEpisode(episodeId: number, characterId: number) {
  const ts = now()
  const existing = (await db.select().from(schema.episodeCharacters)
    .where(and(eq(schema.episodeCharacters.episodeId, episodeId), eq(schema.episodeCharacters.characterId, characterId)))
    .all())
  if (!existing.length) {
    await db.insert(schema.episodeCharacters).values({ episodeId, characterId, createdAt: ts }).run()
  }
}

async function linkSceneToEpisode(episodeId: number, sceneId: number) {
  const ts = now()
  const existing = (await db.select().from(schema.episodeScenes)
    .where(and(eq(schema.episodeScenes.episodeId, episodeId), eq(schema.episodeScenes.sceneId, sceneId)))
    .all())
  if (!existing.length) {
    await db.insert(schema.episodeScenes).values({ episodeId, sceneId, createdAt: ts }).run()
  }
}

async function clearEpisodeCharacterLinks(episodeId: number) {
  await db.delete(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
    .run()
}

async function clearEpisodeSceneLinks(episodeId: number) {
  await db.delete(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
    .run()
}

export function createExtractTools(episodeId: number, dramaId: number, options: ExtractToolOptions = {}) {

  // 1. 读取剧本内容
  const readScriptForExtraction = createTool({
    id: 'read_script_for_extraction',
    description: 'Read the formatted screenplay for character/scene extraction.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = (await db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all())
      if (!ep) return { error: 'Episode not found' }
      const content = ep.scriptContent || ep.content
      if (!content) return { error: 'Episode has no script content' }
      logTaskSuccess('ExtractTool', 'read-script', { episodeId, dramaId, scriptLength: content.length })
      return { script: content }
    },
  })

  // 2. 读取项目中已存在的角色（用于去重判断）
  const readExistingCharacters = createTool({
    id: 'read_existing_characters',
    description: 'Read all characters already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        (await db.select().from(schema.episodeCharacters)
          .where(eq(schema.episodeCharacters.episodeId, episodeId)).all())
          .map(link => link.characterId),
      )
      const chars = (await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all())
        .filter(c => !c.deletedAt)
      const payload = {
        count: chars.length,
        characters: chars,
        current_episode_characters: chars.filter(c => linkedIds.has(c.id)),
      }
      logTaskSuccess('ExtractTool', 'read-characters', {
        episodeId,
        dramaId,
        projectCharacters: payload.count,
        episodeCharacters: payload.current_episode_characters.length,
      })
      return payload
    },
  })

  // 3. 读取项目中已存在的场景（用于去重判断）
  const readExistingScenes = createTool({
    id: 'read_existing_scenes',
    description: 'Read all scenes already existing in this drama project (for deduplication).',
    inputSchema: z.object({}),
    execute: async () => {
      const linkedIds = new Set(
        (await db.select().from(schema.episodeScenes)
          .where(eq(schema.episodeScenes.episodeId, episodeId)).all())
          .map(link => link.sceneId),
      )
      const scenes = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all())
        .filter(s => !s.deletedAt)
        .map(scene => ({
          ...scene,
          prompt: resolveSceneEnvironmentPrompt(scene.prompt, scene.location),
        }))
      const payload = {
        count: scenes.length,
        scenes,
        current_episode_scenes: scenes.filter(s => linkedIds.has(s.id)),
      }
      logTaskSuccess('ExtractTool', 'read-scenes', {
        episodeId,
        dramaId,
        projectScenes: payload.count,
        episodeScenes: payload.current_episode_scenes.length,
      })
      return payload
    },
  })

  // 4. 智能保存角色（按名字去重，与现有数据合并）
  const saveDedupCharacters = createTool({
    id: 'save_dedup_characters',
    description: 'Save extracted characters with deduplication. Existing characters (same name) are merged/updated; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      characters: z.array(z.object({
        name: z.string().describe('Character name. Merge same-name characters first; if distinct individuals or conflicting appearances, use a qualifier plus name, such as 少年·张三 or 魔化·李四.'),
        role: z.string().optional().describe('Stable identity label when useful for deduplication.'),
        description: z.string().optional().describe('Only visual style labels such as identity, occupation, class, faction, or species. Max 3 labels or 20 Chinese characters. No experience, relationship, ability, or plot information.'),
        appearance: z.string().optional().describe('Only objective drawable visual traits for the character asset 通用基准设定. 做完整定装，按 年龄段 → 性别特征 → 身高体型 → 肤色 → 脸型 → 五官特征 → 发型发色 → 上身服装 → 下身服装 → 配饰（含武器）→ 显著身体标记 → 稳定神态/体态 输出；原文缺少定装信息时，可按题材、时代、身份、年龄和场景保守补全视觉形象。不要写单场景表情、临时疲态、临时动作姿态、临时服装凌乱、受伤/哭泣状态或剧情阶段变化；这些状态交给具体镜头 image_prompt/video_prompt。'),
        personality: z.string().optional().describe('Only stable reusable temperament labels for the character baseline. No plot-stage changes, single-scene emotions, abstract judgment, moral judgment, causal premise, or plot premise.'),
      })),
    }),
    execute: async ({ characters }) => {
      const ts = now()
      const results = { created: 0, merged: 0 }
      const replaceExisting = options.replaceExisting === true
      logTaskProgress('ExtractTool', 'save-characters-begin', {
        episodeId,
        dramaId,
        replaceExisting,
        names: characters.map(char => char.name).join(','),
      })

      if (replaceExisting) await clearEpisodeCharacterLinks(episodeId)

      for (const char of characters) {
        const existing = (await db.select().from(schema.characters)
          .where(eq(schema.characters.dramaId, dramaId)).all())
          .filter(c => !c.deletedAt)
          .find(c => c.name === char.name)

        if (existing) {
          // 已存在：合并信息，保留 ID
          await db.update(schema.characters).set({
            role: replaceExisting ? char.role || '' : char.role || existing.role,
            description: replaceExisting ? char.description || '' : char.description || existing.description,
            appearance: replaceExisting ? char.appearance || '' : char.appearance || existing.appearance,
            personality: replaceExisting ? char.personality || '' : char.personality || existing.personality,
            updatedAt: ts,
          }).where(eq(schema.characters.id, existing.id)).run()
          await linkCharToEpisode(episodeId, existing.id)
          results.merged++
        } else {
          // 新增角色
          const res = (await db.insert(schema.characters).values({
            name: char.name,
            role: char.role || '',
            description: char.description || '',
            appearance: char.appearance || '',
            personality: char.personality || '',
            dramaId,
            createdAt: ts,
            updatedAt: ts,
          }).run())
          const charId = Number(res.lastInsertRowid)
          await linkCharToEpisode(episodeId, charId)
          results.created++
        }
      }

      const payload = {
        message: replaceExisting
          ? `角色重新提取完成：新增 ${results.created}，更新 ${results.merged}`
          : `角色保存完成：新增 ${results.created}，合并更新 ${results.merged}`,
        ...results,
      }
      logTaskSuccess('ExtractTool', 'save-characters-complete', { episodeId, replaceExisting, ...results })
      return payload
    },
  })

  // 5. 智能保存场景（按地点+时间段去重，与现有数据合并）
  const saveDedupScenes = createTool({
    id: 'save_dedup_scenes',
    description: 'Save extracted scenes with deduplication. Existing scenes (same location+time) are reused; new ones are created. All are linked to the current episode.',
    inputSchema: z.object({
      scenes: z.array(z.object({
        location: z.string().describe('Scene location name, such as 云泽楼大殿.'),
        time: z.string().optional().describe('Time period for this reusable scene asset, such as 中午 or 夜晚.'),
        prompt: z.string().optional().describe('Reusable environment-only scene asset prompt. Describe architecture, furnishings, props, lighting, color, and atmosphere. Do not include character names, character appearance, actions, dialogue, plot events, or current-shot story summary.'),
      })),
    }),
    execute: async ({ scenes }) => {
      const ts = now()
      const results = { created: 0, reused: 0 }
      const replaceExisting = options.replaceExisting === true
      logTaskProgress('ExtractTool', 'save-scenes-begin', {
        episodeId,
        dramaId,
        replaceExisting,
        scenes: scenes.map(scene => `${scene.location}@${scene.time || ''}`).join(','),
      })

      if (replaceExisting) await clearEpisodeSceneLinks(episodeId)

      for (const scene of scenes) {
        // 按地点+时间段精确匹配
        const existing = (await db.select().from(schema.scenes)
          .where(eq(schema.scenes.dramaId, dramaId)).all())
          .filter(s => !s.deletedAt)
          .find(s => s.location === scene.location && s.time === (scene.time || ''))

        if (existing) {
          // 已存在完全匹配的场景：直接关联
          if (replaceExisting) {
            await db.update(schema.scenes).set({
              prompt: resolveSceneEnvironmentPrompt(scene.prompt, scene.location),
              updatedAt: ts,
            }).where(eq(schema.scenes.id, existing.id)).run()
          }
          await linkSceneToEpisode(episodeId, existing.id)
          results.reused++
        } else {
          const res = (await db.insert(schema.scenes).values({
            dramaId,
            location: scene.location,
            time: scene.time || '',
            prompt: resolveSceneEnvironmentPrompt(scene.prompt, scene.location),
            createdAt: ts,
            updatedAt: ts,
          }).run())
          const sceneId = Number(res.lastInsertRowid)
          await linkSceneToEpisode(episodeId, sceneId)
          results.created++
        }
      }

      const payload = {
        message: replaceExisting
          ? `场景重新提取完成：新增 ${results.created}，更新 ${results.reused}`
          : `场景保存完成：新增 ${results.created}，复用已有 ${results.reused}`,
        ...results,
      }
      logTaskSuccess('ExtractTool', 'save-scenes-complete', { episodeId, replaceExisting, ...results })
      return payload
    },
  })

  return {
    readScriptForExtraction,
    readExistingCharacters,
    readExistingScenes,
    saveDedupCharacters,
    saveDedupScenes,
  }
}
