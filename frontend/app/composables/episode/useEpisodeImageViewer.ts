import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useEpisodeImageViewer() {
  const imageViewer = ref({
    open: false,
    src: '',
    title: '',
  })

  function openImageViewer(src: string, title = '') {
    if (!src) return
    imageViewer.value = { open: true, src, title }
  }

  function closeImageViewer() {
    imageViewer.value = { open: false, src: '', title: '' }
  }

  function handleGalleryViewerOpen(payload: any) {
    if (!payload?.src) return
    openImageViewer(payload.src, payload.title || '')
  }

  function handleImageViewerKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && imageViewer.value.open) closeImageViewer()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleImageViewerKeydown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleImageViewerKeydown)
  })

  return {
    imageViewer,
    openImageViewer,
    closeImageViewer,
    handleGalleryViewerOpen,
  }
}
