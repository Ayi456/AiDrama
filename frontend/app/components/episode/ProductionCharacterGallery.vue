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

<style>
@import url('~/assets/production-character-gallery.css');
</style>
