<template>
  <div class="prod-content">
    <div class="prod-section-bar">
      <div class="prod-section-copy">
        <div class="prod-section-title-row">
          <span class="prod-section-title">镜头视频合成</span>
          <span class="tag mono">{{ state.composedCount }}/{{ state.sbs.length }} 已合成</span>
        </div>
        <div class="prod-section-desc">把已生成镜头视频整理为可导出的合成片段；已有结果可再次合成覆盖。</div>
      </div>
      <div class="prod-section-stats">
        <span class="tag">{{ state.sbs.length }} 个镜头</span>
        <span class="tag">{{ state.shotVidCount }} 个已有源视频</span>
      </div>
      <div class="prod-section-actions">
        <button class="btn btn-sm" @click="handlers.batchCompose()">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          批量合成
        </button>
      </div>
    </div>
    <div class="prod-grid">
      <div v-for="(sb, i) in state.sbs" :key="sb.id" class="card prod-card prod-card--compose">
        <div class="prod-cover">
          <video
            v-if="state.hasComposed(sb)"
            :src="assetUrl(state.getComposedVideoUrl(sb))"
            class="prod-video"
            controls
            preload="metadata"
            playsinline
          />
          <video
            v-else-if="state.hasVid(sb)"
            :src="assetUrl(state.getVideoUrl(sb))"
            class="prod-video"
            controls
            preload="metadata"
            playsinline
          />
          <img
            v-else-if="state.hasImg(sb)"
            :src="assetUrl(state.getStoryboardCover(sb))"
            class="previewable-image"
            @click.stop="handlers.openImageByPath(state.getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
          />
          <div v-else class="prod-cover-empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </div>
          <span class="prod-idx">#{{ String(i + 1).padStart(2, '0') }}</span>
          <span v-if="state.hasComposed(sb)" class="prod-overlay-badge">已合成</span>
        </div>
        <div class="prod-info">
          <div class="prod-title-row">
            <div class="prod-title">{{ sb.title || `镜头 ${String(i + 1).padStart(2, '0')}` }}</div>
            <span :class="['prod-state-pill', state.getComposeStateClass(sb)]">{{ state.getComposeStateText(sb) }}</span>
          </div>
          <div class="prod-desc">{{ sb.description || sb.title || '—' }}</div>
          <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
          <div class="prod-caption">{{ state.getComposeSourceSummary(sb) }}</div>
          <div class="prod-dots">
            <span :class="['dot', state.hasVid(sb) && 'ok']" /><span style="font-size:10px">视频</span>
            <span :class="['dot', state.hasComposed(sb) && 'ok', state.isPendingCompose(sb.id) && 'pending']" /><span style="font-size:10px">{{ state.isPendingCompose(sb.id) ? '合成中' : '合成' }}</span>
          </div>
          <div v-if="state.composeFailMessage(sb.id)" class="prod-error">{{ state.composeFailMessage(sb.id) }}</div>
        </div>
        <div class="prod-actions">
          <button class="btn btn-primary btn-sm" :disabled="!state.hasVid(sb) || state.isPendingCompose(sb.id)" @click="handlers.doCompose(sb)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
            {{ state.getComposeActionLabel(sb) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  state: {
    type: Object,
    required: true,
  },
  handlers: {
    type: Object,
    required: true,
  },
})
</script>
