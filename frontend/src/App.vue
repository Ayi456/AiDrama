<template>
  <RouterView v-slot="{ Component }">
    <component v-if="layoutComponent" :is="layoutComponent" :key="layoutKey">
      <component :is="Component" :key="viewKey" />
    </component>
    <component v-else :is="Component" :key="viewKey" />
  </RouterView>
  <Toaster position="top-right" :duration="4200" rich-colors close-button />
  <AppConfirm />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'
import AppConfirm from './components/AppConfirm.vue'
import DefaultLayout from './layouts/default.vue'
import StudioLayout from './layouts/studio.vue'

const route = useRoute()

const layoutComponent = computed(() => {
  if (route.meta.layout === 'auth') return null
  return route.meta.layout === 'studio' ? StudioLayout : DefaultLayout
})

const layoutKey = computed(() => `${String(route.meta.layout || 'default')}:${route.path}`)
const viewKey = computed(() => route.fullPath)
</script>
