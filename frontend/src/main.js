import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/global.css'
import { startLiveUpdates } from './services/live-updates'

const app = createApp(App)

app.use(router)

app.mount('#app')
const stopLiveUpdates = startLiveUpdates()
if (import.meta.hot) import.meta.hot.dispose(stopLiveUpdates)
