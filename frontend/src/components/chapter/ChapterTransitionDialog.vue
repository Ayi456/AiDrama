<template>
  <div v-if="open" class="trans-modal-mask" @click.self="emit('close')">
    <div class="trans-modal">
      <div class="trans-modal__title">过渡效果设置</div>
      <div class="trans-modal__desc">设置同一集所有镜头之间的过渡效果。保存后再次拼接生效。</div>

      <div class="trans-modal__field">
        <div class="trans-modal__label">过渡类型</div>
        <div class="trans-modal__options">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            type="button"
            :class="['trans-modal__opt', { selected: localType === opt.value }]"
            @click="localType = opt.value"
          >{{ opt.label }}</button>
        </div>
      </div>

      <div class="trans-modal__field">
        <div class="trans-modal__label">
          过渡时长 <span class="dim">{{ disabled ? '已关闭' : `${localDurationMs} ms` }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1000"
          step="100"
          :value="localDurationMs"
          :disabled="disabled"
          class="trans-modal__slider"
          @input="onSliderInput"
        />
        <div class="trans-modal__hint">0 ms 即关闭过渡，恢复硬切。</div>
      </div>

      <div class="trans-modal__actions">
        <button class="btn btn-ghost" :disabled="saving" @click="emit('close')">取消</button>
        <button class="btn btn-primary" :disabled="saving" @click="onSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  type: { type: String, default: 'fade' },
  durationMs: { type: Number, default: 500 },
  saving: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'save'])

const typeOptions = [
  { value: 'fade', label: '淡入淡出' },
  { value: 'fadeblack', label: '淡入黑场' },
  { value: 'fadewhite', label: '淡入白场' },
]

const localType = ref(props.type || 'fade')
const localDurationMs = ref(Number(props.durationMs) || 0)

watch(() => props.open, isOpen => {
  if (isOpen) {
    localType.value = props.type || 'fade'
    localDurationMs.value = Number(props.durationMs) || 0
  }
})

const disabled = computed(() => localDurationMs.value <= 0)

function onSliderInput(event) {
  localDurationMs.value = Number(event.target.value) || 0
}

function onSave() {
  emit('save', {
    type: localDurationMs.value > 0 ? localType.value : null,
    durationMs: localDurationMs.value,
  })
}
</script>

<style scoped>
.trans-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.trans-modal {
  background: var(--surface, #1f2433);
  color: var(--text, #e6e8ef);
  border-radius: 8px;
  padding: 20px;
  min-width: 320px;
  max-width: 420px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
.trans-modal__title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
}
.trans-modal__desc {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 16px;
}
.trans-modal__field {
  margin-bottom: 16px;
}
.trans-modal__label {
  font-size: 12px;
  margin-bottom: 8px;
  opacity: 0.85;
}
.trans-modal__options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.trans-modal__opt {
  flex: 1;
  min-width: 80px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.trans-modal__opt.selected {
  background: var(--primary, #4f7cff);
  border-color: var(--primary, #4f7cff);
  color: #fff;
}
.trans-modal__slider {
  width: 100%;
}
.trans-modal__hint {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 4px;
}
.trans-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.dim { opacity: 0.6; font-weight: normal; }
</style>
