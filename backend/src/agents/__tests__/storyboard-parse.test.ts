import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoryboardsFromText } from '../storyboard-parse.js'

const structuredVideoPrompt = [
  '参考素材绑定：人物参考：林晚；场景参考：病房。',
  '主体与场景：林晚坐在病房床边。',
  '入场与首帧：近景，林晚低头看文件，保持 0.5 秒入场把手。',
  '分秒时间轴：0.0-0.5秒：保持首帧；0.5-3.0秒：她翻开文件；3.0-6.0秒：手指停在诊断结果旁；6.0-7.5秒：她缓慢抬眼；7.5-8.0秒：保持尾帧。',
  '运镜与画面：固定近景，不切换场景，视线轴保持一致。',
  '出场与尾帧：林晚仍坐在床边，文件停在掌心，保持 0.5 秒。',
  '声音与对白：纸张翻动声，病房底噪连续，无对白。',
  '画质与风格：真实短剧电影感，光线稳定。',
  '约束与禁止项：不要提前离开，不要生成字幕、Logo、水印或 UI。',
  '失败降级：若翻页交互不稳定，改为手指沿文件边缘轻移，尾帧不变。',
].join('\n')

function validShot(overrides: Record<string, unknown> = {}) {
  return {
    shot_number: 1,
    title: '医院真相',
    shot_type: '近景',
    angle: '平视',
    movement: '固定',
    location: '医院病房',
    time: '白天',
    action: '林晚翻开文件，手指停在诊断结果旁。',
    dialogue: '',
    description: '林晚坐在床边低头查看文件。',
    result: '林晚仍坐在床边，文件停在掌心。',
    director_intent: '揭开真相',
    audience_info_change: '观众确认诊断结果。',
    emotion_shift: '林晚从疑惑转为震惊。',
    dramatic_value: '完成核心信息揭示。',
    atmosphere: '冷白光，环境安静压抑。',
    image_prompt: '医院病房近景，林晚手持文件，冷白光。',
    first_frame_prompt: '医院病房近景，林晚低头看尚未翻开的文件，冷白光。',
    last_frame_prompt: '医院病房近景，林晚手指停在诊断结果旁并抬眼，冷白光。',
    video_prompt: structuredVideoPrompt,
    transition_in: '承接上一镜视线方向，静止入场。',
    transition_out: '尾帧稳定停在抬眼状态，交给下一镜反应。',
    screen_direction: '林晚视线从画面下方向画外右侧抬起。',
    audio_bridge: '病房环境底噪连续。',
    negative_prompt: '不要提前离开病床，不要切换场景。',
    fallback_plan: '翻页失败时改为手指轻移，尾帧状态不变。',
    handle_in_ms: 500,
    handle_out_ms: 500,
    bgm_prompt: '低频弦乐缓慢推进',
    sound_effect: '纸张翻动声与监护仪底噪',
    duration: 8,
    scene_id: null,
    character_ids: [],
    ...overrides,
  }
}

test('parses a complete plain JSON object', () => {
  const shots = parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot()] }))
  assert.equal(shots.length, 1)
  assert.equal(shots[0].shot_number, 1)
  assert.equal(shots[0].title, '医院真相')
})

test('parses JSON wrapped in a ```json fence', () => {
  const text = `\`\`\`json\n${JSON.stringify({ storyboards: [
    validShot(),
    validShot({ shot_number: 2, title: '震惊抬眼' }),
  ] })}\n\`\`\``
  const shots = parseStoryboardsFromText(text)
  assert.equal(shots.length, 2)
})

test('extracts JSON even with surrounding prose', () => {
  const shot = validShot({ character_ids: [3, 5], scene_id: 7 })
  const text = `好的，这是分镜：\n${JSON.stringify({ storyboards: [shot] })}\n以上。`
  const shots = parseStoryboardsFromText(text)
  assert.deepEqual(shots[0].character_ids, [3, 5])
  assert.equal(shots[0].scene_id, 7)
})

test('rejects incomplete production fields instead of silently normalizing nulls', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({
      storyboards: [{ shot_number: 1, title: null, duration: null }],
    })),
    /缺少必填生产字段/,
  )
})

test('parses director planning fields for storyboard shots', () => {
  const shots = parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot()] }))
  assert.equal(shots[0].director_intent, '揭开真相')
  assert.equal(shots[0].audience_info_change, '观众确认诊断结果。')
  assert.equal(shots[0].emotion_shift, '林晚从疑惑转为震惊。')
  assert.equal(shots[0].dramatic_value, '完成核心信息揭示。')
})

test('rejects duplicate shot numbers from model JSON', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [
      validShot(),
      validShot({ title: '重复编号' }),
    ] })),
    /分镜编号重复/,
  )
})

test('rejects placeholder shots without production content', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({
      storyboards: [{ shot_number: 28, title: '镜头28', video_prompt: '镜头标题：镜头28' }],
    })),
    /占位镜头/,
  )
})

test('rejects durations outside the supported 4-15 second range', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ duration: 3 })] })),
    /duration 必须是 4-15 的整数/,
  )
})

test('rejects video prompts missing required structure sections', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ video_prompt: '人物缓慢抬眼。' })] })),
    /video_prompt 缺少结构段/,
  )
})

test('rejects legacy action-stage wording inside a Seedance 2.0 video prompt', () => {
  const invalidPrompt = structuredVideoPrompt.replace(
    '分秒时间轴：0.0-0.5秒：保持首帧；0.5-3.0秒：她翻开文件；3.0-6.0秒：手指停在诊断结果旁；6.0-7.5秒：她缓慢抬眼；7.5-8.0秒：保持尾帧。',
    '分秒时间轴：动作阶段1：她翻开文件；动作阶段2：她抬眼。',
  )
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ video_prompt: invalidPrompt })] })),
    /必须使用分秒时间轴/,
  )
})

test('rejects a time-coded prompt that does not cover the exact duration', () => {
  const invalidPrompt = structuredVideoPrompt.replace('7.5-8.0秒：保持尾帧。', '7.5-7.8秒：保持尾帧。')
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ video_prompt: invalidPrompt })] })),
    /准确结束在 duration=8 秒/,
  )
})

test('rejects gaps or overlaps in the time-coded prompt', () => {
  const invalidPrompt = structuredVideoPrompt.replace('3.0-6.0秒', '3.2-6.0秒')
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ video_prompt: invalidPrompt })] })),
    /不能留空档或发生重叠/,
  )
})

test('rejects a timeline whose edit handles disagree with the structured fields', () => {
  assert.throws(
    () => parseStoryboardsFromText(JSON.stringify({ storyboards: [validShot({ handle_out_ms: 700 })] })),
    /最后一段必须准确覆盖 handle_out_ms/,
  )
})

test('throws on invalid JSON', () => {
  assert.throws(() => parseStoryboardsFromText('not json at all'), /未返回合法 JSON/)
})

test('throws when a shot is missing the required shot_number', () => {
  assert.throws(() => parseStoryboardsFromText('{"storyboards":[{"title":"无编号"}]}'), /结构不符合要求/)
})

test('throws when storyboards is empty', () => {
  assert.throws(() => parseStoryboardsFromText('{"storyboards":[]}'), /结构不符合要求/)
})
