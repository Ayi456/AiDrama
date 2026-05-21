<template>
  <Transition name="trans-modal">
    <div v-if="open" class="trans-modal-mask" @click.self="emit('close')">
      <div class="trans-modal" role="dialog" aria-modal="true">
        <header class="trans-modal__header">
          <div class="trans-modal__title-wrap">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="trans-modal__title-icon">
              <rect x="3" y="5" width="7" height="14" rx="1"/>
              <rect x="14" y="5" width="7" height="14" rx="1"/>
              <path d="M10 12h4"/>
            </svg>
            <div>
              <div class="trans-modal__title">镜头过渡效果</div>
              <div class="trans-modal__desc">设置同一集所有相邻镜头之间的过渡，保存后下次拼接生效。</div>
            </div>
          </div>
          <button type="button" class="trans-modal__close" @click="emit('close')" aria-label="关闭">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </header>

        <section class="trans-modal__section">
          <div class="trans-modal__section-head">
            <span class="trans-modal__section-title">是否启用过渡</span>
            <label class="trans-toggle">
              <input type="checkbox" :checked="enabled" @change="onToggleEnabled" />
              <span class="trans-toggle__track">
                <span class="trans-toggle__thumb" />
              </span>
            </label>
          </div>
          <p class="trans-modal__section-hint">
            关闭后所有镜头硬切拼接（与旧产物一致）。
          </p>
        </section>

        <section class="trans-modal__section" :class="{ 'is-dim': !enabled }">
          <div class="trans-modal__section-head">
            <span class="trans-modal__section-title">过渡类型</span>
          </div>
          <div v-for="group in typeGroups" :key="group.label" class="trans-group">
            <div class="trans-group__label">{{ group.label }}</div>
            <div class="trans-group__options">
              <button
                v-for="opt in group.options"
                :key="opt.value"
                type="button"
                :class="['trans-card', { selected: localType === opt.value }]"
                :disabled="!enabled"
                @click="localType = opt.value"
              >
                <span class="trans-card__icon" v-html="opt.icon" />
                <span class="trans-card__label">{{ opt.label }}</span>
              </button>
            </div>
          </div>
        </section>

        <section class="trans-modal__section" :class="{ 'is-dim': !enabled }">
          <div class="trans-modal__section-head">
            <span class="trans-modal__section-title">
              过渡时长
              <span class="trans-modal__section-value">{{ enabled ? `${localDurationMs} ms` : '—' }}</span>
            </span>
          </div>
          <input
            type="range"
            min="100"
            max="1000"
            step="50"
            :value="enabled ? localDurationMs : 0"
            :disabled="!enabled"
            class="trans-slider"
            @input="onSliderInput"
          />
          <div class="trans-preset-row">
            <button
              v-for="preset in durationPresets"
              :key="preset"
              type="button"
              :class="['trans-preset', { selected: enabled && localDurationMs === preset }]"
              :disabled="!enabled"
              @click="localDurationMs = preset"
            >{{ preset }} ms</button>
          </div>
        </section>

        <footer class="trans-modal__actions">
          <button class="btn btn-ghost" :disabled="saving" @click="emit('close')">取消</button>
          <button class="btn btn-primary" :disabled="saving" @click="onSave">
            {{ saving ? '保存中…' : '保存' }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
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

const ICON = {
  fade: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><path d="M16 12h4" stroke-dasharray="2 2"/></svg>',
  fadeblack: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="12" height="18" rx="1.5"/><rect x="16" y="3" width="4" height="18" rx="1" fill="currentColor"/><rect x="22" y="3" width="12" height="18" rx="1.5"/></svg>',
  fadewhite: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="12" height="18" rx="1.5"/><rect x="16" y="3" width="4" height="18" rx="1" stroke-dasharray="1 1.5"/><rect x="22" y="3" width="12" height="18" rx="1.5"/></svg>',
  slideleft: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><path d="M27 8l-4 4 4 4"/></svg>',
  slideright: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><path d="M9 8l4 4-4 4"/></svg>',
  slideup: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><path d="M27 16l-4-4-4 4 4-4"/><path d="M23 16V8"/></svg>',
  circleopen: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><circle cx="27" cy="12" r="5"/><circle cx="27" cy="12" r="2"/></svg>',
  circleclose: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><circle cx="27" cy="12" r="2.5" fill="currentColor" stroke="none"/><circle cx="27" cy="12" r="5"/></svg>',
  wipeleft: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><path d="M27 4v16"/></svg>',
  pixelize: '<svg viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="square"><rect x="2" y="3" width="14" height="18" rx="1.5"/><rect x="20" y="3" width="14" height="18" rx="1.5"/><rect x="22" y="5" width="2" height="2"/><rect x="26" y="5" width="2" height="2"/><rect x="30" y="5" width="2" height="2"/><rect x="22" y="11" width="2" height="2"/><rect x="26" y="11" width="2" height="2"/><rect x="30" y="11" width="2" height="2"/><rect x="22" y="17" width="2" height="2"/><rect x="26" y="17" width="2" height="2"/><rect x="30" y="17" width="2" height="2"/></svg>',
}

const typeGroups = [
  {
    label: '淡变',
    options: [
      { value: 'fade', label: '淡入淡出', icon: ICON.fade },
      { value: 'fadeblack', label: '淡入黑场', icon: ICON.fadeblack },
      { value: 'fadewhite', label: '淡入白场', icon: ICON.fadewhite },
    ],
  },
  {
    label: '滑动',
    options: [
      { value: 'slideleft', label: '向左滑', icon: ICON.slideleft },
      { value: 'slideright', label: '向右滑', icon: ICON.slideright },
      { value: 'slideup', label: '向上滑', icon: ICON.slideup },
    ],
  },
  {
    label: '圆形',
    options: [
      { value: 'circleopen', label: '圆形展开', icon: ICON.circleopen },
      { value: 'circleclose', label: '圆形收拢', icon: ICON.circleclose },
    ],
  },
  {
    label: '其他',
    options: [
      { value: 'wipeleft', label: '左向擦除', icon: ICON.wipeleft },
      { value: 'pixelize', label: '像素溶解', icon: ICON.pixelize },
    ],
  },
]

const durationPresets = [300, 500, 700, 1000]

const localType = ref(props.type || 'fade')
const localDurationMs = ref(Number(props.durationMs) > 0 ? Number(props.durationMs) : 500)
const enabled = ref(Number(props.durationMs) > 0)

watch(() => props.open, isOpen => {
  if (isOpen) {
    const incomingDur = Number(props.durationMs)
    enabled.value = incomingDur > 0
    localDurationMs.value = incomingDur > 0 ? incomingDur : 500
    localType.value = props.type || 'fade'
  }
})

function onToggleEnabled(event) {
  enabled.value = !!event.target.checked
}

function onSliderInput(event) {
  localDurationMs.value = Number(event.target.value) || 0
}

function onSave() {
  emit('save', {
    type: enabled.value ? localType.value : null,
    durationMs: enabled.value ? localDurationMs.value : 0,
  })
}
</script>

<style scoped>
.trans-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(20, 24, 36, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.trans-modal {
  background: #ffffff;
  color: #1f2433;
  border: 1px solid rgba(31, 36, 51, 0.08);
  border-radius: 12px;
  width: 100%;
  max-width: 460px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  padding: 18px 20px 16px;
}

.trans-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(31, 36, 51, 0.08);
}
.trans-modal__title-wrap {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.trans-modal__title-icon {
  margin-top: 2px;
  color: #4f7cff;
  flex-shrink: 0;
}
.trans-modal__title {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: #1f2433;
}
.trans-modal__desc {
  font-size: 11.5px;
  color: #6b7280;
  margin-top: 3px;
  line-height: 1.5;
}
.trans-modal__close {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(31, 36, 51, 0.06);
  color: #4b5563;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s;
}
.trans-modal__close:hover {
  background: rgba(31, 36, 51, 0.12);
  color: #1f2433;
}

.trans-modal__section {
  margin-bottom: 16px;
  transition: opacity 0.2s;
}
.trans-modal__section.is-dim {
  opacity: 0.45;
  pointer-events: none;
}
.trans-modal__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.trans-modal__section-title {
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: #1f2433;
}
.trans-modal__section-value {
  font-size: 11.5px;
  color: #6b7280;
  font-weight: normal;
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}
.trans-modal__section-hint {
  font-size: 11px;
  color: #9ca3af;
  margin: 0;
  line-height: 1.5;
}

.trans-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
  cursor: pointer;
}
.trans-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}
.trans-toggle__track {
  position: absolute;
  inset: 0;
  background: #d1d5db;
  border-radius: 999px;
  transition: background 0.2s;
}
.trans-toggle__thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s, background 0.2s;
}
.trans-toggle input:checked + .trans-toggle__track {
  background: #4f7cff;
}
.trans-toggle input:checked + .trans-toggle__track .trans-toggle__thumb {
  transform: translateX(16px);
}

.trans-group {
  margin-top: 10px;
}
.trans-group:first-child { margin-top: 0; }
.trans-group__label {
  font-size: 10.5px;
  color: #9ca3af;
  margin-bottom: 6px;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-weight: 600;
}
.trans-group__options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.trans-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px 6px;
  border: 1px solid rgba(31, 36, 51, 0.12);
  background: #ffffff;
  color: #4b5563;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}
.trans-card:hover:not(:disabled) {
  border-color: rgba(79, 124, 255, 0.5);
  background: rgba(79, 124, 255, 0.06);
  color: #1f2433;
}
.trans-card:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.trans-card.selected {
  border-color: #4f7cff;
  background: rgba(79, 124, 255, 0.1);
  color: #2649c0;
  box-shadow: 0 0 0 1px rgba(79, 124, 255, 0.3);
}
.trans-card__icon {
  width: 36px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
}
.trans-card__icon :deep(svg) {
  width: 100%;
  height: 100%;
}
.trans-card__label {
  font-size: 10.5px;
  line-height: 1.2;
}

.trans-slider {
  width: 100%;
  margin: 4px 0 8px;
  appearance: none;
  height: 4px;
  background: #e5e7eb;
  border-radius: 999px;
  outline: none;
}
.trans-slider:disabled {
  opacity: 0.5;
}
.trans-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #4f7cff;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.trans-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #4f7cff;
  cursor: pointer;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.trans-preset-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.trans-preset {
  flex: 1;
  min-width: 60px;
  padding: 4px 6px;
  border: 1px solid rgba(31, 36, 51, 0.12);
  background: #ffffff;
  color: #4b5563;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  transition: all 0.15s;
}
.trans-preset:hover:not(:disabled) {
  border-color: rgba(79, 124, 255, 0.5);
  color: #1f2433;
}
.trans-preset:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.trans-preset.selected {
  border-color: #4f7cff;
  background: rgba(79, 124, 255, 0.08);
  color: #2649c0;
}

.trans-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid rgba(31, 36, 51, 0.08);
  margin-top: 4px;
}

/* enter/leave */
.trans-modal-enter-active,
.trans-modal-leave-active {
  transition: opacity 0.18s;
}
.trans-modal-enter-active .trans-modal,
.trans-modal-leave-active .trans-modal {
  transition: transform 0.18s, opacity 0.18s;
}
.trans-modal-enter-from,
.trans-modal-leave-to {
  opacity: 0;
}
.trans-modal-enter-from .trans-modal,
.trans-modal-leave-to .trans-modal {
  transform: translateY(10px) scale(0.98);
  opacity: 0;
}
</style>
