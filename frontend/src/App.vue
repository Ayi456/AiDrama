<template>
  <RouterView v-slot="{ Component }">
    <component :is="layoutComponent" :key="layoutKey">
      <component :is="Component" :key="viewKey" />
    </component>
  </RouterView>
  <Toaster position="top-center" :duration="3000" rich-colors close-button />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'
import DefaultLayout from './layouts/default.vue'
import StudioLayout from './layouts/studio.vue'

const route = useRoute()

const layoutComponent = computed(() => {
  return route.meta.layout === 'studio' ? StudioLayout : DefaultLayout
})

const layoutKey = computed(() => `${String(route.meta.layout || 'default')}:${route.path}`)
const viewKey = computed(() => route.fullPath)
</script>
