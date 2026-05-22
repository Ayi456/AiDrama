<template>
  <div class="character-gallery">
    <div class="character-gallery__toolbar">
      <div class="character-gallery__copy">
        <span class="character-gallery__kicker">Character Board</span>
        <div class="character-gallery__title-row">
          <span class="character-gallery__title">角色形象画板</span>
        </div>
      </div>

      <div class="character-gallery__actions">
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <span v-if="hasNarratorOnly" class="tag">旁白仅保留声音</span>

        <div class="character-gallery__asset-upload">
          <label :class="['btn btn-sm character-gallery__upload-btn', assetBusy && 'is-disabled']" title="上传默认男主形象">
            <input
              class="character-gallery__replace-input"
              type="file"
              accept="image/*"
              :disabled="assetBusy"
              @change="handleAssetFile($event, 'male_lead')"
            />
            <ImagePlus :size="12" />
            男主形象
          </label>
          <label :class="['btn btn-sm character-gallery__upload-btn', assetBusy && 'is-disabled']" title="上传默认女主形象">
            <input
              class="character-gallery__replace-input"
              type="file"
              accept="image/*"
              :disabled="assetBusy"
              @change="handleAssetFile($event, 'female_lead')"
            />
            <ImagePlus :size="12" />
            女主形象
          </label>
          <label :class="['btn btn-sm character-gallery__upload-btn', assetBusy && 'is-disabled']" title="上传自定义角色形象">
            <input
              class="character-gallery__replace-input"
              type="file"
              accept="image/*"
              :disabled="assetBusy"
              @change="handleAssetFile($event, 'custom')"
            />
            <Upload :size="12" />
            自定义
          </label>
        </div>

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
            :src="assetUrl(getCharacterImage(character))"
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

          <label class="character-gallery__asset-bind">
            <span class="character-gallery__prompt-label">绑定形象</span>
            <select
              class="character-gallery__asset-select"
              :value="getBoundAssetId(character) || ''"
              :disabled="assetBusy || (!characterAssets.length && !getBoundAssetId(character))"
              @change="handleBindAsset(character, $event)"
            >
              <option value="">不绑定，使用角色原始提示词</option>
              <option v-for="asset in characterAssets" :key="asset.id" :value="asset.id">
                {{ asset.name || '未命名形象' }} · {{ rolePresetLabel(asset.role_preset || asset.rolePreset) }}
              </option>
            </select>
          </label>

          <button
            v-if="getBoundAsset(character)"
            class="character-gallery__bound-asset"
            type="button"
            @click="openAssetImage(getBoundAsset(character))"
          >
            <img
              v-if="getAssetImage(getBoundAsset(character))"
              :src="assetUrl(getAssetImage(getBoundAsset(character)))"
              alt=""
            />
            <span>
              <b>当前引用</b>
              {{ getBoundAsset(character).name || '角色形象' }}
            </span>
          </button>
          <div v-else class="character-gallery__bound-asset is-empty">
            未绑定形象，生成时不带形象库参考图
          </div>

          <label class="character-gallery__prompt">
            <div class="character-gallery__prompt-head">
              <span class="character-gallery__prompt-label">角色描述词</span>
            </div>
            <textarea
              class="character-gallery__prompt-input"
              :value="getCharacterDescriptionValue(character)"
              rows="5"
              placeholder="此处即生图所用的完整 prompt，留空将使用系统兜底"
              @input="updateCharacterDescriptionDraft(character, $event.target.value)"
              @blur="commitCharacterDescription(character)"
            />
          </label>
        </div>

        <div class="character-gallery__foot">
          <div class="character-gallery__status">
          </div>
          <div class="character-gallery__foot-actions">
            <label
              :class="['btn btn-sm character-gallery__replace', (isPendingCharacterImage(character.id) || isReplacingCharacterImage(character.id)) && 'is-disabled']"
              title="上传图片替换当前角色图"
            >
              <input
                class="character-gallery__replace-input"
                type="file"
                accept="image/*"
                :disabled="isPendingCharacterImage(character.id) || isReplacingCharacterImage(character.id)"
                @change="handleReplaceFile(character, $event)"
              />
              {{ isReplacingCharacterImage(character.id) ? '替换中' : '替换' }}
            </label>
            <button class="btn btn-sm character-gallery__action" :disabled="isPendingCharacterImage(character.id) || isReplacingCharacterImage(character.id)" @click="handleGenerate(character)">
              {{ getGenerateButtonLabel(character) }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ImagePlus, Upload } from 'lucide-vue-next'
import { assetUrl } from '@/utils/asset-url'

const props = defineProps({
  characters: {
    type: Array,
    default: () => [],
  },
  characterAssets: {
    type: Array,
    default: () => [],
  },
  assetBusy: {
    type: Boolean,
    default: false,
  },
  lockedImageConfigLabel: {
    type: String,
    default: '',
  },
  pendingCharacterImageIds: {
    type: Array,
    default: () => [],
  },
  replacingCharacterImageIds: {
    type: Array,
    default: () => [],
  },
  hasNarratorOnly: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'batch-generate',
  'generate',
  'replace-image',
  'upload-character-asset',
  'bind-character-asset',
  'update-character-description',
  'open-image-viewer',
])

function getCharacterImage(character) {
  return character?.image_url || character?.imageUrl || ''
}

const descriptionDrafts = ref({})

function characterDraftKey(character) {
  return String(character?.id || character?.name || '')
}

function getCharacterDescription(character) {
  return character?.image_prompt || character?.imagePrompt || ''
}

function getCharacterDescriptionValue(character) {
  const key = characterDraftKey(character)
  if (Object.prototype.hasOwnProperty.call(descriptionDrafts.value, key)) {
    return descriptionDrafts.value[key]
  }
  return getCharacterDescription(character)
}

function updateCharacterDescriptionDraft(character, value) {
  descriptionDrafts.value = {
    ...descriptionDrafts.value,
    [characterDraftKey(character)]: value,
  }
}

function commitCharacterDescription(character) {
  emit('update-character-description', {
    character,
    value: getCharacterDescriptionValue(character),
  })
}

function handleGenerate(character) {
  emit('generate', {
    id: character.id,
    character,
    value: getCharacterDescriptionValue(character),
  })
}

function hasCharacterImage(character) {
  return !!getCharacterImage(character)
}

function isPendingCharacterImage(id) {
  return props.pendingCharacterImageIds.includes(id)
}

function isReplacingCharacterImage(id) {
  return props.replacingCharacterImageIds.includes(id)
}

function getGenerateButtonLabel(character) {
  if (isPendingCharacterImage(character.id)) return '生成中'
  return '生成'
}

function rolePresetLabel(rolePreset) {
  switch (rolePreset) {
    case 'male_lead':
      return '男主'
    case 'female_lead':
      return '女主'
    case 'supporting':
      return '配角'
    case 'villain':
      return '反派'
    default:
      return '自定义'
  }
}

function getAssetImage(asset) {
  return asset?.image_url || asset?.imageUrl || asset?.local_path || asset?.localPath || ''
}

function getBoundAssetId(character) {
  return Number(
    character?.character_asset_id ||
    character?.characterAssetId ||
    character?.character_asset?.id ||
    character?.characterAsset?.id ||
    0,
  )
}

function getBoundAsset(character) {
  const id = getBoundAssetId(character)
  if (!id) return null
  return props.characterAssets.find(asset => Number(asset?.id || 0) === id) ||
    character?.character_asset ||
    character?.characterAsset ||
    null
}

function openCharacterImage(character) {
  const src = getCharacterImage(character)
  if (!src) return
  emit('open-image-viewer', {
    src: assetUrl(src),
    title: `${character.name} 角色形象`,
  })
}

function openAssetImage(asset) {
  const src = getAssetImage(asset)
  if (!src) return
  emit('open-image-viewer', {
    src: assetUrl(src),
    title: `${asset?.name || '角色形象'} 形象图片`,
  })
}

function handleReplaceFile(character, event) {
  const input = event.target
  const file = input?.files?.[0]
  if (file) emit('replace-image', { character, file })
  if (input) input.value = ''
}

function handleAssetFile(event, rolePreset) {
  const input = event.target
  const file = input?.files?.[0]
  if (file) {
    emit('upload-character-asset', {
      file,
      rolePreset,
      gender: rolePreset === 'male_lead' ? 'male' : rolePreset === 'female_lead' ? 'female' : 'unknown',
      isDefault: rolePreset === 'male_lead' || rolePreset === 'female_lead',
    })
  }
  if (input) input.value = ''
}

function handleBindAsset(character, event) {
  const value = event.target?.value
  emit('bind-character-asset', {
    character,
    assetId: value ? Number(value) : null,
  })
}
</script>

<style>
@import url('@/assets/production-character-gallery.css');
</style>
