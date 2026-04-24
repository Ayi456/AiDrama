<template>
  <div class="step-editor">
    <div class="step-toolbar">
      <div class="toolbar-left">
        <div class="step-indicator">
          <span class="step-num">04</span>
          <span class="step-name">分镜列表</span>
        </div>
      </div>
      <div class="toolbar-right">
        <span v-if="sbs.length" class="char-count">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
        <button v-if="sbs.length" class="btn btn-sm" @click="emit('add-shot')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加
        </button>
        <template v-if="!sbs.length">
          <span class="locked-config">视频模型 · {{ lockedVideoConfigLabel }}</span>
        </template>
        <button class="btn btn-sm" :disabled="rn" @click="emit('breakdown')">
          <Loader2 v-if="rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
          <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          {{ sbs.length ? '重新拆解' : 'AI 拆解分镜' }}
        </button>
      </div>
    </div>

    <div v-if="sbs.length" class="split-layout">
      <div class="shot-list">
        <div class="shot-list-head">
          <div>
            <div class="shot-list-title">镜头序列</div>
            <div class="shot-list-sub">按镜头顺序检查内容与素材状态</div>
          </div>
          <span class="tag mono">{{ totalDuration }}s</span>
        </div>
        <div class="shot-list-body">
          <div
            v-for="(sb, i) in sbs"
            :key="sb.id"
            :class="['shot-item', { active: selectedSb?.id === sb.id }]"
            @click="emit('select-shot', sb)"
          >
            <div class="shot-item-header">
              <div class="shot-item-labels">
                <div class="shot-num">#{{ String(i + 1).padStart(2, '0') }}</div>
                <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
                <span v-if="getStoryboardCharacterIds(sb).length" class="tag" style="font-size:10px">{{ getStoryboardCharacterIds(sb).length }} 角色</span>
              </div>
              <div class="shot-item-status-wrap">
                <span :class="['shot-state-pill', getStoryboardStateClass(sb)]">{{ getStoryboardStateText(sb) }}</span>
                <div class="shot-status">
                  <div v-if="sb.imageUrl || sb.composedImage || sb.firstFrameImage" class="shot-dot has-img" title="已生成图片"></div>
                  <div v-if="sb.videoUrl || sb.composedVideoUrl" class="shot-dot has-video" title="已生成视频"></div>
                  <div v-if="sb.dialogue" class="shot-dot has-dialogue" title="有对白"></div>
                </div>
              </div>
            </div>
            <div class="shot-body">
              <div class="shot-desc">{{ sb.description || sb.title || '无描述' }}</div>
            </div>
            <div class="shot-meta">
              <span class="mono dim" style="font-size:10px">{{ sb.duration || 10 }}s</span>
              <span v-if="sb.location" class="shot-location">{{ sb.location }}</span>
              <span v-if="getStoryboardCharacterNames(sb).length" class="shot-location">{{ getStoryboardCharacterNames(sb).join(' / ') }}</span>
              <span v-if="sb.dialogue" class="shot-dialogue">{{ sb.dialogue }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-panel" v-if="selectedSb">
        <div class="detail-head">
          <div class="detail-head-copy">
            <span class="detail-head-title">镜头 #{{ selectedShotNumber }}</span>
            <span class="detail-head-sub">{{ selectedSb.title || `镜头 ${selectedShotNumber}` }} · {{ selectedSb.shot_type || selectedSb.shotType || '未设置景别' }}</span>
          </div>
          <div class="detail-head-status">
            <span class="tag mono">{{ selectedSb.duration || 10 }}s</span>
            <span :class="['detail-head-pill', getStoryboardStateClass(selectedSb)]">{{ getStoryboardStateText(selectedSb) }}</span>
          </div>
          <button class="btn btn-ghost btn-icon" style="color:var(--error)" @click="emit('delete-shot', selectedSb)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          </button>
        </div>
        <div class="detail-body">
          <div class="detail-hero">
            <div class="detail-hero-copy">
              <div class="detail-hero-label">镜头概览</div>
              <div class="detail-hero-text">{{ selectedSb.description || selectedSb.title || '当前镜头还没有画面描述，建议先补充核心动作和构图。' }}</div>
              <div class="detail-status-row">
                <span class="tag">{{ getSceneName(selectedSb) }}</span>
                <span class="tag">{{ selectedSb.angle || '未设角度' }}</span>
                <span class="tag">{{ selectedSb.movement || '未设运镜' }}</span>
                <span class="tag" :class="getFirstFrame(selectedSb) ? 'tag-success' : ''">首帧 {{ getFirstFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                <span class="tag" :class="getLastFrame(selectedSb) ? 'tag-success' : ''">尾帧 {{ getLastFrame(selectedSb) ? '已生成' : '待生成' }}</span>
                <span class="tag" :class="hasVid(selectedSb) ? 'tag-success' : ''">视频 {{ hasVid(selectedSb) ? '已生成' : '待生成' }}</span>
              </div>
            </div>
            <div class="detail-preview-grid">
              <div class="detail-preview-card">
                <div class="detail-preview-title">首帧</div>
                <div class="detail-preview-media">
                  <img
                    v-if="getFirstFrame(selectedSb)"
                    :src="'/' + getFirstFrame(selectedSb)"
                    class="previewable-image"
                    @click.stop="openViewer(getFirstFrame(selectedSb), `镜头 #${selectedShotNumber} 首帧`)"
                  />
                  <div v-else class="detail-preview-empty">待生成</div>
                </div>
              </div>
              <div class="detail-preview-card">
                <div class="detail-preview-title">尾帧</div>
                <div class="detail-preview-media">
                  <img
                    v-if="getLastFrame(selectedSb)"
                    :src="'/' + getLastFrame(selectedSb)"
                    class="previewable-image"
                    @click.stop="openViewer(getLastFrame(selectedSb), `镜头 #${selectedShotNumber} 尾帧`)"
                  />
                  <div v-else class="detail-preview-empty">待生成</div>
                </div>
              </div>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-section-head">
              <span class="detail-section-title">镜头结构</span>
              <span class="detail-section-copy">景别、角度、运镜、场景绑定和时长</span>
            </div>
            <div class="field-grid field-grid-4">
              <label class="field">
                <span class="field-label">标题</span>
                <input :value="selectedSb.title || ''" class="input" @blur="updateSelected('title', $event.target.value)" placeholder="如：雪地逼近" />
              </label>
              <label class="field">
                <span class="field-label">景别</span>
                <input
                  list="shot-type-list"
                  :value="selectedSb.shot_type || selectedSb.shotType || ''"
                  class="input"
                  placeholder="选择或输入景别"
                  @change="updateSelected('shot_type', $event.target.value)"
                />
                <datalist id="shot-type-list">
                  <option v-for="shotType in shotTypes" :key="shotType" :value="shotType" />
                </datalist>
              </label>
              <label class="field">
                <span class="field-label">角度</span>
                <input
                  list="shot-angle-list"
                  :value="selectedSb.angle || ''"
                  class="input"
                  placeholder="选择或输入角度"
                  @change="updateSelected('angle', $event.target.value)"
                />
                <datalist id="shot-angle-list">
                  <option v-for="shotAngle in shotAngles" :key="shotAngle" :value="shotAngle" />
                </datalist>
              </label>
              <label class="field">
                <span class="field-label">运镜</span>
                <input
                  list="shot-movement-list"
                  :value="selectedSb.movement || ''"
                  class="input"
                  placeholder="选择或输入运镜"
                  @change="updateSelected('movement', $event.target.value)"
                />
                <datalist id="shot-movement-list">
                  <option v-for="shotMovement in shotMovements" :key="shotMovement" :value="shotMovement" />
                </datalist>
              </label>
            </div>
            <div class="field-grid field-grid-4">
              <label class="field">
                <span class="field-label">绑定角色</span>
                <div class="role-pills">
                  <button
                    v-for="char in chars"
                    :key="char.id"
                    type="button"
                    :class="['role-pill', { active: isCharacterSelected(char.id) }]"
                    @click="emit('toggle-storyboard-character', { sb: selectedSb, charId: char.id })"
                  >
                    {{ char.name }}
                  </button>
                  <span v-if="!chars.length" class="dim" style="font-size:12px">当前集还没有角色</span>
                </div>
              </label>
              <label class="field">
                <span class="field-label">绑定场景</span>
                <select class="input" :value="selectedSb.scene_id || selectedSb.sceneId || ''" @change="updateSelected('scene_id', $event.target.value ? Number($event.target.value) : null)">
                  <option value="">未绑定场景</option>
                  <option v-for="scene in scenes" :key="scene.id" :value="scene.id">
                    {{ scene.location }} · {{ scene.time || '未设时间' }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span class="field-label">地点</span>
                <input :value="selectedSb.location || ''" class="input" @blur="updateSelected('location', $event.target.value)" placeholder="场景地点" />
              </label>
              <label class="field">
                <span class="field-label">时间</span>
                <input :value="selectedSb.time || ''" class="input" @blur="updateSelected('time', $event.target.value)" placeholder="如：深夜 / 清晨" />
              </label>
              <label class="field">
                <span class="field-label">时长</span>
                <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60" @blur="updateSelected('duration', Number($event.target.value))" />
              </label>
            </div>
          </div>
          <div class="detail-section">
            <div class="detail-section-head">
              <span class="detail-section-title">画面语义</span>
              <span class="detail-section-copy">动作、结果、氛围和对白</span>
            </div>
            <div class="field-grid field-grid-2">
              <label class="field">
                <span class="field-label">动作</span>
                <textarea :value="selectedSb.action || ''" class="textarea" rows="3" @blur="updateSelected('action', $event.target.value)" placeholder="谁在做什么，表情和动作细节是什么" />
              </label>
              <label class="field">
                <span class="field-label">结果</span>
                <textarea :value="selectedSb.result || ''" class="textarea" rows="3" @blur="updateSelected('result', $event.target.value)" placeholder="镜头结束时的状态变化或画面结果" />
              </label>
            </div>
            <div class="field-grid field-grid-2">
              <label class="field">
                <span class="field-label">画面描述</span>
                <textarea :value="selectedSb.description || ''" class="textarea" rows="4" @blur="updateSelected('description', $event.target.value)" placeholder="描述画面内容..." />
              </label>
              <label class="field">
                <span class="field-label">氛围</span>
                <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="4" @blur="updateSelected('atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
              </label>
            </div>
            <label class="field">
              <span class="field-label">对白 / 旁白</span>
              <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="3" @blur="updateSelected('dialogue', $event.target.value)" placeholder="角色名：台词内容 或 旁白：内容" />
            </label>
          </div>
          <div class="detail-section">
            <div class="detail-section-head">
              <span class="detail-section-title">生成提示</span>
              <span class="detail-section-copy">分别服务图片、视频、配乐和音效生成</span>
            </div>
            <label class="field">
              <span class="field-label">静态画面提示词</span>
              <textarea :value="selectedSb.image_prompt || selectedSb.imagePrompt || ''" class="textarea" rows="4" @blur="updateSelected('image_prompt', $event.target.value)" placeholder="用于首帧、尾帧和镜头图片的单帧画面提示词" />
            </label>
            <label class="field">
              <span class="field-label">视频提示词</span>
              <textarea :value="selectedSb.video_prompt || selectedSb.videoPrompt || ''" class="textarea" rows="5" @blur="updateSelected('video_prompt', $event.target.value)" placeholder="按 3 秒分段的视频提示词..." />
            </label>
            <div class="field-grid field-grid-2">
              <label class="field">
                <span class="field-label">配乐提示词</span>
                <textarea :value="selectedSb.bgm_prompt || selectedSb.bgmPrompt || ''" class="textarea" rows="3" @blur="updateSelected('bgm_prompt', $event.target.value)" placeholder="如：压抑低频弦乐，缓慢推进" />
              </label>
              <label class="field">
                <span class="field-label">音效提示词</span>
                <textarea :value="selectedSb.sound_effect || selectedSb.soundEffect || ''" class="textarea" rows="3" @blur="updateSelected('sound_effect', $event.target.value)" placeholder="如：风雪声、脚踩积雪、衣料摩擦声" />
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="rn && rt === 'storyboard_breaker'" class="step-loading">
      <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
      <div class="loading-text">正在拆解分镜并生成提示词...</div>
    </div>

    <div v-else class="step-empty">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
          <rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/>
        </svg>
      </div>
      <div class="empty-title">将剧本拆解为分镜序列</div>
      <div class="empty-desc">AI 自动分析剧本，生成镜头列表和视频提示词</div>
      <div class="locked-config-banner">当前集视频模型：{{ lockedVideoConfigLabel }}</div>
      <button class="btn btn-primary" @click="emit('breakdown')">
        <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
        <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        AI 拆解分镜
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  rn: {
    type: Boolean,
    default: false,
  },
  rt: {
    type: String,
    default: '',
  },
  sbs: {
    type: Array,
    default: () => [],
  },
  totalDuration: {
    type: Number,
    default: 0,
  },
  lockedVideoConfigLabel: {
    type: String,
    default: '',
  },
  selectedSb: {
    type: Object,
    default: null,
  },
  chars: {
    type: Array,
    default: () => [],
  },
  scenes: {
    type: Array,
    default: () => [],
  },
  shotTypes: {
    type: Array,
    default: () => [],
  },
  shotAngles: {
    type: Array,
    default: () => [],
  },
  shotMovements: {
    type: Array,
    default: () => [],
  },
  getStoryboardCharacterIds: {
    type: Function,
    default: () => [],
  },
  getStoryboardCharacterNames: {
    type: Function,
    default: () => [],
  },
  getStoryboardStateClass: {
    type: Function,
    default: () => '',
  },
  getStoryboardStateText: {
    type: Function,
    default: () => '',
  },
  getSceneName: {
    type: Function,
    default: () => '',
  },
  getFirstFrame: {
    type: Function,
    default: () => null,
  },
  getLastFrame: {
    type: Function,
    default: () => null,
  },
  hasVid: {
    type: Function,
    default: () => false,
  },
})

const emit = defineEmits(['add-shot', 'breakdown', 'select-shot', 'delete-shot', 'toggle-storyboard-character', 'update-shot-field', 'open-image-viewer'])

const selectedShotNumber = computed(() => {
  if (!props.selectedSb) return 0
  return props.sbs.findIndex(sb => sb.id === props.selectedSb.id) + 1
})

function updateSelected(field, value) {
  if (!props.selectedSb) return
  emit('update-shot-field', { sb: props.selectedSb, field, value })
}

function isCharacterSelected(charId) {
  if (!props.selectedSb) return false
  return props.getStoryboardCharacterIds(props.selectedSb).includes(charId)
}

function openViewer(src, title) {
  if (!src) return
  emit('open-image-viewer', { src: `/${src}`, title })
}
</script>
