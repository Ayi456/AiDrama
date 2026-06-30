import assert from 'node:assert/strict'

import {
  buildAllMultimodalReferenceOptions,
  buildDefaultVideoPrompt,
  buildDynamicMultimodalReferenceBindingPlan,
  buildMultimodalReferenceOptions,
  buildVideoGeneratePayload,
  getReferenceModeGuidance,
  shouldShowVideoPendingPlaceholder,
} from '../chapterShotMediaPolicy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const storyboard = {
  id: 9,
  title: '镜头九',
  first_frame_image: 'current-first.png',
  last_frame_image: 'current-last.png',
  video_prompt: 'shot 9 video',
  dialogue: '旁白：山门外的钟声骤然响起。\n顾玄：别慌，先看阵眼。',
  duration: 7,
}

const elevatorStoryboard = {
  id: 1204,
  title: '电梯里的烦躁',
  shot_type: '中景',
  angle: '平视',
  movement: '固定',
  location: '公寓电梯',
  time: '清晨',
  description: '电梯镜面映出林晚的脸。她低头看手机，包里的饭盒压到电脑边角，一张便利贴蹭出来。',
  action: '林晚在电梯里低头翻手机，一张便利贴从包里飘出来，她拿起看，纸条上写着“中午热一下，不要吃凉的”，她面露烦躁，电梯开门后走出电梯。',
  result: '电梯到达一楼，门即将打开，林晚将便利贴随手塞进电脑夹层。',
  atmosphere: '电梯内冷白灯光，安静压抑。',
  duration: 15,
}

runTest('default video prompt includes dialogue and narration', () => {
  const prompt = buildDefaultVideoPrompt(storyboard)

  assert.match(prompt, /对白\/旁白：旁白：山门外的钟声骤然响起。/)
  assert.match(prompt, /顾玄：别慌，先看阵眼。/)
})

runTest('pending video placeholder is hidden when an existing video is playable', () => {
  assert.equal(shouldShowVideoPendingPlaceholder({
    pendingVideo: true,
    videoUrl: 'https://cdn.example.com/current.mp4',
  }), false)
})

runTest('pending video placeholder is shown when no existing video is playable', () => {
  assert.equal(shouldShowVideoPendingPlaceholder({
    pendingVideo: true,
    videoUrl: '',
  }), true)
  assert.equal(shouldShowVideoPendingPlaceholder({
    pendingVideo: false,
    videoUrl: '',
  }), false)
})

runTest('video generation payload appends dialogue when custom video prompt omits it', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
  })

  assert.match(payload.prompt, /shot 9 video/)
  assert.match(payload.prompt, /对白\/旁白：旁白：山门外的钟声骤然响起。/)
  assert.match(payload.prompt, /顾玄：别慌，先看阵眼。/)
})

runTest('default video prompt adds shot boundary, end-state and risky motion guardrails', () => {
  const prompt = buildDefaultVideoPrompt(elevatorStoryboard)

  assert.match(prompt, /起始画面/)
  assert.match(prompt, /主体与场景/)
  assert.match(prompt, /镜头限制/)
  assert.match(prompt, /固定中景/)
  assert.match(prompt, /镜头1/)
  assert.match(prompt, /结束画面：电梯到达一楼，门即将打开/)
  assert.match(prompt, /画质与风格/)
  assert.match(prompt, /不要生成字幕、Logo、水印或 UI/)
  assert.match(prompt, /不要生成同款分身/)
  assert.match(prompt, /如果动作描述与结束画面冲突，以结束画面为准/)
  assert.match(prompt, /不要提前完成下一镜头动作/)
  assert.match(prompt, /不要跟拍离开当前地点/)
  assert.match(prompt, /小物件按重力从包口滑出或露出/)
  assert.doesNotMatch(prompt, /0-3秒/)
  assert.doesNotMatch(prompt, /<\/?(?:location|role|voice)>/)
})

runTest('video generation payload wraps custom prompts with continuity guardrails', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...elevatorStoryboard,
      video_prompt: '固定中景，林晚看完便利贴后电梯门打开，她走出电梯。',
    },
    dramaId: 30,
  })

  assert.match(payload.prompt, /原始镜头意图/)
  assert.match(payload.prompt, /林晚看完便利贴后电梯门打开，她走出电梯/)
  assert.match(payload.prompt, /结束画面：电梯到达一楼，门即将打开/)
  assert.match(payload.prompt, /如果动作描述与结束画面冲突，以结束画面为准/)
  assert.match(payload.prompt, /不要提前完成下一镜头动作/)
})

runTest('legacy structured video prompts missing Seedance sections are upgraded', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...elevatorStoryboard,
      video_prompt: [
        '起始画面：林晚在电梯里低头看手机。',
        '镜头限制：固定中景。',
        '结束画面：电梯门即将打开。',
        '禁止项：不要切到大厅。',
      ].join('\n'),
    },
    dramaId: 30,
  })

  assert.match(payload.prompt, /主体与场景/)
  assert.match(payload.prompt, /画质与风格/)
  assert.match(payload.prompt, /原始镜头意图/)
  assert.match(payload.prompt, /起始画面：林晚在电梯里低头看手机/)
})

runTest('capture mode keeps captured first frame and current tail frame', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
    override: {
      reference_mode: 'capture',
      first_frame_url: 'captured-frame.png',
    },
  })

  assert.equal(payload.reference_mode, 'first_last')
  assert.equal(payload.first_frame_url, 'captured-frame.png')
  assert.equal(payload.last_frame_url, 'current-last.png')
  assert.equal(payload.image_url, undefined)
})

runTest('capture mode falls back to single image when no tail frame exists', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...storyboard,
      last_frame_image: '',
    },
    dramaId: 3,
    override: {
      reference_mode: 'capture',
      first_frame_url: 'captured-frame.png',
    },
  })

  assert.equal(payload.reference_mode, 'single')
  assert.equal(payload.image_url, 'captured-frame.png')
  assert.equal(payload.first_frame_url, undefined)
  assert.equal(payload.last_frame_url, undefined)
})

runTest('multimodal mode can include a captured frame as a reference image', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['manual-image.png'],
      reference_video_urls: ['motion-ref.mp4'],
      reference_audio_urls: ['voice-ref.mp3'],
    },
  })

  assert.equal(payload.reference_mode, 'multimodal')
  assert.deepEqual(payload.reference_image_urls, ['captured-frame.png', 'manual-image.png'])
  assert.deepEqual(payload.reference_video_urls, ['motion-ref.mp4'])
  assert.deepEqual(payload.reference_audio_urls, ['voice-ref.mp3'])
  assert.equal(payload.first_frame_url, undefined)
  assert.equal(payload.image_url, undefined)
})

runTest('multimodal payload binds numbered reference materials inside the prompt', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: elevatorStoryboard,
    dramaId: 30,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['lin-wan.png', 'elevator.png'],
      reference_video_urls: ['motion-ref.mp4'],
      reference_audio_urls: ['voice-ref.mp3'],
      reference_image_bindings: [
        { url: 'captured-frame.png', label: '上一镜头结尾帧', source: 'capture' },
        { url: 'lin-wan.png', label: '林晚', source: 'character' },
        { url: 'elevator.png', label: '公寓电梯', source: 'scene' },
      ],
      reference_video_bindings: [
        { url: 'motion-ref.mp4', label: '低头抽便利贴动作', source: 'upload' },
      ],
      reference_audio_bindings: [
        { url: 'voice-ref.mp3', label: '林晚呼吸声', source: 'upload' },
      ],
    },
  })

  assert.match(payload.prompt, /参考素材绑定/)
  assert.match(payload.prompt, /图片1定义为上一镜头截帧\/首图衔接参考/)
  assert.match(payload.prompt, /将图片2中的人物定义为林晚/)
  assert.match(payload.prompt, /图片3定义为公寓电梯/)
  assert.match(payload.prompt, /视频1定义为低头抽便利贴动作/)
  assert.match(payload.prompt, /音频1定义为林晚呼吸声/)
  assert.match(payload.prompt, /不要让角色图、场景图、动作参考或音频参考互相混用/)
  assert.doesNotMatch(payload.prompt, /<\/?(?:location|role|voice)>/)
})

runTest('multimodal payload replaces stale numbered bindings with final reference order', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...elevatorStoryboard,
      video_prompt: [
        '参考素材绑定：',
        '将图片1中的人物定义为林晚，旧编号。',
        '图片2定义为公寓电梯，旧编号。',
        '主体与场景：林晚在公寓电梯内。',
        '起始画面：林晚低头看手机。',
        '镜头限制：固定中景。',
        '结束画面：电梯门即将打开。',
        '画质与风格：真实短剧电影感。',
        '约束与禁止项：不要切到大厅。',
      ].join('\n'),
    },
    dramaId: 30,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['lin-wan.png', 'elevator.png'],
      reference_image_bindings: [
        { url: 'captured-frame.png', label: '上一镜头结尾帧', source: 'capture' },
        { url: 'lin-wan.png', label: '林晚', source: 'character' },
        { url: 'elevator.png', label: '公寓电梯', source: 'scene' },
      ],
    },
  })

  assert.match(payload.prompt, /图片1定义为上一镜头截帧\/首图衔接参考/)
  assert.match(payload.prompt, /将图片2中的人物定义为林晚/)
  assert.match(payload.prompt, /图片3定义为公寓电梯/)
  assert.doesNotMatch(payload.prompt, /旧编号/)
})

runTest('multimodal payload binds each character separately after a captured continuity frame', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: {
      ...elevatorStoryboard,
      location: '公司走廊',
      video_prompt: '主体与场景：林晚和林建国站在公司走廊内。\n起始画面：两人停在走廊中。\n镜头限制：固定中景。\n结束画面：林晚看向林建国。\n画质与风格：真实短剧电影感。\n约束与禁止项：不要切走。',
    },
    dramaId: 30,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['lin-wan.png', 'lin-jianguo.png', 'office-corridor.png'],
      reference_image_bindings: [
        { url: 'captured-frame.png', label: '上一镜头结尾帧', source: 'capture' },
        { url: 'lin-wan.png', label: '林晚', source: 'character' },
        { url: 'lin-jianguo.png', label: '林建国', source: 'character' },
        { url: 'office-corridor.png', label: '公司走廊', source: 'scene' },
      ],
    },
  })

  assert.match(payload.prompt, /图片1定义为上一镜头截帧\/首图衔接参考/)
  assert.match(payload.prompt, /将图片2中的人物定义为林晚/)
  assert.match(payload.prompt, /将图片3中的人物定义为林建国/)
  assert.match(payload.prompt, /图片4定义为公司走廊/)
  assert.doesNotMatch(payload.prompt, /人物参考定义为林晚/)
})

runTest('dynamic multimodal binding plan follows final material order and exposes metadata', () => {
  const plan = buildDynamicMultimodalReferenceBindingPlan({
    imageUrls: ['captured-frame.png', 'lin-wan.png', 'lin-jianguo.png', 'office-corridor.png'],
    videoUrls: ['motion-ref.mp4'],
    audioUrls: ['voice-ref.mp3'],
    override: {
      reference_image_bindings: [
        { url: 'captured-frame.png', label: '上一镜头结尾帧', source: 'capture' },
        { url: 'lin-wan.png', label: '林晚', source: 'character' },
        { url: 'lin-jianguo.png', label: '林建国', source: 'character' },
        { url: 'office-corridor.png', label: '公司走廊', source: 'scene' },
      ],
      reference_video_bindings: [
        { url: 'motion-ref.mp4', label: '低头抽便利贴动作', source: 'upload' },
      ],
      reference_audio_bindings: [
        { url: 'voice-ref.mp3', label: '林晚呼吸声', source: 'upload' },
      ],
    },
  })

  assert.deepEqual(plan.imageMaterials.map(item => [item.ordinal, item.url, item.label, item.source]), [
    [1, 'captured-frame.png', '上一镜头结尾帧', 'capture'],
    [2, 'lin-wan.png', '林晚', 'character'],
    [3, 'lin-jianguo.png', '林建国', 'character'],
    [4, 'office-corridor.png', '公司走廊', 'scene'],
  ])
  assert.deepEqual(plan.videoMaterials.map(item => [item.ordinal, item.url, item.label]), [
    [1, 'motion-ref.mp4', '低头抽便利贴动作'],
  ])
  assert.deepEqual(plan.audioMaterials.map(item => [item.ordinal, item.url, item.label]), [
    [1, 'voice-ref.mp3', '林晚呼吸声'],
  ])
  assert.match(plan.prompt, /图片1定义为上一镜头截帧\/首图衔接参考/)
  assert.match(plan.prompt, /将图片2中的人物定义为林晚/)
  assert.match(plan.prompt, /将图片3中的人物定义为林建国/)
  assert.match(plan.prompt, /图片4定义为公司走廊/)
  assert.match(plan.prompt, /视频1定义为低头抽便利贴动作/)
  assert.match(plan.prompt, /音频1定义为林晚呼吸声/)
})

runTest('multimodal payload infers capture binding when first frame metadata is missing', () => {
  const payload = buildVideoGeneratePayload({
    storyboard: elevatorStoryboard,
    dramaId: 30,
    override: {
      reference_mode: 'multimodal',
      first_frame_url: 'captured-frame.png',
      reference_image_urls: ['lin-wan.png'],
      reference_image_bindings: [
        { url: 'lin-wan.png', label: '林晚', source: 'character' },
      ],
    },
  })

  assert.match(payload.prompt, /图片1定义为上一镜头截帧\/首图衔接参考/)
  assert.match(payload.prompt, /将图片2中的人物定义为林晚/)
  assert.doesNotMatch(payload.prompt, /将图片1中的人物定义为林晚/)
})

runTest('multimodal payload adds conservative bindings when reference metadata is missing', () => {
  const payload = buildVideoGeneratePayload({
    storyboard,
    dramaId: 3,
    override: {
      reference_mode: 'multimodal',
      reference_image_urls: ['manual-image.png'],
      reference_video_urls: ['manual-video.mp4'],
    },
  })

  assert.match(payload.prompt, /参考素材绑定/)
  assert.match(payload.prompt, /图片1定义为参考图1/)
  assert.match(payload.prompt, /视频1定义为参考视频1/)
  assert.match(payload.prompt, /仅参考画面主体、构图、光线或质感/)
  assert.doesNotMatch(payload.prompt, /<\/?(?:location|role|voice)>/)
})

runTest('reference mode guidance distinguishes continuity control from multimodal references', () => {
  assert.match(getReferenceModeGuidance('capture'), /衔接/)
  assert.match(getReferenceModeGuidance('capture'), /首尾帧/)
  assert.match(getReferenceModeGuidance('multimodal'), /普通参考/)
  assert.match(getReferenceModeGuidance('multimodal'), /不等同于强首帧/)
  assert.match(getReferenceModeGuidance('multimodal'), /3-5/)
})

runTest('multimodal reference options use current storyboard scene and generated character images only', () => {
  const options = buildMultimodalReferenceOptions({
    storyboard: {
      id: 22,
      scene_id: 3,
      character_ids: [7, 8],
    },
    chars: [
      { id: 7, name: 'Lead', character_asset_image_url: 'lead-asset.png', image_url: 'lead-generated.png' },
      { id: 8, name: 'Support', image_url: 'support.png' },
      { id: 9, name: 'Other', image_url: 'other.png' },
    ],
    scenes: [
      { id: 3, location: 'Atrium', image_url: 'atrium.png' },
      { id: 4, location: 'Street', image_url: 'street.png' },
    ],
  })

  assert.deepEqual(options.map(item => item.url), [
    'lead-generated.png',
    'support.png',
    'atrium.png',
  ])
  assert.deepEqual(options.map(item => item.source), ['character', 'character', 'scene'])
})

runTest('all multimodal reference options include unbound character and scene images', () => {
  const options = buildAllMultimodalReferenceOptions({
    chars: [
      { id: 7, name: 'Lead', image_url: 'lead-generated.png' },
      { id: 8, name: 'Support', image_url: 'support.png' },
      { id: 9, name: 'Other', image_url: 'other.png' },
      { id: 10, name: 'No image' },
    ],
    scenes: [
      { id: 3, location: 'Atrium', image_url: 'atrium.png' },
      { id: 4, location: 'Street', image_url: 'street.png' },
      { id: 5, location: 'Blank' },
    ],
  })

  assert.deepEqual(options.map(item => item.url), [
    'lead-generated.png',
    'support.png',
    'other.png',
    'atrium.png',
    'street.png',
  ])
  assert.deepEqual(options.map(item => item.source), ['character', 'character', 'character', 'scene', 'scene'])
})
