<template>
  <div class="character-assets page">
    <div class="character-assets__head">
      <div>
        <h1 class="page-title">角色形象库</h1>
        <p class="page-desc">沉淀可复用的角色参考图，让主角、配角和自定义角色在后续分集里保持稳定。</p>
      </div>
      <button class="btn btn-primary character-assets__primary" @click="openCreate()">
        <Plus :size="14" />
        新建形象
      </button>
    </div>

    <div class="character-assets__summary" aria-label="角色形象统计">
      <div>
        <span>总形象</span>
        <strong>{{ assets.length }}</strong>
      </div>
      <div>
        <span>默认形象</span>
        <strong>{{ defaultAssetCount }}</strong>
      </div>
      <div>
        <span>当前筛选</span>
        <strong>{{ visibleAssetCount }}</strong>
      </div>
    </div>

    <div class="character-assets__tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        :class="['character-assets__tab', activeTab === tab.id && 'is-active']"
        type="button"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span>{{ tab.count }}</span>
      </button>
    </div>

    <div class="character-assets__content">
      <div class="character-assets__filters">
        <label class="character-assets__search">
          <Search :size="14" />
          <input v-model.trim="search" type="search" placeholder="搜索角色名称" />
        </label>

        <div class="character-assets__filter-actions">
          <select v-model="genderFilter" class="input character-assets__select">
            <option value="all">全部性别</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="unknown">未知</option>
          </select>
          <select v-model="typeFilter" class="input character-assets__select">
            <option value="all">全部形象</option>
            <option value="male_lead">男主</option>
            <option value="female_lead">女主</option>
            <option value="supporting">配角</option>
            <option value="villain">反派</option>
            <option value="custom">自定义</option>
          </select>
          <select v-model="sortMode" class="input character-assets__select">
            <option value="latest">最新创建</option>
            <option value="name">名称排序</option>
          </select>
          <div class="character-assets__view-toggle">
            <button :class="{ 'is-active': viewMode === 'grid' }" type="button" title="网格视图" @click="viewMode = 'grid'">
              <LayoutGrid :size="14" />
            </button>
            <button :class="{ 'is-active': viewMode === 'list' }" type="button" title="列表视图" @click="viewMode = 'list'">
              <List :size="14" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="character-assets__loading">
        <div v-for="i in 6" :key="i" class="character-assets__skeleton"></div>
      </div>

      <template v-else>
        <section v-if="showMainSection" class="character-assets__section">
          <div class="character-assets__section-title">
            <h2>主角形象</h2>
            <span>{{ visibleMainAssets.length }}</span>
          </div>
          <div :class="['character-assets__grid', viewMode === 'list' && 'is-list']">
            <CharacterAssetCard
              v-for="asset in visibleMainAssets"
              :key="asset.id"
              :asset="asset"
              :view-mode="viewMode"
              @edit="openEdit"
              @delete="deleteAsset"
              @open-preview="openPreview"
            />
            <button class="character-assets__add-card" type="button" @click="openCreate('male_lead')">
              <Plus :size="20" />
              <span>添加主角形象</span>
            </button>
          </div>
        </section>

        <section v-if="showOtherSection" class="character-assets__section">
          <div class="character-assets__section-title">
            <h2>其他角色形象</h2>
            <span>{{ visibleOtherAssets.length }}</span>
          </div>
          <div :class="['character-assets__grid', viewMode === 'list' && 'is-list']">
            <CharacterAssetCard
              v-for="asset in visibleOtherAssets"
              :key="asset.id"
              :asset="asset"
              :view-mode="viewMode"
              @edit="openEdit"
              @delete="deleteAsset"
              @open-preview="openPreview"
            />
            <button class="character-assets__add-card" type="button" @click="openCreate('custom')">
              <Plus :size="20" />
              <span>添加新形象</span>
            </button>
          </div>
        </section>

        <div v-if="!visibleMainAssets.length && !visibleOtherAssets.length" class="character-assets__empty-shell">
          <div class="character-assets__empty">
            <UserRound :size="28" />
            <h3>还没有匹配的角色形象</h3>
            <p>上传角色形象后，可以在剧集角色里显式绑定使用。</p>
            <button class="btn btn-primary" @click="openCreate()">新建形象</button>
          </div>
        </div>
      </template>
    </div>

    <div v-if="showEditor" class="overlay" @click.self="closeEditor">
      <div class="character-assets__dialog card">
        <div class="character-assets__dialog-head">
          <div>
            <h2>{{ editingAsset ? '编辑形象' : '新建形象' }}</h2>
            <p>上传一张清晰的角色形象，后续可以绑定到任意剧集角色。</p>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" @click="closeEditor">
            <X :size="15" />
          </button>
        </div>

        <form class="character-assets__form" @submit.prevent="saveAsset">
          <label class="character-assets__image-picker">
            <input type="file" accept="image/*" @change="handleFileChange" />
            <img v-if="previewSrc" :src="previewSrc" alt="" />
            <span v-else>
              <Upload :size="22" />
              上传角色形象
            </span>
          </label>

          <div class="character-assets__form-grid">
            <label class="field">
              <span class="field-label">角色名称</span>
              <input v-model.trim="form.name" class="input" required placeholder="例如：陆景川" />
            </label>

            <label class="field">
              <span class="field-label">性别</span>
              <select v-model="form.gender" class="input">
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="unknown">未知</option>
              </select>
            </label>

            <label class="field">
              <span class="field-label">角色类型</span>
              <select v-model="form.rolePreset" class="input">
                <option value="male_lead">男主</option>
                <option value="female_lead">女主</option>
                <option value="supporting">配角</option>
                <option value="villain">反派</option>
                <option value="custom">自定义</option>
              </select>
            </label>

            <label class="field">
              <span class="field-label">标签</span>
              <input v-model.trim="form.tags" class="input" placeholder="职业 / 气质 / 造型，用逗号分隔" />
            </label>
          </div>

          <label class="field">
            <span class="field-label">角色描述</span>
            <textarea v-model.trim="form.description" class="textarea character-assets__textarea" rows="3" placeholder="补充年龄、职业、性格或外貌要点"></textarea>
          </label>

          <label class="character-assets__default-check">
            <input v-model="form.isDefault" type="checkbox" />
            <span>设为该类型默认形象</span>
          </label>

          <div class="character-assets__dialog-actions">
            <button class="btn" type="button" @click="closeEditor">取消</button>
            <button class="btn btn-primary" type="submit" :disabled="assetBusy">
              {{ assetBusy ? '保存中' : '保存形象' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div v-if="previewImage.open && previewImage.src" class="overlay character-assets__preview-overlay" @click.self="closePreview">
      <div class="character-assets__preview">
        <div class="character-assets__preview-head">
          <div class="character-assets__preview-copy">
            <h2>{{ previewImage.title || '角色形象预览' }}</h2>
            <p>{{ previewImage.meta || '角色形象库' }}</p>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" title="关闭" @click="closePreview">
            <X :size="15" />
          </button>
        </div>
        <div class="character-assets__preview-body">
          <img :src="assetUrl(previewImage.src)" :alt="previewImage.title || '角色形象预览'" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { LayoutGrid, List, Pencil, Plus, Search, Trash2, Upload, UserRound, X, ZoomIn } from 'lucide-vue-next'
import { characterAssetAPI, uploadAPI } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'
import { assetUrl } from '@/utils/asset-url'

const { confirm } = useConfirm()
const assets = ref([])
const loading = ref(false)
const assetBusy = ref(false)
const activeTab = ref('all')
const search = ref('')
const genderFilter = ref('all')
const typeFilter = ref('all')
const sortMode = ref('latest')
const viewMode = ref('grid')
const showEditor = ref(false)
const editingAsset = ref(null)
const pendingFile = ref(null)
const previewUrl = ref('')
const previewImage = ref({ open: false, src: '', title: '', meta: '' })
const form = ref(defaultForm())

const mainRolePresets = new Set(['male_lead', 'female_lead'])
const defaultAssetCount = computed(() => assets.value.filter(asset => asset?.is_default || asset?.isDefault).length)

const filteredAssets = computed(() => {
  const keyword = search.value.toLowerCase()
  const rows = assets.value.filter((asset) => {
    const rolePreset = getRolePreset(asset)
    if (activeTab.value === 'main' && !mainRolePresets.has(rolePreset)) return false
    if (activeTab.value === 'others' && mainRolePresets.has(rolePreset)) return false
    if (genderFilter.value !== 'all' && getGender(asset) !== genderFilter.value) return false
    if (typeFilter.value !== 'all' && rolePreset !== typeFilter.value) return false
    if (!keyword) return true
    return [
      asset.name,
      asset.description,
      asset.appearance,
      ...(Array.isArray(asset.tags) ? asset.tags : []),
    ].filter(Boolean).join(' ').toLowerCase().includes(keyword)
  })

  return [...rows].sort((a, b) => {
    if (sortMode.value === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
    return assetTime(b) - assetTime(a)
  })
})

const visibleMainAssets = computed(() => filteredAssets.value.filter(asset => mainRolePresets.has(getRolePreset(asset))))
const visibleOtherAssets = computed(() => filteredAssets.value.filter(asset => !mainRolePresets.has(getRolePreset(asset))))
const visibleAssetCount = computed(() => filteredAssets.value.length)
const showMainSection = computed(() => activeTab.value !== 'others' && visibleMainAssets.value.length > 0)
const showOtherSection = computed(() => activeTab.value !== 'main' && visibleOtherAssets.value.length > 0)
const previewSrc = computed(() => previewUrl.value || imageSource(editingAsset.value))
const tabs = computed(() => {
  const mainCount = assets.value.filter(asset => mainRolePresets.has(getRolePreset(asset))).length
  const otherCount = Math.max(0, assets.value.length - mainCount)
  return [
    { id: 'all', label: '全部形象', count: assets.value.length },
    { id: 'main', label: '主角形象', count: mainCount },
    { id: 'others', label: '其他角色形象', count: otherCount },
  ]
})

const CharacterAssetCard = defineComponent({
  props: {
    asset: { type: Object, required: true },
    viewMode: { type: String, default: 'grid' },
  },
  emits: ['edit', 'delete', 'open-preview'],
  setup(props, { emit }) {
    const openPreview = (event) => {
      event.stopPropagation()
      emit('open-preview', props.asset)
    }

    return () => h('article', {
      class: ['character-asset-card', props.viewMode === 'list' && 'is-list'],
    }, [
      h('div', { class: 'character-asset-card__image' }, [
        imageSource(props.asset)
          ? h('button', {
            type: 'button',
            class: 'character-asset-card__preview-trigger',
            title: '放大预览',
            onClick: openPreview,
          }, [
            h('img', { src: assetUrl(imageSource(props.asset)), alt: props.asset.name || '角色形象' }),
            h('span', { class: 'character-asset-card__preview-icon' }, [h(ZoomIn, { size: 14 })]),
          ])
          : h(UserRound, { size: 34 }),
        h('span', { class: ['character-asset-card__ribbon', getRolePreset(props.asset)] }, rolePresetLabel(getRolePreset(props.asset))),
      ]),
      h('div', { class: 'character-asset-card__body' }, [
        h('div', { class: 'character-asset-card__title-row' }, [
          h('h3', props.asset.name || '未命名角色'),
          h('span', { class: ['character-asset-card__gender', getGender(props.asset)] }, genderLabel(getGender(props.asset))),
        ]),
        h('p', { class: 'character-asset-card__meta' }, cardMeta(props.asset)),
        h('div', { class: 'character-asset-card__tags' }, cardTags(props.asset).map(tag => h('span', tag))),
      ]),
      h('div', { class: 'character-asset-card__actions' }, [
        props.asset.is_default || props.asset.isDefault
          ? h('span', { class: 'character-asset-card__default' }, '默认')
          : null,
        h('button', { type: 'button', title: '编辑', onClick: () => emit('edit', props.asset) }, [h(Pencil, { size: 14 })]),
        h('button', { type: 'button', title: '删除', onClick: () => emit('delete', props.asset) }, [h(Trash2, { size: 14 })]),
      ]),
    ])
  },
})

function defaultForm(rolePreset = 'custom') {
  return {
    name: '',
    gender: rolePreset === 'male_lead' ? 'male' : rolePreset === 'female_lead' ? 'female' : 'unknown',
    rolePreset,
    tags: '',
    description: '',
    isDefault: rolePreset === 'male_lead' || rolePreset === 'female_lead',
  }
}

function getRolePreset(asset) {
  return asset?.role_preset || asset?.rolePreset || 'custom'
}

function getGender(asset) {
  return asset?.gender || 'unknown'
}

function imageSource(asset) {
  return asset?.image_url || asset?.imageUrl || asset?.local_path || asset?.localPath || ''
}

function assetTime(asset) {
  return new Date(asset?.updated_at || asset?.updatedAt || asset?.created_at || asset?.createdAt || 0).getTime()
}

function rolePresetLabel(rolePreset) {
  switch (rolePreset) {
    case 'male_lead':
      return '男主'
    case 'female_lead':
      return '女主'
    case 'supporting':
      return '配角'
    case 'villain':
      return '反派'
    default:
      return '自定义'
  }
}

function genderLabel(gender) {
  if (gender === 'male') return '男'
  if (gender === 'female') return '女'
  return '未知'
}

function normalizedTags(asset) {
  if (Array.isArray(asset?.tags)) return asset.tags.map(tag => String(tag || '').trim()).filter(Boolean)
  if (typeof asset?.tags === 'string') return asset.tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean)
  return []
}

function cardTags(asset) {
  const tags = normalizedTags(asset)
  if (tags.length) return tags.slice(0, 3)
  const description = String(asset?.description || asset?.appearance || '').trim()
  return description ? description.split(/[,，\/｜\s]+/).filter(Boolean).slice(0, 3) : ['全局形象']
}

function cardMeta(asset) {
  const desc = String(asset?.description || asset?.appearance || '').trim()
  return desc || `${rolePresetLabel(getRolePreset(asset))} / ${genderLabel(getGender(asset))}`
}

function openPreview(asset) {
  const src = imageSource(asset)
  if (!src) return
  previewImage.value = {
    open: true,
    src,
    title: asset?.name || '角色形象预览',
    meta: cardMeta(asset),
  }
}

function closePreview() {
  previewImage.value = { open: false, src: '', title: '', meta: '' }
}

async function loadAssets(options = {}) {
  if (!options.silent) loading.value = true
  try {
    assets.value = await characterAssetAPI.list()
  } catch (error) {
    toast.error(error?.message || '角色形象加载失败')
  } finally {
    if (!options.silent) loading.value = false
  }
}

function openCreate(rolePreset = 'custom') {
  editingAsset.value = null
  pendingFile.value = null
  previewUrl.value = ''
  form.value = defaultForm(rolePreset)
  showEditor.value = true
}

function openEdit(asset) {
  editingAsset.value = asset
  pendingFile.value = null
  previewUrl.value = ''
  form.value = {
    name: asset?.name || '',
    gender: getGender(asset),
    rolePreset: getRolePreset(asset),
    tags: normalizedTags(asset).join(', '),
    description: asset?.description || asset?.appearance || '',
    isDefault: Boolean(asset?.is_default || asset?.isDefault),
  }
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
  editingAsset.value = null
  pendingFile.value = null
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function handleFileChange(event) {
  const input = event.target
  const file = input?.files?.[0]
  if (!file) return
  pendingFile.value = file
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(file)
  if (!form.value.name) form.value.name = String(file.name || '').replace(/\.[^.]+$/, '').trim()
  if (input) input.value = ''
}

async function saveAsset() {
  if (!form.value.name) return
  if (!editingAsset.value && !pendingFile.value) {
    toast.warning('请先上传角色形象')
    return
  }

  assetBusy.value = true
  try {
    let uploaded = null
    if (pendingFile.value) uploaded = await uploadAPI.image(pendingFile.value)

    const payload = {
      name: form.value.name,
      gender: form.value.gender,
      role_preset: form.value.rolePreset,
      description: form.value.description,
      tags: form.value.tags ? form.value.tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean) : [],
      is_default: Boolean(form.value.isDefault),
    }

    if (uploaded) {
      payload.image_url = uploaded.url
      payload.local_path = uploaded.path
    }

    if (editingAsset.value?.id) await characterAssetAPI.update(editingAsset.value.id, payload)
    else await characterAssetAPI.create(payload)

    await loadAssets()
    closeEditor()
    toast.success('角色形象已保存')
  } catch (error) {
    toast.error(error?.message || '角色形象保存失败')
  } finally {
    assetBusy.value = false
  }
}

async function deleteAsset(asset) {
  if (!asset?.id) return
  const ok = await confirm({
    title: '删除角色形象',
    message: `确定删除「${asset.name || '角色形象'}」吗？`,
    confirmText: '删除',
    variant: 'danger',
  })
  if (!ok) return
  try {
    await characterAssetAPI.del(asset.id)
    await loadAssets()
    toast.success('角色形象已删除')
  } catch (error) {
    toast.error(error?.message || '角色形象删除失败')
  }
}

onMounted(loadAssets)
</script>

<style>
@import url('@/assets/character-assets.css');
</style>
