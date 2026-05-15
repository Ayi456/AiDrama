<template>
  <div :class="['project-style-input', { 'project-style-input--compact': compact }]">
    <input
      v-model="draft"
      class="input project-style-input__field"
      :list="listId"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="emitDraft"
      @change="emitDraft"
      @blur="commitDraft"
    />
    <datalist :id="listId">
      <option v-for="option in styleOptions" :key="option.value" :value="option.label" />
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
})
const emit = defineEmits(['update:modelValue'])

const styleOptions = PROJECT_STYLE_OPTIONS
const listId = `project-style-${Math.random().toString(36).slice(2)}`
const draft = ref(getProjectStyleInputValue(props.modelValue))
const normalizedValue = computed(() => normalizeProjectStyleInput(props.modelValue))

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
</script>

<style scoped>
.project-style-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.project-style-input__field {
  width: 100%;
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
</style>
