import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './pages/HomeView.vue'
import SettingsView from './pages/SettingsView.vue'
import CharacterAssetsView from './pages/CharacterAssetsView.vue'
import DramaDetailView from './pages/DramaDetailView.vue'
import ChapterStudioView from './pages/ChapterStudioView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/character-assets', name: 'character-assets', component: CharacterAssetsView },
    { path: '/settings', name: 'settings', component: SettingsView },
    { path: '/drama/:id', name: 'drama-detail', component: DramaDetailView },
    {
      path: '/drama/:id/chapter/:chapterNumber',
      name: 'chapter-studio',
      component: ChapterStudioView,
      meta: { layout: 'studio' },
    },
  ],
})
