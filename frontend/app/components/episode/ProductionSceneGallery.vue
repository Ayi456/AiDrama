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

<style scoped>
.scene-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.scene-gallery__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-radius: 26px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background:
    radial-gradient(circle at top right, rgba(92, 133, 238, 0.18), transparent 32%),
    linear-gradient(135deg, rgba(255,255,255,0.96), rgba(243,248,255,0.86));
  box-shadow: 0 18px 40px rgba(18, 35, 71, 0.08);
}

.scene-gallery__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 700px;
}

.scene-gallery__kicker {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(19, 51, 121, 0.72);
}

.scene-gallery__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.scene-gallery__title {
  font-size: 25px;
  line-height: 1;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}

.scene-gallery__count {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  color: rgba(19, 51, 121, 0.88);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.scene-gallery__desc {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
}

.scene-gallery__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.scene-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
  align-items: start;
}

.scene-gallery__card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(245,249,255,0.82));
  box-shadow: 0 18px 36px rgba(18, 35, 71, 0.08);
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
}

.scene-gallery__card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(145deg, rgba(255,255,255,0.6), transparent 42%);
}

.scene-gallery__card > * {
  position: relative;
  z-index: 1;
}

.scene-gallery__card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 46px rgba(18, 35, 71, 0.12);
}

.scene-gallery__cover {
  position: relative;
  aspect-ratio: 1.52;
  overflow: hidden;
  border-bottom: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(229,236,248,0.9), rgba(208,220,241,0.82));
}

.scene-gallery__cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(8, 14, 24, 0.02), rgba(8, 14, 24, 0.34));
}

.scene-gallery__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
  transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out);
}

.scene-gallery__image:hover {
  transform: scale(1.015);
  filter: saturate(1.04);
}

.scene-gallery__empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(19, 51, 121, 0.76);
  background:
    radial-gradient(circle at 20% 20%, rgba(93, 132, 235, 0.18), transparent 36%),
    linear-gradient(180deg, rgba(244,248,255,0.96), rgba(226,235,247,0.88));
}

.scene-gallery__empty-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.scene-gallery__cover-meta {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  z-index: 2;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.scene-gallery__cover-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scene-gallery__cover-kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.76);
}

.scene-gallery__cover-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
  color: #fff;
  font-family: var(--font-display);
  text-shadow: 0 10px 22px rgba(0,0,0,0.24);
}

.scene-gallery__cover-time {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.16);
  border: 1px solid rgba(255,255,255,0.18);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  backdrop-filter: blur(12px);
}

.scene-gallery__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7, 11, 21, 0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.scene-gallery__badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}

.scene-gallery__badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}

.scene-gallery__body {
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scene-gallery__body-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.scene-gallery__body-title {
  font-size: 16px;
  line-height: 1.15;
  font-weight: 600;
  color: var(--text-0);
}

.scene-gallery__body-sub {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
}

.scene-gallery__chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.1);
  color: rgba(19, 51, 121, 0.88);
  font-size: 10px;
  font-weight: 700;
}

.scene-gallery__chip.is-ready {
  background: rgba(36, 125, 72, 0.1);
  border-color: rgba(36, 125, 72, 0.14);
  color: rgba(36, 125, 72, 0.96);
}

.scene-gallery__chip.is-pending {
  background: rgba(19, 51, 121, 0.14);
  border-color: rgba(19, 51, 121, 0.18);
  color: rgba(19, 51, 121, 0.96);
}

.scene-gallery__body-desc {
  font-size: 12px;
  line-height: 1.68;
  color: var(--text-2);
}

.scene-gallery__prompt {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(250,252,255,0.98), rgba(242,246,252,0.92));
  border: 1px solid rgba(27, 41, 64, 0.08);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.86);
}

.scene-gallery__prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.scene-gallery__prompt-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.scene-gallery__prompt-tip {
  font-size: 10px;
  color: var(--text-3);
}

.scene-gallery__prompt-input {
  width: 100%;
  min-height: 116px;
  resize: vertical;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-1);
  font-family: inherit;
  outline: none;
}

.scene-gallery__foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.38), rgba(246,249,255,0.78));
}

.scene-gallery__status {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.scene-gallery__status-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
}

.scene-gallery__status-note {
  max-width: 220px;
  font-size: 10px;
  line-height: 1.5;
  color: var(--text-3);
}

.scene-gallery__action {
  min-width: 94px;
  justify-content: center;
  border: none;
  border-radius: 14px;
  padding-left: 14px;
  padding-right: 14px;
  background: linear-gradient(135deg, #20438f, #3f69cb);
  color: #fff;
  box-shadow: 0 12px 24px rgba(32, 67, 143, 0.2);
}

.scene-gallery__action:hover:not(:disabled) {
  filter: brightness(1.04);
}

.scene-gallery__action:disabled {
  background: rgba(32, 67, 143, 0.24);
  color: rgba(255,255,255,0.92);
  box-shadow: none;
}

@media (max-width: 1240px) {
  .scene-gallery__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .scene-gallery__actions {
    margin-left: 0;
  }

  .scene-gallery__grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  }
}

@media (max-width: 860px) {
  .scene-gallery__grid {
    grid-template-columns: 1fr;
  }

  .scene-gallery__title {
    font-size: 21px;
  }

  .scene-gallery__cover-meta {
    flex-direction: column;
    align-items: flex-start;
  }

  .scene-gallery__foot {
    flex-direction: column;
    align-items: stretch;
  }

  .scene-gallery__status-note {
    max-width: none;
  }

  .scene-gallery__action {
    width: 100%;
  }
}
</style>
