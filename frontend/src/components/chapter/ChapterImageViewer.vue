<template>
  <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="emit('close')">
    <div class="card image-viewer-dialog">
      <div class="image-viewer-head">
        <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
        <button class="btn btn-ghost btn-icon" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="image-viewer-body">
        <img :src="imageViewer.src" :alt="imageViewer.title || '图片预览'" class="image-viewer-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  imageViewer: {
    type: Object,
    default: () => ({ open: false, src: '', title: '' }),
  },
})

const emit = defineEmits(['close'])
</script>
