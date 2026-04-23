<template>
  <div class="character-gallery">
    <div class="character-gallery__toolbar">
      <div class="character-gallery__copy">
        <span class="character-gallery__kicker">Character Board</span>
        <div class="character-gallery__title-row">
          <span class="character-gallery__title">角色形象画板</span>
          <span class="character-gallery__count">{{ characters.length }} 个待生成角色</span>
        </div>
        <div class="character-gallery__desc">这里管理角色形象首轮出图和再生成。旁白角色默认不进入图片生成，只保留声音链路。</div>
      </div>
      <div class="character-gallery__actions">
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <span v-if="hasNarratorOnly" class="tag">旁白仅保留声音</span>
        <button class="btn btn-sm" @click="emit('batch-generate')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          批量生成
        </button>
      </div>
    </div>

    <div class="character-gallery__grid">
      <article v-for="character in characters" :key="character.id" class="character-gallery__card">
        <div class="character-gallery__cover">
          <img
            v-if="hasCharacterImage(character)"
            :src="'/' + getCharacterImage(character)"
            class="character-gallery__image"
            @click.stop="openCharacterImage(character)"
          />
          <div v-else class="character-gallery__empty">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span class="character-gallery__empty-text">等待生成角色形象</span>
          </div>
          <span class="character-gallery__badge" :class="hasCharacterImage(character) ? 'is-ready' : (isPendingCharacterImage(character.id) ? 'is-pending' : '')">
            {{ hasCharacterImage(character) ? '已生成' : (isPendingCharacterImage(character.id) ? '生成中' : '待生成') }}
          </span>
        </div>

        <div class="character-gallery__body">
          <div class="character-gallery__head">
            <div>
              <div class="character-gallery__name">{{ character.name }}</div>
              <div class="character-gallery__role">{{ character.role || '角色' }}</div>
            </div>
            <span :class="['character-gallery__chip', hasCharacterImage(character) && 'is-ready', isPendingCharacterImage(character.id) && 'is-pending']">
              {{ hasCharacterImage(character) ? '已出图' : (isPendingCharacterImage(character.id) ? '生成中' : '待出图') }}
            </span>
          </div>
          <div class="character-gallery__note">{{ hasCharacterImage(character) ? '再次生成会沿用当前角色描述重新抽一张' : '首次生成会根据角色描述直接出图' }}</div>
        </div>

        <div class="character-gallery__foot">
          <div class="character-gallery__status">
            <span :class="['dot', hasCharacterImage(character) && 'ok', isPendingCharacterImage(character.id) && 'pending']" />
            <span>{{ hasCharacterImage(character) ? '已生成' : (isPendingCharacterImage(character.id) ? '生成中' : '待生成') }}</span>
          </div>
          <button class="btn btn-sm character-gallery__action" :disabled="isPendingCharacterImage(character.id)" @click="emit('generate', character.id)">
            {{ getGenerateButtonLabel(character) }}
          </button>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  characters: {
    type: Array,
    default: () => [],
  },
  lockedImageConfigLabel: {
    type: String,
    default: '',
  },
  pendingCharacterImageIds: {
    type: Array,
    default: () => [],
  },
  hasNarratorOnly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['batch-generate', 'generate', 'open-image-viewer'])

function getCharacterImage(character) {
  return character?.image_url || character?.imageUrl || ''
}

function hasCharacterImage(character) {
  return !!getCharacterImage(character)
}

function isPendingCharacterImage(id) {
  return props.pendingCharacterImageIds.includes(id)
}

function getGenerateButtonLabel(character) {
  if (isPendingCharacterImage(character.id)) return '生成中'
  return hasCharacterImage(character) ? '再生成' : '生成'
}

function openCharacterImage(character) {
  const src = getCharacterImage(character)
  if (!src) return
  emit('open-image-viewer', {
    src: `/${src}`,
    title: `${character.name} 角色形象`,
  })
}
</script>

<style scoped>
.character-gallery {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.character-gallery__toolbar {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
  border-radius: 26px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background:
    radial-gradient(circle at top left, rgba(39, 132, 116, 0.16), transparent 28%),
    linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,250,249,0.86));
  box-shadow: 0 18px 40px rgba(18, 35, 71, 0.08);
}

.character-gallery__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 700px;
}

.character-gallery__kicker {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(29, 112, 97, 0.72);
}

.character-gallery__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.character-gallery__title {
  font-size: 25px;
  line-height: 1;
  font-weight: 700;
  color: var(--text-0);
  font-family: var(--font-display);
}

.character-gallery__count {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(29, 112, 97, 0.08);
  color: rgba(29, 112, 97, 0.9);
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
}

.character-gallery__desc {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
}

.character-gallery__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.character-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
  align-items: start;
}

.character-gallery__card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  border: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,251,249,0.84));
  box-shadow: 0 18px 36px rgba(18, 35, 71, 0.08);
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
}

.character-gallery__card:hover {
  transform: translateY(-3px);
  box-shadow: 0 24px 46px rgba(18, 35, 71, 0.12);
}

.character-gallery__cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: linear-gradient(180deg, rgba(230, 240, 237, 0.92), rgba(217, 229, 225, 0.9));
}

.character-gallery__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: zoom-in;
  transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out);
}

.character-gallery__image:hover {
  transform: scale(1.018);
  filter: saturate(1.03);
}

.character-gallery__empty {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(29, 112, 97, 0.76);
  background:
    radial-gradient(circle at 25% 20%, rgba(39, 132, 116, 0.14), transparent 34%),
    linear-gradient(180deg, rgba(247,250,249,0.98), rgba(228,236,233,0.9));
}

.character-gallery__empty-text {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.character-gallery__badge {
  position: absolute;
  top: 10px;
  left: 10px;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(7, 11, 21, 0.58);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}

.character-gallery__badge.is-ready {
  background: rgba(36, 125, 72, 0.92);
}

.character-gallery__badge.is-pending {
  background: rgba(19, 51, 121, 0.92);
}

.character-gallery__body {
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.character-gallery__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.character-gallery__name {
  font-size: 16px;
  line-height: 1.15;
  font-weight: 700;
  color: var(--text-0);
}

.character-gallery__role {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
}

.character-gallery__chip {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(19, 51, 121, 0.08);
  border: 1px solid rgba(19, 51, 121, 0.1);
  color: rgba(19, 51, 121, 0.88);
  font-size: 10px;
  font-weight: 700;
}

.character-gallery__chip.is-ready {
  background: rgba(36, 125, 72, 0.1);
  border-color: rgba(36, 125, 72, 0.14);
  color: rgba(36, 125, 72, 0.96);
}

.character-gallery__chip.is-pending {
  background: rgba(19, 51, 121, 0.14);
  border-color: rgba(19, 51, 121, 0.18);
  color: rgba(19, 51, 121, 0.96);
}

.character-gallery__note {
  font-size: 12px;
  line-height: 1.62;
  color: var(--text-2);
}

.character-gallery__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(27, 41, 64, 0.08);
  background: linear-gradient(180deg, rgba(255,255,255,0.42), rgba(246,250,249,0.84));
}

.character-gallery__status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-1);
}

.character-gallery__action {
  min-width: 92px;
  justify-content: center;
}

@media (max-width: 1240px) {
  .character-gallery__toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .character-gallery__actions {
    margin-left: 0;
  }
}

@media (max-width: 860px) {
  .character-gallery__grid {
    grid-template-columns: 1fr;
  }

  .character-gallery__title {
    font-size: 21px;
  }
}
</style>
