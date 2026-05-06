<template>
  <div v-if="activeSubSteps.length" class="stage-subnav">
    <button
      v-for="sub in activeSubSteps"
      :key="sub.key"
      :class="['stage-subnav-item', { active: activeSubStepKey === sub.key, done: sub.done }]"
      @click="emit('go-sub-step', sub.key)"
    >
      <span>{{ sub.label }}</span>
      <span v-if="sub.done" class="stage-subnav-dot"></span>
    </button>
  </div>
</template>

<script setup>
defineProps({
  activeSubSteps: {
    type: Array,
    default: () => [],
  },
  activeSubStepKey: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['go-sub-step'])
</script>
