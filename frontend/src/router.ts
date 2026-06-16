import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './pages/HomeView.vue'
import WorkspaceView from './pages/WorkspaceView.vue'
import SettingsView from './pages/SettingsView.vue'
import CharacterAssetsView from './pages/CharacterAssetsView.vue'
import DramaDetailView from './pages/DramaDetailView.vue'
import ChapterStudioView from './pages/ChapterStudioView.vue'
import LoginView from './pages/LoginView.vue'
import RegisterView from './pages/RegisterView.vue'
import { useAuth } from './composables/useAuth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { layout: 'auth', guestOnly: true } },
    { path: '/register', name: 'register', component: RegisterView, meta: { layout: 'auth', guestOnly: true } },
    { path: '/', name: 'home', component: HomeView, meta: { layout: 'public' } },
    { path: '/workspace', name: 'workspace', component: WorkspaceView, meta: { requiresAuth: true } },
    { path: '/character-assets', name: 'character-assets', component: CharacterAssetsView, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
    { path: '/drama/:id', name: 'drama-detail', component: DramaDetailView, meta: { requiresAuth: true } },
    {
      path: '/drama/:id/chapter/:chapterNumber',
      name: 'chapter-studio',
      component: ChapterStudioView,
      meta: { layout: 'studio', requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuth()

  if (to.meta.requiresAuth && !auth.isAuthenticated.value) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.guestOnly && auth.isAuthenticated.value) {
    const redirect = typeof to.query.redirect === 'string' && to.query.redirect.startsWith('/')
      ? to.query.redirect
      : '/workspace'
    return redirect
  }
})
