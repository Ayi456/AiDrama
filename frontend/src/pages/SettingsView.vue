<template>
  <div class="settings-layout">
    <aside class="settings-nav">
      <div class="nav-group">
        <div class="nav-group-label">基础</div>
        <button v-for="t in baseTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
          <component :is="t.icon" :size="14" />
          {{ t.label }}
        </button>
      </div>
      <div class="nav-advanced">
        <label class="advanced-toggle">
          <span>Agent 高级配置</span>
          <input type="checkbox" v-model="showAdvanced" />
          <span class="advanced-slider"></span>
        </label>
        <p class="advanced-note">仅展开 Agent 配置与 Skills。工作台功能和分镜字段保持默认可见。</p>
      </div>
      <div v-if="showAdvanced" class="nav-group">
        <div class="nav-group-label">高级</div>
        <button v-for="t in advancedTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
          <component :is="t.icon" :size="14" />
          {{ t.label }}
        </button>
      </div>
    </aside>

    <div class="settings-content">

      <!-- ===== AI 服务配置 ===== -->
      <div v-if="tab === 'ai'" class="settings-scroll">
        <div class="settings-head">
          <div class="settings-brand">
            <div class="settings-brand-copy">
              <div class="settings-brand-kicker">AI Drama Studio</div>
              <div class="settings-brand-name">AiDrama</div>
            </div>
          </div>
          <h2 class="settings-title">AI 服务配置</h2>
          <p class="settings-desc">这里只保留文本、图片、视频三类 AI 服务配置，供剧本拆解、资产生成与视频拼接流程使用。</p>
        </div>
        <div class="sections">
          <section v-for="st in serviceTypes" :key="st.type">
            <div class="section-head">
              <div>
                <span class="section-title">{{ st.label }}</span>
                <div class="section-subtitle">{{ serviceMeta[st.type].desc }}</div>
              </div>
              <button class="btn btn-ghost btn-sm ml-auto" @click="startAddCfg(st.type)"><Plus :size="13" /> 添加</button>
            </div>
            <div class="config-list">
              <div v-for="c in byType(st.type)" :key="c.id" class="card config-row">
                <div class="config-info">
                  <div class="config-main">
                    <div class="config-line">
                      <span class="config-provider">{{ c.provider }}</span>
                      <span class="config-name">{{ c.name || `${c.provider}-${c.service_type}` }}</span>
                    </div>
                    <span class="config-model mono truncate">{{ fmtModel(c.model) }}</span>
                    <span class="config-base mono truncate">{{ c.base_url || '未设置 Base URL' }}</span>
                  </div>
                </div>
                <span :class="['tag', c.has_api_key ? 'tag-success' : 'tag-error']">{{ c.has_api_key ? '已配置' : '无密钥' }}</span>
                <button class="btn btn-ghost btn-sm" @click="testExistingCfg(c)">测试</button>
                <label class="toggle"><input type="checkbox" :checked="c.is_active" @change="toggleCfg(c)"><span /></label>
                <button class="btn btn-ghost btn-icon" @click="startEditCfg(c)"><Pencil :size="13" /></button>
                <button class="btn btn-ghost btn-icon" @click="delCfg(c.id)"><Trash2 :size="13" /></button>
              </div>
              <p v-if="!byType(st.type).length" class="config-empty">暂无配置</p>
            </div>
          </section>
        </div>
        <AutomationSettingsCard />
      </div>

      <!-- ===== Agent 配置 ===== -->
      <div v-else-if="tab === 'agents'" class="settings-scroll">
        <div class="settings-head">
          <div class="settings-brand">
            <div class="settings-brand-copy">
              <div class="settings-brand-kicker">AI Drama Studio</div>
              <div class="settings-brand-name">AiDrama</div>
            </div>
          </div>
          <h2 class="settings-title">Agent 配置</h2>
          <p class="settings-desc">高级区只保留 Agent 运行配置。这里可以调整模型、提示词和参数，保存后立即生效。</p>
        </div>
        <div class="agent-list">
          <div v-for="a in agentDefs" :key="a.type" class="card agent-card">
            <div class="agent-card-head" @click="toggleAgentEdit(a.type)">
              <div class="agent-type-badge">{{ a.icon }}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px">{{ a.label }}</div>
                <div class="dim" style="font-size:12px">{{ a.type }}</div>
              </div>
              <span v-if="getAgentCfg(a.type)" class="tag tag-success">已配置</span>
              <span v-else class="tag">默认</span>
              <ChevronDown :size="14" :style="{ transform: editingAgent === a.type ? 'rotate(180deg)' : '', transition: '0.2s' }" />
            </div>
            <div v-if="editingAgent === a.type" class="agent-card-body">
              <label class="field">
                <span class="field-label">模型 <span class="dim">(留空使用 AI 服务默认)</span></span>
                <BaseSelect v-model="agentForm.model" :options="textModelSelectOptions" placeholder="— 使用 AI 服务默认 —" searchable />
              </label>
              <div class="field-row">
                <label class="field">
                  <span class="field-label">Temperature</span>
                  <input v-model.number="agentForm.temperature" class="input" type="number" min="0" max="2" step="0.1" />
                </label>
                <label class="field">
                  <span class="field-label">Max Tokens</span>
                  <input v-model.number="agentForm.max_tokens" class="input" type="number" min="100" max="32000" />
                </label>
              </div>
              <label class="field">
                <span class="field-label">System Prompt</span>
                <textarea v-model="agentForm.system_prompt" class="textarea" rows="12" placeholder="Agent 系统提示词..." />
              </label>
              <div class="agent-card-foot">
                <button class="btn btn-ghost btn-sm" @click="resetAgentPrompt(a.type)">恢复默认</button>
                <span v-if="agentSaved === a.type" class="tag tag-success" style="margin-left:8px">
                  <Check :size="10" /> 已保存
                </span>
                <button class="btn btn-primary btn-sm ml-auto" :disabled="agentSaving" @click="saveAgentCfg(a.type)">
                  <Loader2 v-if="agentSaving" :size="12" class="animate-spin" />
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Skills 编辑 ===== -->
      <div v-else-if="tab === 'skills'" class="skills-layout">
        <!-- Agent 左侧列表 -->
        <aside class="skills-agent-list">
          <div class="skills-agent-title">Agent 列表</div>
          <button
            v-for="a in agentDefs"
            :key="a.type"
            :class="['skills-agent-item', { active: selectedAgent === a.type }]"
            @click="selectAgent(a.type)"
          >
            <span class="agent-type-badge">{{ a.icon }}</span>
            <span class="skills-agent-label">{{ a.label }}</span>
            <span v-if="agentSkillCount(a.type) > 0" class="skill-count-badge">{{ agentSkillCount(a.type) }}</span>
          </button>
        </aside>

        <!-- Skill 管理右侧主区域 -->
        <div class="settings-scroll skills-main">
          <div class="settings-head">
            <div class="settings-brand">
              <div class="settings-brand-copy">
                <div class="settings-brand-kicker">AI Drama Studio</div>
                <div class="settings-brand-name">AiDrama</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="agent-type-badge" style="width:32px;height:32px;font-size:16px">{{ selectedAgentIcon }}</span>
              <div>
                <h2 class="settings-title" style="margin:0">{{ selectedAgentLabel }}</h2>
                <div class="dim" style="font-size:12px">{{ selectedAgentType }} — Skills</div>
              </div>
            </div>
            <p class="settings-desc" style="margin-top:10px">Skills 仅作为 Agent 的高级提示词层使用，不影响工作台常规功能入口。</p>
            <button class="btn btn-primary btn-sm" @click="startAddSkill">
              <Plus :size="13" /> 新增 Skill
            </button>
          </div>

          <!-- 无 skill 提示 -->
          <div v-if="!currentSkills.length" class="step-empty" style="padding:48px 24px">
            <div class="empty-visual">
              <FileText :size="28" />
            </div>
            <div class="empty-title">暂无 Skill</div>
            <div class="empty-desc">点击右上角「新增 Skill」创建第一个提示词文件</div>
          </div>

          <!-- Skill 列表 -->
          <div class="skill-list" v-else>
            <div v-for="s in currentSkills" :key="s.id" class="card skill-card">
              <div class="skill-card-head" @click="toggleSkillEdit(s.id)">
                <FileText :size="14" style="color:var(--accent);flex-shrink:0" />
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:13px">{{ s.name }}</div>
                  <div class="dim" style="font-size:11px">{{ s.description }}</div>
                </div>
                <button class="btn btn-ghost btn-icon" style="margin-right:4px" @click.stop="deleteSkill(s.id)">
                  <Trash2 :size="13" />
                </button>
                <ChevronDown :size="14" :style="{ transform: editingSkill === s.id ? 'rotate(180deg)' : '', transition: '0.2s' }" />
              </div>
              <div v-if="editingSkill === s.id" class="skill-card-body">
                <textarea
                  v-model="skillContent"
                  class="textarea mono"
                  rows="20"
                  style="font-size:12px;line-height:1.6"
                  placeholder="编写 SKILL.md 内容..."
                />
                <div class="skill-card-foot">
                  <span class="dim" style="font-size:11px">skills/{{ selectedAgentType }}/{{ s.id }}/SKILL.md</span>
                  <span v-if="skillSaved === s.id" class="tag tag-success" style="margin-left:8px">
                    <Check :size="10" /> 已保存
                  </span>
                  <button class="btn btn-primary btn-sm ml-auto" :disabled="skillSaving" @click="saveSkill(s.id)">
                    <Loader2 v-if="skillSaving" :size="12" class="animate-spin" />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Config Dialog -->
    <div v-if="cfgDialog" class="overlay" @click.self="cfgDialog = false">
      <form class="modal card config-modal" @submit.prevent="saveCfg">
        <div class="config-modal-head">
          <div>
            <div class="setup-kicker">{{ cfgEditId ? 'Edit Config' : 'New Config' }}</div>
            <h2 class="modal-title">{{ cfgEditId ? '编辑服务配置' : `添加${serviceMeta[cfgForm.service_type].label}服务` }}</h2>
            <div class="modal-note">推荐先选择模板，系统会自动填入更合理的 `Base URL` 与默认模型。</div>
          </div>
          <span class="tag tag-accent">{{ serviceMeta[cfgForm.service_type].label }}</span>
        </div>
        <div class="preset-picker">
          <button
            v-for="preset in presetsByType(cfgForm.service_type)"
            :key="`${cfgForm.service_type}-${preset.provider}`"
            type="button"
            class="preset-pill"
            @click="applyProviderPreset(cfgForm.service_type, preset.provider)"
          >
            {{ preset.label }}
          </button>
        </div>
        <label class="field">
          <span class="field-label">配置名称</span>
          <input v-model="cfgForm.name" class="input" placeholder="如 AiDrama 默认图像服务" />
        </label>
        <label class="field"><span class="field-label">服务商</span>
          <BaseSelect v-model="cfgForm.provider" :options="providerSelectOptions" placeholder="选择服务商" searchable />
        </label>
        <label class="field">
          <span class="field-label">优先级</span>
          <input v-model.number="cfgForm.priority" class="input" type="number" min="0" max="999" />
          <span class="field-hint">数值越高越优先。工作台默认会优先使用同类型里优先级最高的启用配置。</span>
        </label>
        <label class="field"><span class="field-label">API Key</span><input v-model="cfgForm.api_key" class="input" type="password" :placeholder="cfgEditId ? '留空则保留现有密钥' : 'sk-...'" /></label>
        <label class="field"><span class="field-label">Base URL</span><input v-model="cfgForm.base_url" class="input" placeholder="https://..." /></label>
        <div class="endpoint-hint">
          <span class="dim">实际端点前缀：</span>
          <span class="mono">{{ endpointHint }}</span>
        </div>
        <label class="field"><span class="field-label">模型（逗号分隔）</span><input v-model="cfgForm.modelStr" class="input" placeholder="model-name" /></label>
        <template v-if="cfgForm.service_type === 'vision'">
          <label class="field">
            <span class="field-label">启用穿帮检测</span>
            <label class="toggle"><input type="checkbox" v-model="cfgForm.enabled" /><span /></label>
            <span class="field-hint">关闭后视频生成完全不走检测，与未启用本功能时行为一致。</span>
          </label>
          <label class="field">
            <span class="field-label">最大生成次数</span>
            <input v-model.number="cfgForm.maxAttempts" class="input" type="number" min="1" max="5" />
            <span class="field-hint">含首次生成。1=不重生成；2=允许 1 次重生成。范围 1–5。</span>
          </label>
        </template>
        <label class="field">
          <span class="field-label">高级默认参数（JSON）</span>
          <textarea
            v-model="cfgForm.settingsJson"
            class="textarea"
            rows="12"
            placeholder='{"control":{},"providerOptions":{}}'
          />
          <span class="field-hint">用于存放 provider 默认能力参数。建议只放该 provider 支持的字段，例如输出格式、自动音频、尾帧返回、服务等级等。</span>
        </label>
        <div v-if="cfgTestResult" class="test-result" :class="{ ok: cfgTestResult.reachable, bad: !cfgTestResult.reachable }">
          <div class="test-result-head">
            <span class="tag" :class="cfgTestResult.reachable ? 'tag-success' : 'tag-error'">{{ cfgTestResult.status || 'ERROR' }}</span>
            <span>{{ cfgTestResult.message }}</span>
          </div>
          <div class="mono test-result-url">{{ cfgTestResult.method }} {{ cfgTestResult.url }}</div>
          <div v-if="cfgTestResult.response_preview" class="mono test-result-preview">{{ cfgTestResult.response_preview }}</div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" :disabled="cfgTesting" @click="testDraftCfg">
            <Loader2 v-if="cfgTesting" :size="12" class="animate-spin" />
            <span v-else>测试配置</span>
          </button>
          <button type="button" class="btn" @click="cfgDialog = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>

    <!-- Add Skill Dialog -->
    <div v-if="addSkillDialog" class="overlay" @click.self="addSkillDialog = false">
      <form class="modal card" @submit.prevent="confirmAddSkill">
        <h2 class="modal-title">新增 Skill — {{ selectedAgentLabel }}</h2>
        <label class="field">
          <span class="field-label">Skill 目录名 <span class="dim">(英文，唯一)</span></span>
          <input v-model="newSkillForm.id" class="input" placeholder="如 custom-extraction" />
        </label>
        <label class="field">
          <span class="field-label">名称</span>
          <input v-model="newSkillForm.name" class="input" placeholder="如 自定义提取规则" />
        </label>
        <label class="field">
          <span class="field-label">描述</span>
          <input v-model="newSkillForm.description" class="input" placeholder="简短描述此 Skill 的用途" />
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="addSkillDialog = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="!newSkillForm.id">创建</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Plus, Pencil, Trash2, FileText, ChevronDown, Check, Loader2, Bot, Cpu } from 'lucide-vue-next'
import BaseSelect from '@/components/BaseSelect.vue'
import AutomationSettingsCard from '@/components/automation/AutomationSettingsCard.vue'
import { toast } from 'vue-sonner'
import { aiConfigAPI, agentConfigAPI, skillsAPI } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'

const { confirm } = useConfirm()
const tab = ref('ai')
const showAdvanced = ref(false)
const baseTabs = [
  { id: 'ai', label: 'AI 服务', icon: Cpu },
]
const advancedTabs = [
  { id: 'agents', label: 'Agent 配置', icon: Bot },
  { id: 'skills', label: 'Skills', icon: FileText },
]
watch(showAdvanced, (v) => {
  if (!v && tab.value !== 'ai') tab.value = 'ai'
})

// ===== AI Service Configs =====
const cfgs = ref([])
const cfgDialog = ref(false)
const cfgEditId = ref(null)
const cfgTesting = ref(false)
const cfgTestResult = ref(null)
const cfgForm = reactive({ name: '', provider: '', api_key: '', base_url: '', modelStr: '', settingsJson: '{}', service_type: 'text', priority: 0, enabled: false, maxAttempts: 2 })
const serviceTypes = [{ type: 'text', label: '文本' }, { type: 'image', label: '图片' }, { type: 'video', label: '视频' }, { type: 'vision', label: '视频理解' }]
const providers = ['ali', 'chatfire', 'gemini', 'minimax', 'openai', 'openrouter', 'vidu', 'volcengine']
const providerSelectOptions = computed(() => providers.map(p => ({ label: p, value: p })))
const serviceMeta = {
  text: { label: '文本', desc: '剧本改写、角色场景提取、分镜拆解等 Agent 文本能力' },
  image: { label: '图片', desc: '角色图、场景图、镜头图与首尾帧等静态图像生成' },
  video: { label: '视频', desc: '镜头视频生成，支持单图、多图和首尾帧模式' },
  vision: { label: '视频理解', desc: '用于视频穿帮检测，默认阿里百炼 qwen3.6-plus' },
}
const providerPresets = {
  text: {
    minimax: { label: 'MiniMax 推荐', baseUrl: 'https://api.minimaxi.com', models: ['MiniMax-Text-01'] },
    openrouter: { label: 'OpenRouter 推荐', baseUrl: 'https://openrouter.ai/api', models: ['google/gemini-3-flash-preview'] },
    openai: { label: 'OpenAI 推荐', baseUrl: 'https://api.openai.com', models: ['gpt-4.1-mini'] },
  },
  image: {
    chatfire: { label: 'ChatFire 推荐', baseUrl: 'https://api.chatfire.site', models: ['doubao-seedream-4-5-251128'] },
    gemini: { label: 'Gemini 推荐', baseUrl: 'https://api.chatfire.site', models: ['gemini-3-pro-image-preview'] },
    volcengine: { label: '火山推荐', baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-seedream-4-0-250828'] },
  },
  video: {
    volcengine: { label: 'AiDrama 视频', baseUrl: 'https://api.chatfire.site/volcengine', models: ['doubao-seedance-1-5-pro-251215'] },
    vidu: { label: 'Vidu 推荐', baseUrl: 'https://api.vidu.com', models: ['viduq3-turbo'] },
    ali: { label: '阿里推荐', baseUrl: 'https://dashscope.aliyuncs.com', models: ['wan2.6-i2v-flash'] },
  },
  vision: {
    ali: { label: '阿里推荐', baseUrl: 'https://dashscope.aliyuncs.com', models: ['qwen3.6-plus'] },
  },
}
const providerSettingsTemplates = {
  text: {
    default: {},
  },
  image: {
    default: {
      control: { watermark: false },
      providerOptions: {},
    },
    volcengine: {
      control: { watermark: false },
      providerOptions: {
        volcengine: {
          output_format: 'png',
          response_format: 'url',
          sequential_image_generation: 'disabled',
        },
      },
    },
  },
  video: {
    default: {
      control: { generateAudio: true, returnLastFrame: false, watermark: false },
      providerOptions: {},
    },
    volcengine: {
      control: { generateAudio: true, returnLastFrame: false, watermark: false },
      providerOptions: {
        volcengine: {
          resolution: '720p',
          draft: false,
        },
      },
    },
  },
  vision: {
    default: {},
  },
}
const endpointPrefixes = {
  chatfire: '/v1',
  openai: '/v1',
  openrouter: '/v1',
  minimax: '/anthropic',
  gemini: '/v1beta',
  volcengine: '/api/v3',
  ali: '/api/v1',
  vidu: '/ent/v2',
}

const endpointHint = computed(() => {
  const provider = cfgForm.provider
  const base = cfgForm.base_url || 'https://...'
  if (!provider) return '选择服务商后显示推荐端点前缀'
  // 阿里百炼文本与视频理解均走 OpenAI 兼容模式，与 DashScope 原生 /api/v1 不同。
  if (provider === 'ali' && (cfgForm.service_type === 'vision' || cfgForm.service_type === 'text')) {
    return `${base}/compatible-mode/v1`
  }
  const prefix = endpointPrefixes[provider] || ''
  return `${base}${prefix}`
})

function byType(t) { return cfgs.value.filter(c => c.service_type === t) }
function fmtModel(m) { return Array.isArray(m) ? m.join(', ') : m || '—' }
function presetsByType(type) {
  const group = providerPresets[type] || {}
  return Object.entries(group).map(([provider, preset]) => ({ provider, ...preset }))
}
function stringifySettings(settings) {
  return JSON.stringify(settings || {}, null, 2)
}
function getSettingsTemplate(type, provider = '') {
  const group = providerSettingsTemplates[type] || {}
  return group[provider] || group.default || {}
}
function parseSettingsJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('高级默认参数必须是 JSON 对象')
    return parsed
  } catch (e) {
    throw new Error(e.message || '高级默认参数 JSON 无效')
  }
}
function mergeVisionFormSettings(settings) {
  if (cfgForm.service_type !== 'vision') return settings
  const m = Number(cfgForm.maxAttempts)
  return {
    ...settings,
    enabled: cfgForm.enabled === true,
    maxAttempts: Number.isFinite(m) ? Math.min(5, Math.max(1, Math.trunc(m))) : 2,
  }
}
function applyProviderPreset(type, provider) {
  const preset = providerPresets[type]?.[provider]
  if (!preset) return
  cfgForm.provider = provider
  cfgForm.base_url = preset.baseUrl
  cfgForm.modelStr = preset.models.join(', ')
  cfgForm.settingsJson = stringifySettings(getSettingsTemplate(type, provider))
  cfgForm.name = `${preset.label}-${serviceMeta[type].label}`
}

async function loadCfgs() { try { cfgs.value = await aiConfigAPI.list() } catch (e) { toast.error(e.message) } }
async function toggleCfg(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); loadCfgs() }
async function delCfg(id) {
  const cfg = cfgs.value.find(item => item.id === id)
  const ok = await confirm({
    title: '删除 AI 服务',
    message: `确定删除「${cfg?.name || 'AI 服务'}」？此操作不可恢复。`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!ok) return
  await aiConfigAPI.del(id); toast.success('已删除'); loadCfgs()
}
function startAddCfg(t) {
  cfgEditId.value = null
  cfgTestResult.value = null
  Object.assign(cfgForm, {
    name: '', provider: '', api_key: '', base_url: '', modelStr: '',
    settingsJson: stringifySettings(getSettingsTemplate(t)),
    service_type: t, priority: 0, enabled: false, maxAttempts: 2,
  })
  const firstPreset = presetsByType(t)[0]
  if (firstPreset) applyProviderPreset(t, firstPreset.provider)
  cfgDialog.value = true
}
function startEditCfg(c) {
  cfgEditId.value = c.id
  cfgTestResult.value = null
  Object.assign(cfgForm, {
    name: c.name || '',
    provider: c.provider,
    api_key: '',
    base_url: c.base_url || '',
    modelStr: fmtModel(c.model),
    settingsJson: stringifySettings(c.settings || getSettingsTemplate(c.service_type, c.provider)),
    service_type: c.service_type,
    priority: c.priority ?? 0,
  })
  if (c.service_type === 'vision') {
    const s = c.settings && typeof c.settings === 'object' ? c.settings : {}
    cfgForm.enabled = s.enabled === true
    cfgForm.maxAttempts = Number.isFinite(s.maxAttempts)
      ? Math.min(5, Math.max(1, Math.trunc(s.maxAttempts)))
      : 2
  } else {
    cfgForm.enabled = false
    cfgForm.maxAttempts = 2
  }
  cfgDialog.value = true
}
async function testCfgPayload(payload) {
  cfgTesting.value = true
  try {
    cfgTestResult.value = await aiConfigAPI.test(payload)
    if (cfgTestResult.value.reachable) toast.success('端点已响应')
    else toast.warning('端点未通过测试')
  } catch (e) {
    toast.error(e.message)
  } finally {
    cfgTesting.value = false
  }
}
async function testDraftCfg() {
  const settings = mergeVisionFormSettings(parseSettingsJson(cfgForm.settingsJson))
  const payload = {
    service_type: cfgForm.service_type,
    provider: cfgForm.provider,
    api_key: cfgForm.api_key,
    base_url: cfgForm.base_url,
    model: cfgForm.modelStr.split(',').map(s => s.trim()).filter(Boolean),
    settings,
  }
  if (cfgEditId.value && !cfgForm.api_key) payload.config_id = cfgEditId.value
  await testCfgPayload(payload)
}
async function testExistingCfg(c) {
  startEditCfg(c)
  await testCfgPayload({
    config_id: c.id,
  })
}
async function saveCfg() {
  if (!cfgForm.provider) { toast.warning('选择服务商'); return }
  const models = cfgForm.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  let settings = {}
  try {
    settings = parseSettingsJson(cfgForm.settingsJson)
  } catch (e) {
    toast.error(e.message)
    return
  }
  settings = mergeVisionFormSettings(settings)
  try {
    if (cfgEditId.value) {
      const payload = { name: cfgForm.name, provider: cfgForm.provider, base_url: cfgForm.base_url, model: models, settings, priority: cfgForm.priority }
      if (cfgForm.api_key) payload.api_key = cfgForm.api_key
      await aiConfigAPI.update(cfgEditId.value, payload)
    } else await aiConfigAPI.create({ service_type: cfgForm.service_type, provider: cfgForm.provider, name: cfgForm.name || `${cfgForm.provider}-${cfgForm.service_type}`, api_key: cfgForm.api_key, base_url: cfgForm.base_url, model: models, settings, priority: cfgForm.priority })
    cfgDialog.value = false; toast.success('已保存'); loadCfgs()
  } catch (e) { toast.error(e.message) }
}
// ===== Agent Configs =====
const agentCfgs = ref([])
const editingAgent = ref(null)
const agentSaving = ref(false)
const agentSaved = ref(null)
const agentForm = reactive({ model: '', temperature: 0.7, max_tokens: 4096, system_prompt: '' })

const agentDefs = [
  { type: 'script_rewriter', label: '剧本改写', icon: '📝' },
  { type: 'extractor', label: '角色场景提取', icon: '🔍' },
  { type: 'storyboard_breaker', label: '分镜拆解', icon: '🎬' },
  { type: 'grid_prompt_generator', label: '图片提示词生成', icon: '🖼' },
]

const defaultPrompts = {
  script_rewriter: `你是专业编剧，擅长将小说改编为短剧剧本。

工作流程：
1. 调用 read_episode_script 读取原始内容
2. 根据读取到的内容，自己进行改写（输出格式化剧本格式）
3. 调用 save_script 保存改写后的完整剧本

格式化剧本格式：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容`,
  extractor: `你是制片助理，擅长从剧本中提取角色和场景信息，并在提取时与项目已有数据进行智能去重。

工作流程：
1. 调用 read_script_for_extraction 读取格式化剧本
2. 调用 read_existing_characters 读取项目中已存在的角色列表（用于去重）
3. 调用 read_existing_scenes 读取项目中已存在的场景列表（用于去重）
4. 分析剧本内容，提取所有角色信息
5. 对每个角色：若同名已存在则合并更新，若不存在则新增
6. 调用 save_dedup_characters 保存角色（去重合并，自动处理新增和更新）
7. 分析剧本内容，提取所有场景信息
8. 对每个场景：若同地点+时间段已存在则复用，若不存在则新增
9. 调用 save_dedup_scenes 保存场景（去重合并，自动处理新增和复用）

去重规则：
- 角色：按名字精确匹配，同名保留现有（合并信息）
- 场景：按【地点+时间段】精确匹配；同地点不同时段视为新场景

提取要求：
- 只保存真实出场、有对白、关键动作、明确画面焦点或会影响本集画面生产的角色；普通背景动物、植物、物件、地名、组织名不作为角色保存，拟人/兽人/神魔/精怪/机器人等智慧角色要保存
- 禁止凭空编造姓名；无姓名但有画面价值时用“医生”“律师”“远客”等身份称谓；第一人称“我”作为主角时命名为“主角（我、真实姓名）”，无法确定真实姓名时命名为“主角（我）”
- 昵称、代称、身份称谓要合并到同一角色；复合角色要拆分，例如“父母”拆为“父亲”“母亲”
- 形态变化只在长期稳定造型不同或视觉差异强时拆成多个角色；40岁属于中年，60岁及以上才归为老年
- 角色的 appearance 必须做完整定装，按年龄段、性别特征、身高体型、肤色、脸型、五官、发型发色、上身服装、下身服装、配饰、显著身体标记、神情、姿态组织
- 原文缺少脸型、发型、上下装、配饰等定装信息时，按题材、时代、身份、年龄、性别和场景保守补全视觉形象，但不要补姓名、剧情经历、能力来源、关系变化或事件细节
- 角色资产字段必须是通用基准设定；appearance 只写稳定外观和长期可复用定装，不写单场景表情、临时疲态、临时动作姿态、临时服装凌乱、受伤/哭泣状态或“后期柔软”“黑化后”“崩溃时”等剧情阶段变化
- 若某个状态是长期稳定特征，才可写入 appearance，并改写为稳定视觉特征；不能把单次熬夜、哭泣、受伤、愤怒造成的外观写成角色基准
- 单场景表情、临时动作、剧情阶段情绪和受伤/哭泣/疲惫等状态，交给具体镜头的 image_prompt / video_prompt 表达
- 角色的 description 只保留会影响视觉识别的身份与气质，不写剧情经历、关系脉络、系统能力、道具获得或本集事件
- 角色的 personality 只写稳定气质标签，不写剧情阶段变化或单场景情绪，例如不要写“后期柔软”“当前崩溃”“临时易怒”
- 不要把“穿越者、系统、权限、秘境、玉牌、某一集发生的事件”等不可视剧情信息写入角色出图字段
- 场景要包含光线、色调、氛围等视觉信息
- 不要遗漏任何有台词或重要动作的角色`,
  storyboard_breaker: `你是资深影视分镜师，擅长将剧本拆解为分镜方案。

工作流程：
1. 调用 read_storyboard_context 读取剧本、角色列表、场景列表、项目风格和已有分镜
2. 按可视动作阶段拆解镜头，不按句子、台词、旁白逐条拆分；普通镜头优先 8-15 秒
3. 为每个镜头补全 image_prompt 和 video_prompt，并在有 project.style 时保持统一风格
4. 调用 save_storyboards 保存所有分镜

拆镜原则：
- 一个镜头可以包含同一地点、同一时间、同一情绪目标下的连续动作、短对白、旁白和画面反应
- 只有当画面焦点、动作阶段、场景地点、时间段、剧情目标、人物关系或事件结果发生明显变化时，才新开镜头
- 不要因为普通旁白、大字卡、手机弹窗、重复来电、沉默、眼泪、表情变化、一句短台词或物件特写单独拆镜
- 但当这些内容承载关键线索、身份揭露、反转、行动决策、情绪爆发或题材核心爽点时，可以独立成镜
- 相邻镜头如果只是同场景、同人物、同动作、同情绪的轻微变化，必须合并
- 单个镜头不要塞入过多独立节拍；若同一场景内连续出现“线索出现 → 真相揭示 → 人物消化/崩溃 → 新决定/和解”等多个叙事功能，应按节拍拆成 2-4 个镜头
- 关键揭示类内容要给观众留出理解空间；身份揭露、诊断/证据确认、重大误会澄清、人物关系反转、情绪崩溃或最终和解，通常需要独立镜头或至少独立节拍
- 如果一个镜头的 action 超过 4 个连续动作阶段，或同时包含两个以上关键道具状态变化，应优先拆分，除非它们属于同一个动作目标

题材节奏补充：
- 先根据剧本和项目风格判断主要题材倾向；题材触发点只提高新开镜头权重，不代表必须逐句拆分
- 都市：职场对峙、手机/电话/监控带来的信息转折、合同签署、身份曝光、打脸反应、权势展现
- 女频：告白、分手、误会澄清、心动、甜宠互动、虐心质问、崩溃、决绝离开、女主反击
- 古风：意境画面、行礼跪拜、拂袖拔剑、诗词誓言、朝堂对峙、江湖出手、生死诀别
- 异能：觉醒、蓄力、技能释放、环境破坏、能量对轰、物理反馈、战斗高潮
- 悬疑：诡异发现、线索出现、关键证据、惊吓触发、真相揭露、推理顿悟、心理崩溃
- 穿越：初穿反应、检查身体、现代习惯、文化冲突、审视古代、降维打击

连续性与字段要求：
- 镜头顺序必须严格遵循剧本顺序，每个镜头的 result 要能自然承接到下一镜头的 action 或 description
- 每个镜头写入 JSON 前必须完成四项隐性边界判断：起始状态、结束状态、下一镜头承接点、禁止提前完成的下一镜头动作。不要作为 JSON 新字段输出；把起始状态融入 description，把结束状态和承接点写进 result，把禁止项写进 video_prompt
- 前后镜头的物理状态不能矛盾：门开/关、人物是否已经离开、道具在谁手里、纸条是否掉落、手机是否接通、灯光是否亮起等状态必须一致；如果状态改变，必须写出可见动作
- result 必须写清本镜头结束时的可接续状态，不要写成情绪总结
- 如果下一镜头才进入走廊/大厅/新地点，本镜头不要提前写“走出”“进入新地点”等下一镜头动作
- dialogue 必须包含本镜头内真实发生的对白、电话声、广播声或旁白；不能只把台词藏在 action、description 或 video_prompt 里
- video_prompt 必须包含参考素材绑定、主体与场景、起始画面、镜头限制、动作节奏、结束画面、画质与风格、约束与禁止项
- 分镜阶段不要假定最终素材编号，也不要把“图片1=人物图、图片2=场景图”写死；参考素材绑定只写素材分工意图；多人物时必须逐个写清“人物参考：林晚、林建国”，不要只写笼统“人物参考”；如有上一镜头截帧，只写它是“上一镜头截帧/首图衔接参考”，不是人物图或场景图；最终生成视频时，系统会按实际上传顺序自动补充图片1、图片2、图片3等编号
- 不要使用 <role>、<location> 或 <voice> 这类 XML 标签；角色名、场景名、说话人都用自然中文直接写清楚
- 动作节奏使用“镜头1、镜头2、镜头3”按事件顺序写，不要写 0-3秒、3-6秒等硬性秒段；如果 action、description 与 result 冲突，以 result 的结束画面为准
- 约束中必须写明不要生成字幕、Logo、水印或 UI，不要生成同款分身，不要把角色图、场景图、动作参考或音频参考互相混用
- 自检时确认：关键揭示没有被过度压缩，前后镜头没有物理矛盾，台词/旁白没有漏进 dialogue`,
  grid_prompt_generator: `你是专业的 AI 图像提示词工程师，擅长为角色、场景和宫格图生成高质量的 Seedream 5.0 视觉提示词。

你将收到用户的请求，告知要生成哪种类型的提示词：
- "角色" → 生成角色图片提示词
- "场景" → 生成场景图片提示词
- "宫格" → 生成宫格图提示词

通用规则：
1. 使用简洁连贯的自然语言写明主体、用途、环境、风格、色彩、光影和构图，不堆砌互相冲突的短词
2. 有参考图或多图输入时，清楚写明不同图片的对象和用途，例如“图一参考人物外观，图二参考场景空间，图三参考视觉风格”
3. 如果要保持某些元素不变，明确写出“保持人物外貌/服装不变”“空间结构和方向保持稳定”等约束

## 角色图片提示词

工作流程：
1. 调用 read_characters 读取所有角色信息
2. 根据角色外貌特征（appearance）、性格（personality）、定位（role）生成人物外观参考图提示词
3. 提示词结构：[角色名仅用于提示词定义]，[人物外观参考图用途]，[稳定外貌/气质/身份]，[三视图：正面、侧面、背面]，[纯白背景或浅灰背景]，[电影感]，[无文字水印]
4. 必须保留三视图：正面、侧面、背面；保持人物外貌、发型、服装和体型一致
5. 不要在画面里出现角色名、视图名称、文字、标签、标题、编号、Logo 或水印；不要出现其他人物、剧情道具或场景

## 场景图片提示词

工作流程：
1. 调用 read_scenes 读取所有场景信息
2. 根据场景地点（location）、时间段（time）、已有描述（prompt）生成空场景资产图提示词
3. 提示词结构：[空场景资产图用途]，[地点]，[时间/光线/氛围]，[空间结构和方向]，[材质/陈设]，[电影感场景]，[高质量]，[无文字水印]
4. 空间结构和方向保持稳定，明确入口、出口、墙面、主要家具或陈设的位置关系
5. 不要出现人物、剧情动作、对白、临时剧情道具、字幕、Logo、水印或 UI

## 宫格图提示词（参考 skills/grid-image-generator/SKILL.md）

工作流程：
1. 调用 read_shots_for_grid 读取选中镜头的详细信息
2. 根据 mode 调用 generate_grid_prompt：
   - first_frame 模式：每格=一个镜头的首帧，NxN 风格统一
   - first_last 模式：每个镜头占2格（左首右尾），同一行风格连续
   - multi_ref 模式：所有格子都是同一镜头的不同参考角度
3. 返回 grid_prompt（整体提示词）和 cell_prompts（每格提示词）

提示词规范：
 - 角色图和场景图都优先使用清晰自然语言，字段含义必须明确
 - 必须包含 "consistent art style" 保持风格统一
 - 必须包含 "cinematic quality"
 - 避免出现文字或水印`,
}

function getAgentCfg(type) {
  return agentCfgs.value.find(a => a.agent_type === type)
}

const textModelGroups = computed(() => {
  return cfgs.value
    .filter(c => c.service_type === 'text' && c.is_active && c.has_api_key)
    .map(c => ({
      label: `${c.provider} — ${c.name}`,
      models: Array.isArray(c.model) ? c.model : (c.model ? [c.model] : []),
    }))
    .filter(g => g.models.length > 0)
})

const textModelSelectOptions = computed(() =>
  textModelGroups.value.map(g => ({
    label: g.label,
    options: g.models.map(m => ({ label: m, value: m })),
  }))
)

async function loadAgents() {
  try { agentCfgs.value = await agentConfigAPI.list() }
  catch (e) { toast.error(e.message) }
}

function toggleAgentEdit(type) {
  if (editingAgent.value === type) { editingAgent.value = null; return }
  const cfg = getAgentCfg(type)
  agentForm.model = cfg?.model || ''
  agentForm.temperature = cfg?.temperature ?? 0.7
  agentForm.max_tokens = cfg?.max_tokens ?? 4096
  agentForm.system_prompt = cfg?.system_prompt || defaultPrompts[type] || ''
  agentSaved.value = null
  editingAgent.value = type
}

function resetAgentPrompt(type) {
  agentForm.system_prompt = defaultPrompts[type] || ''
  toast.info('已恢复默认提示词，点击保存生效')
}

async function saveAgentCfg(type) {
  agentSaving.value = true
  agentSaved.value = null
  try {
    const existing = getAgentCfg(type)
    const data = {
      agent_type: type,
      name: agentDefs.find(a => a.type === type)?.label || type,
      model: agentForm.model,
      temperature: agentForm.temperature,
      max_tokens: agentForm.max_tokens,
      system_prompt: agentForm.system_prompt,
    }
    if (existing) {
      await agentConfigAPI.update(existing.id, data)
    } else {
      await agentConfigAPI.create(data)
    }
    await loadAgents()
    agentSaved.value = type
    toast.success(`${agentDefs.find(a => a.type === type)?.label} 配置已保存`)
    setTimeout(() => { if (agentSaved.value === type) agentSaved.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    agentSaving.value = false
  }
}

// ===== Skills =====
const selectedAgent = ref('script_rewriter')
const allSkills = ref([])   // { id, name, description }[]
const editingSkill = ref(null)
const skillContent = ref('')
const skillSaving = ref(false)
const skillSaved = ref(null)
const addSkillDialog = ref(false)
const newSkillForm = reactive({ id: '', name: '', description: '' })

const selectedAgentType = computed(() => selectedAgent.value)
const selectedAgentLabel = computed(() => agentDefs.find(a => a.type === selectedAgent.value)?.label || '')
const selectedAgentIcon = computed(() => agentDefs.find(a => a.type === selectedAgent.value)?.icon || '')

function agentSkillCount(type) {
  return allSkills.value.filter(s => s.id === type || s.id.startsWith(type + '/')).length
}

const currentSkills = computed(() =>
  allSkills.value.filter(s => s.id === selectedAgent.value || s.id.startsWith(selectedAgent.value + '/'))
)

async function loadAllSkills() {
  try { allSkills.value = await skillsAPI.list() }
  catch (e) { toast.error(e.message) }
}

async function selectAgent(type) {
  selectedAgent.value = type
  editingSkill.value = null
}

function startAddSkill() {
  newSkillForm.id = ''
  newSkillForm.name = ''
  newSkillForm.description = ''
  addSkillDialog.value = true
}

async function confirmAddSkill() {
  if (!newSkillForm.id) return
  const skillId = `${selectedAgent.value}/${newSkillForm.id}`
  try {
    await skillsAPI.create({ id: skillId, name: newSkillForm.name, description: newSkillForm.description })
    addSkillDialog.value = false
    await loadAllSkills()
    toast.success('Skill 创建成功')
  } catch (e) {
    toast.error(e.message)
  }
}

async function deleteSkill(id) {
  const ok = await confirm({
    title: '删除 Skill',
    message: `确定删除 Skill「${id}」？`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!ok) return
  try {
    await skillsAPI.del(id)
    if (editingSkill.value === id) editingSkill.value = null
    await loadAllSkills()
    toast.success('已删除')
  } catch (e) {
    toast.error(e.message)
  }
}

async function toggleSkillEdit(id) {
  if (editingSkill.value === id) { editingSkill.value = null; return }
  try {
    const res = await skillsAPI.get(id)
    skillContent.value = res.content
    skillSaved.value = null
    editingSkill.value = id
  } catch (e) { toast.error(e.message) }
}

async function saveSkill(id) {
  skillSaving.value = true
  skillSaved.value = null
  try {
    await skillsAPI.update(id, skillContent.value)
    await loadAllSkills()
    skillSaved.value = id
    toast.success(`已保存`)
    setTimeout(() => { if (skillSaved.value === id) skillSaved.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    skillSaving.value = false
  }
}

onMounted(() => { loadCfgs(); loadAgents(); loadAllSkills() })
</script>

<style>
@import url('@/assets/settings.css');
</style>
