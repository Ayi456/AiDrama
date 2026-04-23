<template>
  <div class="scene-gallery">
    <div class="scene-gallery__toolbar">
      <div class="scene-gallery__copy">
        <span class="scene-gallery__kicker">Scene Canvas</span>
        <div class="scene-gallery__title-row">
          <span class="scene-gallery__title">场景图片画廊</span>
          <span class="scene-gallery__count">{{ scenes.length }} 个场景</span>
        </div>
        <div class="scene-gallery__desc">每张卡片里的图片提示词都会直接参与下一次生成，用它来控制光线、天气、材质和整体氛围。</div>
      </div>
      <div class="scene-gallery__actions">
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <button class="btn btn-sm" @click="emit('batch-generate')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          批量生成
        </button>
      </div>
    </div>

    <div class="scene-gallery__grid">
      <article v-for="scene in scenes" :key="scene.id" class="scene-gallery__card">
        <div class="scene-gallery__cover">
          <img
            v-if="hasSceneImage(scene)"
            :src="'/' + getSceneImage(scene)"
            class="scene-gallery__image"
            @click.stop="openSceneImage(scene)"
          />
          <div v-else class="scene-gallery__empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span class="scene-gallery__empty-text">等待生成场景图</span>
          </div>

          <div class="scene-gallery__cover-meta">
            <div class="scene-gallery__cover-copy">
              <span class="scene-gallery__cover-kicker">Scene</span>
              <span class="scene-gallery__cover-title">{{ scene.location }}</span>
            </div>
            <span class="scene-gallery__cover-time">{{ scene.time || '未设时间' }}</span>
          </div>

          <span class="scene-gallery__badge" :class="hasSceneImage(scene) ? 'is-ready' : (isPendingSceneImage(scene.id) ? 'is-pending' : '')">
            {{ hasSceneImage(scene) ? '已生成' : (isPendingSceneImage(scene.id) ? '生成中' : '待生成') }}
          </span>
        </div>

        <div class="scene-gallery__body">
          <div class="scene-gallery__body-top">
            <div>
              <div class="scene-gallery__body-title">{{ scene.location }}</div>
              <div class="scene-gallery__body-sub">{{ scene.time || '时间未填写' }}</div>
            </div>
            <span :class="['scene-gallery__chip', hasSceneImage(scene) && 'is-ready', isPendingSceneImage(scene.id) && 'is-pending']">
              {{ hasSceneImage(scene) ? '已出图' : (isPendingSceneImage(scene.id) ? '生成中' : '待出图') }}
            </span>
          </div>

          <div class="scene-gallery__body-desc">修改提示词后失焦自动保存；下一次生成会直接使用这里的内容。</div>

          <label class="scene-gallery__prompt">
            <div class="scene-gallery__prompt-head">
              <span class="scene-gallery__prompt-label">图片提示词</span>
              <span class="scene-gallery__prompt-tip">失焦自动保存</span>
            </div>
            <textarea
              class="scene-gallery__prompt-input"
              :value="scene.prompt || ''"
              rows="5"
              placeholder="这里的内容会直接用于场景图生成"
              @blur="emit('update-scene-field', { scene, field: 'prompt', value: $event.target.value })"
            />
          </label>
        </div>

        <div class="scene-gallery__foot">
          <div class="scene-gallery__status">
            <div class="scene-gallery__status-line">
              <span :class="['dot', hasSceneImage(scene) && 'ok', isPendingSceneImage(scene.id) && 'pending']" />
              <span>{{ hasSceneImage(scene) ? '已生成' : (isPendingSceneImage(scene.id) ? '生成中' : '待生成') }}</span>
            </div>
            <div class="scene-gallery__status-note">{{ hasSceneImage(scene) ? '再次生成会沿用当前提示词重新抽一张' : '首次生成将使用当前提示词直接出图' }}</div>
          </div>

          <button class="btn btn-sm scene-gallery__action" :disabled="isPendingSceneImage(scene.id)" @click="emit('generate', scene.id)">
            {{ getGenerateButtonLabel(scene) }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  scenes: {
    type: Array,
    default: () => [],
  },
  lockedImageConfigLabel: {
    type: String,
    default: '',
  },
  pendingSceneImageIds: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['batch-generate', 'generate', 'update-scene-field', 'open-image-viewer'])

function getSceneImage(scene) {
  return scene?.image_url || scene?.imageUrl || ''
}

function hasSceneImage(scene) {
  return !!getSceneImage(scene)
}

function isPendingSceneImage(id) {
  return props.pendingSceneImageIds.includes(id)
}

function getGenerateButtonLabel(scene) {
  if (isPendingSceneImage(scene.id)) return '生成中'
  return hasSceneImage(scene) ? '再生成' : '生成'
}

function openSceneImage(scene) {
  const src = getSceneImage(scene)
  if (!src) return
  emit('open-image-viewer', {
    src: `/${src}`,
    title: `${scene.location} 场景图`,
  })
}
</script>

<style>
@import url('~/assets/production-scene-gallery.css');
</style>
