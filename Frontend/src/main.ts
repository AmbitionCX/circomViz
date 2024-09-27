import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import App from './App.vue'

import './style.css'

const pinia = createPinia()
const app = createApp(App)

app.use(ElementPlus)
// import all icons from @element-plus/icons-vue and register them globally.
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
}

app.use(pinia)
app.mount('#app')