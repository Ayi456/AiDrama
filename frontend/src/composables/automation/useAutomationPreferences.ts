import { ref } from 'vue'
import { preferencesAPI, type AutomationPreferences } from '../useApi'
import { toast } from 'vue-sonner'

const DEFAULTS: AutomationPreferences = {
  userId: 'default',
  autoPipelineEnabled: false,
  autoPipelineMaxRetries: 2,
  autoPipelineConcurrencyImage: 4,
  autoPipelineConcurrencyVideo: 2,
}

const prefs = ref<AutomationPreferences>({ ...DEFAULTS })
const loaded = ref(false)
const saving = ref(false)

export function useAutomationPreferences() {
  async function load() {
    try {
      const res = await preferencesAPI.get()
      if (res) prefs.value = { ...DEFAULTS, ...res }
      loaded.value = true
    } catch (err) {
      console.warn('Failed to load preferences', err)
      loaded.value = true
    }
  }

  async function save(partial: Partial<AutomationPreferences>) {
    saving.value = true
    try {
      const res = await preferencesAPI.put({ ...prefs.value, ...partial })
      if (res) prefs.value = { ...prefs.value, ...res }
      toast.success('设置已保存')
    } catch (err: any) {
      toast.error(err?.message || '保存失败')
      throw err
    } finally {
      saving.value = false
    }
  }

  return { prefs, loaded, saving, load, save }
}
