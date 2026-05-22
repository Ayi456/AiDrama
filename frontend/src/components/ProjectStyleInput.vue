<template>
  <div :class="['project-style-input', { 'project-style-input--compact': compact }]">
    <div class="project-style-input__row">
      <input
        v-model="draft"
        class="input project-style-input__field"
        :list="listId"
        :placeholder="placeholder"
        :disabled="disabled"
        @input="emitDraft"
        @change="emitDraft"
        @blur="commitDraft"
        @keydown.enter="commitDraft"
      />
      <button
        v-if="allowCustom"
        type="button"
        class="project-style-input__save"
        :disabled="disabled || !canSaveCustom"
        :title="canSaveCustom ? '保存当前输入为预设' : '当前输入已是预设'"
        @click="saveCustomPreset"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        保存为预设
      </button>
    </div>
    <datalist :id="listId">
      <option v-for="option in styleOptions" :key="option.value" :value="option.label" />
      <option v-for="preset in customPresets" :key="`custom-${preset}`" :value="preset" />
    </datalist>
    <div class="project-style-input__presets">
      <button
        v-for="option in styleOptions"
        :key="option.value"
        type="button"
        :class="['project-style-input__preset', { active: normalizedValue === option.value }]"
        :disabled="disabled"
        @click="pick(option.value)"
      >
        {{ option.label }}
      </button>
      <span
        v-for="preset in customPresets"
        :key="`custom-${preset}`"
        :class="['project-style-input__preset', 'project-style-input__preset--custom', { active: normalizedValue === preset }]"
      >
        <button
          type="button"
          class="project-style-input__preset-label"
          :disabled="disabled"
          @click="pick(preset)"
        >
          {{ preset }}
        </button>
        <button
          v-if="allowCustom"
          type="button"
          class="project-style-input__preset-remove"
          :disabled="disabled"
          title="移除该预设"
          @click="removeCustomPreset(preset)"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import {
  getProjectStyleInputValue,
  normalizeProjectStyleInput,
  PROJECT_STYLE_OPTIONS,
} from '@/utils/project-style'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '选择或输入项目风格' },
  disabled: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  customPresets: { type: Array, default: () => [] },
  allowCustom: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'update:customPresets'])

const styleOptions = PROJECT_STYLE_OPTIONS
const listId = `project-style-${Math.random().toString(36).slice(2)}`
const draft = ref(getProjectStyleInputValue(props.modelValue))
const normalizedValue = computed(() => normalizeProjectStyleInput(props.modelValue))

const builtinValueSet = new Set(PROJECT_STYLE_OPTIONS.flatMap(o => [o.value, o.label]))
const trimmedDraft = computed(() => String(draft.value || '').trim())
const canSaveCustom = computed(() => {
  const value = trimmedDraft.value
  if (!value) return false
  if (builtinValueSet.has(value)) return false
  return !props.customPresets.includes(value)
})

watch(() => props.modelValue, (value) => {
  const nextDraft = getProjectStyleInputValue(value)
  if (nextDraft !== draft.value) draft.value = nextDraft
})

function emitDraft() {
  emit('update:modelValue', normalizeProjectStyleInput(draft.value))
}

function commitDraft() {
  const normalized = normalizeProjectStyleInput(draft.value)
  draft.value = getProjectStyleInputValue(normalized)
  emit('update:modelValue', normalized)
}

function pick(value) {
  draft.value = getProjectStyleInputValue(value)
  emit('update:modelValue', value)
}

function saveCustomPreset() {
  if (!canSaveCustom.value) return
  const value = trimmedDraft.value
  emit('update:customPresets', [...props.customPresets, value])
  emit('update:modelValue', value)
}

function removeCustomPreset(preset) {
  const next = props.customPresets.filter(p => p !== preset)
  emit('update:customPresets', next)
}
</script>

<style scoped>
.project-style-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.project-style-input__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.project-style-input__field {
  flex: 1;
  min-width: 0;
}

.project-style-input__save {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid rgba(76, 125, 255, 0.28);
  background: rgba(76, 125, 255, 0.08);
  color: var(--accent-text);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out), opacity 0.16s var(--ease-out);
  white-space: nowrap;
}
.project-style-input__save:hover:not(:disabled) {
  background: rgba(76, 125, 255, 0.14);
  border-color: rgba(76, 125, 255, 0.4);
}
.project-style-input__save:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.project-style-input__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.project-style-input--compact {
  gap: 6px;
}

.project-style-input__preset {
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.76);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.16s var(--ease-out), color 0.16s var(--ease-out), background 0.16s var(--ease-out);
}

.project-style-input--compact .project-style-input__preset {
  height: 24px;
  padding: 0 9px;
  font-size: 10.5px;
  background: rgba(248, 251, 255, 0.74);
}

.project-style-input__preset:hover,
.project-style-input__preset.active {
  border-color: rgba(184, 120, 20, 0.24);
  background: var(--accent-bg);
  color: var(--accent-text);
}

.project-style-input__preset:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.project-style-input__preset--custom {
  display: inline-flex;
  align-items: center;
  gap: 0;
  padding: 0;
  border-color: rgba(76, 125, 255, 0.32);
  background: rgba(76, 125, 255, 0.06);
  color: var(--accent-text);
}
.project-style-input__preset--custom.active,
.project-style-input__preset--custom:hover {
  border-color: rgba(76, 125, 255, 0.5);
  background: rgba(76, 125, 255, 0.14);
}

.project-style-input__preset-label {
  height: 100%;
  padding: 0 4px 0 10px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.project-style-input__preset-label:disabled { cursor: not-allowed; }

.project-style-input__preset-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 100%;
  padding: 0 8px 0 2px;
  background: transparent;
  border: 0;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0.7;
  transition: color 0.16s var(--ease-out), opacity 0.16s var(--ease-out);
}
.project-style-input__preset-remove:hover {
  color: var(--accent-text);
  opacity: 1;
}
.project-style-input__preset-remove:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
