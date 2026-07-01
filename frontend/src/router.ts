import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from './composables/useAuth'

const HomeView = () => import('./pages/HomeView.vue')
const WorkspaceView = () => import('./pages/WorkspaceView.vue')
const SettingsView = () => import('./pages/SettingsView.vue')
const CharacterAssetsView = () => import('./pages/CharacterAssetsView.vue')
const DramaDetailView = () => import('./pages/DramaDetailView.vue')
const ChapterStudioView = () => import('./pages/ChapterStudioView.vue')
const WalletView = () => import('./pages/WalletView.vue')
const ProfileView = () => import('./pages/ProfileView.vue')
const LoginView = () => import('./pages/LoginView.vue')
const RegisterView = () => import('./pages/RegisterView.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { layout: 'auth', guestOnly: true } },
    { path: '/register', name: 'register', component: RegisterView, meta: { layout: 'auth', guestOnly: true } },
    { path: '/', name: 'home', component: HomeView, meta: { layout: 'public' } },
    { path: '/workspace', name: 'workspace', component: WorkspaceView, meta: { requiresAuth: true } },
    { path: '/character-assets', name: 'character-assets', component: CharacterAssetsView, meta: { requiresAuth: true } },
    { path: '/wallet', name: 'wallet', component: WalletView, meta: { requiresAuth: true } },
    { path: '/profile', name: 'profile', component: ProfileView, meta: { requiresAuth: true } },
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
