/**
 * AiDrama script rewrite tools.
 * The factory closes over episodeId so the model only describes the creative work.
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

export function createScriptTools(episodeId: number) {
  const readEpisodeScript = createTool({
    id: 'read_episode_script',
    description: 'Read the script content of the current episode.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = (await db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all())
      if (!ep) return { error: `Episode not found (id=${episodeId})` }
      const content = ep.content || ep.scriptContent
      if (!content) return { error: `Episode has no content (id=${episodeId})` }
      return { content, word_count: content.length, episode_id: episodeId }
    },
  })

  const rewriteToScreenplay = createTool({
    id: 'rewrite_to_screenplay',
    description: 'Read the original content for AI rewriting. Returns the source text with formatting instructions.',
    inputSchema: z.object({
      instructions: z.string().optional().describe('Additional rewrite instructions'),
    }),
    execute: async ({ instructions }) => {
      const [ep] = (await db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all())
      if (!ep) return { error: `Episode not found` }
      const source = ep.content || ep.scriptContent
      if (!source) return { error: `Episode has no content to rewrite` }

      return {
        source_content: source,
        instruction: `请将以下内容改写为 AiDrama 可继续生产的格式化短剧剧本。

格式规范：
- 场景标题：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：使用自然段，不写镜头调度术语
- 对白格式：角色名：（状态/表情）台词内容
- 单场景容量：建议承载 30-60 秒剧情

改写要求：
- 保留核心剧情因果、关键反转和人物动机
- 删除不服务画面生产的冗余描写
- 稳定角色名、地点名和时间段，方便后续提取与分镜

${instructions || ''}

【原始内容】
${source}`,
      }
    },
  })

  const saveScript = createTool({
    id: 'save_script',
    description: 'Save the rewritten screenplay content to the current episode.',
    inputSchema: z.object({
      content: z.string().describe('The formatted screenplay content to save'),
    }),
    execute: async ({ content }) => {
      await db.update(schema.episodes)
        .set({ scriptContent: content, updatedAt: now() })
        .where(eq(schema.episodes.id, episodeId))
        .run()
      return { message: `Script saved`, word_count: content.length }
    },
  })

  return { readEpisodeScript, rewriteToScreenplay, saveScript }
}
