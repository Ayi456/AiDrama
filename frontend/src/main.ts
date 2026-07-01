import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { validateStoredAuthSession } from './composables/useAuth'
import './assets/studio.css'

await validateStoredAuthSession()

createApp(App)
  .use(router)
  .mount('#app')
