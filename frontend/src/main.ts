import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './assets/studio.css'
import './assets/auth.css'

createApp(App)
  .use(router)
  .mount('#app')
