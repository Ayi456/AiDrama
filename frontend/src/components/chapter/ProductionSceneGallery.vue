<template>
  <div class="scene-gallery">
    <div class="scene-gallery__toolbar">
      <div class="scene-gallery__copy">
        <span class="scene-gallery__kicker">Scene Canvas</span>
        <div class="scene-gallery__title-row">
          <span class="scene-gallery__title">场景图片画廊</span>
        </div>
        <div class="scene-gallery__desc">每张卡片里的图片提示词都会直接参与下一次生成，用它来控制光线、天气、材质和整体氛围。</div>
      </div>
      <div class="scene-gallery__actions">
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <button
          type="button"
          class="btn btn-sm scene-gallery__manual-btn"
          :disabled="manualBusy"
          @click="openManualDialog"
        >
          <MapPlus :size="12" />
          手动添加
        </button>
        <button class="btn btn-sm" @click="emit('batch-generate')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          批量生成
        </button>
      </div>
    </div>

    <div v-if="manualDialogOpen" class="scene-gallery__dialog" @click.self="closeManualDialog">
      <form class="scene-gallery__dialog-card" @submit.prevent="submitManualScene">
        <div class="scene-gallery__dialog-head">
          <div>
            <span class="scene-gallery__kicker">Manual Scene</span>
            <h3>手动添加场景</h3>
          </div>
          <button class="scene-gallery__dialog-close" type="button" title="关闭" @click="closeManualDialog">×</button>
        </div>

        <div class="scene-gallery__form-grid">
          <label class="scene-gallery__field">
            <span>场景地点</span>
            <input v-model.trim="manualForm.location" type="text" placeholder="例如：云泽楼大殿" required />
          </label>
          <label class="scene-gallery__field">
            <span>时间段</span>
            <input v-model.trim="manualForm.time" type="text" placeholder="例如：夜晚 / 清晨" />
          </label>
        </div>

        <label class="scene-gallery__field">
          <span>场景提示词</span>
          <textarea v-model.trim="manualForm.prompt" rows="5" placeholder="建筑、陈设、光线、天气、材质和整体氛围" />
        </label>

        <label class="scene-gallery__file-field">
          <input type="file" accept="image/*" @change="handleManualFile" />
          <Upload :size="14" />
          <span>{{ manualFileName || '上传场景图片（可选）' }}</span>
        </label>

        <div class="scene-gallery__dialog-actions">
          <button class="btn btn-sm" type="button" @click="closeManualDialog">取消</button>
          <button class="btn btn-sm btn-primary" type="submit" :disabled="manualBusy || !manualForm.location.trim()">
            {{ manualBusy ? '保存中' : '保存场景' }}
          </button>
        </div>
      </form>
    </div>

    <div class="scene-gallery__grid">
      <article v-for="scene in scenes" :key="scene.id" class="scene-gallery__card">
        <div class="scene-gallery__cover">
          <img
            v-if="hasSceneImage(scene)"
            :src="assetUrl(getSceneImage(scene))"
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

          <div class="scene-gallery__reference">
            <template v-if="hasSceneReferenceImage(scene)">
              <button
                type="button"
                class="scene-gallery__reference-thumb"
                :title="'查看参考图，再生成将以图生图模式运行'"
                @click="openSceneReferenceImage(scene)"
              >
                <img :src="assetUrl(getSceneReferenceImage(scene))" alt="参考图" />
                <span class="scene-gallery__reference-tag">图生图</span>
              </button>
              <div class="scene-gallery__reference-meta">
                <span class="scene-gallery__reference-label">已上传参考图</span>
                <div class="scene-gallery__reference-actions">
                  <label
                    :class="['scene-gallery__reference-btn', isUploadingSceneReference(scene.id) && 'is-disabled']"
                    title="重新上传参考图"
                  >
                    <input
                      class="scene-gallery__reference-input"
                      type="file"
                      accept="image/*"
                      :disabled="isUploadingSceneReference(scene.id)"
                      @change="handleReferenceFile(scene, $event)"
                    />
                    {{ isUploadingSceneReference(scene.id) ? '上传中' : '更换' }}
                  </label>
                  <button
                    type="button"
                    class="scene-gallery__reference-btn is-ghost"
                    :disabled="isUploadingSceneReference(scene.id)"
                    @click="clearReference(scene)"
                  >
                    移除
                  </button>
                </div>
              </div>
            </template>
            <label
              v-else
              :class="['scene-gallery__reference-empty', isUploadingSceneReference(scene.id) && 'is-disabled']"
              title="上传一张参考图，再生成时将走图生图模式"
            >
              <input
                class="scene-gallery__reference-input"
                type="file"
                accept="image/*"
                :disabled="isUploadingSceneReference(scene.id)"
                @change="handleReferenceFile(scene, $event)"
              />
              <span class="scene-gallery__reference-empty-icon">+</span>
              <span class="scene-gallery__reference-empty-text">
                {{ isUploadingSceneReference(scene.id) ? '上传中' : '上传参考图（开启图生图）' }}
              </span>
            </label>
          </div>

          <label class="scene-gallery__prompt">
            <div class="scene-gallery__prompt-head">
              <span class="scene-gallery__prompt-label">图片提示词</span>
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
            </div>
          </div>

          <div class="scene-gallery__foot-actions">
            <label
              :class="['btn btn-sm scene-gallery__replace', (isPendingSceneImage(scene.id) || isReplacingSceneImage(scene.id)) && 'is-disabled']"
              title="上传图片替换当前场景图"
            >
              <input
                class="scene-gallery__replace-input"
                type="file"
                accept="image/*"
                :disabled="isPendingSceneImage(scene.id) || isReplacingSceneImage(scene.id)"
                @change="handleReplaceFile(scene, $event)"
              />
              {{ isReplacingSceneImage(scene.id) ? '替换中' : '替换' }}
            </label>
            <button class="btn btn-sm scene-gallery__action" :disabled="isPendingSceneImage(scene.id) || isReplacingSceneImage(scene.id)" @click="emit('generate', scene.id)">
              {{ getGenerateButtonLabel(scene) }}
            </button>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { MapPlus, Upload } from 'lucide-vue-next'
import { assetUrl } from '@/utils/asset-url'

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
  replacingSceneImageIds: {
    type: Array,
    default: () => [],
  },
  uploadingSceneReferenceIds: {
    type: Array,
    default: () => [],
  },
  manualBusy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([
  'manual-add',
  'batch-generate',
  'generate',
  'replace-image',
  'update-scene-field',
  'open-image-viewer',
  'upload-scene-reference',
  'clear-scene-reference',
])

const emptyManualForm = () => ({
  location: '',
  time: '',
  prompt: '',
  file: null,
})

const manualDialogOpen = ref(false)
const manualForm = ref(emptyManualForm())
const manualFileName = ref('')

function openManualDialog() {
  manualDialogOpen.value = true
}

function closeManualDialog() {
  manualDialogOpen.value = false
  manualForm.value = emptyManualForm()
  manualFileName.value = ''
}

function handleManualFile(event) {
  const input = event.target
  const file = input?.files?.[0] || null
  manualForm.value.file = file
  manualFileName.value = file?.name || ''
  if (input) input.value = ''
}

function submitManualScene() {
  const location = manualForm.value.location.trim()
  if (!location) return
  emit('manual-add', {
    location,
    time: manualForm.value.time.trim(),
    prompt: manualForm.value.prompt.trim(),
    file: manualForm.value.file,
  })
  closeManualDialog()
}

function getSceneImage(scene) {
  return scene?.image_url || scene?.imageUrl || ''
}

function getSceneReferenceImage(scene) {
  return scene?.reference_image || scene?.referenceImage || ''
}

function hasSceneImage(scene) {
  return !!getSceneImage(scene)
}

function hasSceneReferenceImage(scene) {
  return !!getSceneReferenceImage(scene)
}

function isPendingSceneImage(id) {
  return props.pendingSceneImageIds.includes(id)
}

function isReplacingSceneImage(id) {
  return props.replacingSceneImageIds.includes(id)
}

function isUploadingSceneReference(id) {
  return props.uploadingSceneReferenceIds.includes(id)
}

function getGenerateButtonLabel(scene) {
  if (isPendingSceneImage(scene.id)) return '生成中'
  return '生成'
}

function openSceneImage(scene) {
  const src = getSceneImage(scene)
  if (!src) return
  emit('open-image-viewer', {
    src: assetUrl(src),
    title: `${scene.location} 场景图`,
  })
}

function openSceneReferenceImage(scene) {
  const src = getSceneReferenceImage(scene)
  if (!src) return
  emit('open-image-viewer', {
    src: assetUrl(src),
    title: `${scene.location} 参考图`,
  })
}

function handleReplaceFile(scene, event) {
  const input = event.target
  const file = input?.files?.[0]
  if (file) emit('replace-image', { scene, file })
  if (input) input.value = ''
}

function handleReferenceFile(scene, event) {
  const input = event.target
  const file = input?.files?.[0]
  if (file) emit('upload-scene-reference', { scene, file })
  if (input) input.value = ''
}

function clearReference(scene) {
  emit('clear-scene-reference', scene)
}
</script>

<style>
@import url('@/assets/production-scene-gallery.css');
</style>
