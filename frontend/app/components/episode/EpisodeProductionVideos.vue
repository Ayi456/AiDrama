<template>
  <div class="prod-content">
    <div class="prod-section-bar">
      <div class="prod-section-copy">
        <div class="prod-section-title-row">
          <span class="prod-section-title">镜头视频生成</span>
          <span class="tag">{{ state.lockedVideoConfigLabel }}</span>
        </div>
        <div class="prod-section-desc">基于分镜提示词与参考帧生成镜头视频；已有视频时可直接重新生成。</div>
      </div>
      <div class="prod-section-stats">
        <span class="tag mono">{{ state.shotVidCount }}/{{ state.sbs.length }} 已生成</span>
        <span class="tag">{{ state.sbs.length }} 个镜头</span>
      </div>
      <div class="prod-section-actions">
        <button class="btn btn-sm" @click="handlers.batchVideos()">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          批量视频
        </button>
      </div>
    </div>
    <div class="prod-grid">
      <div v-for="(sb, i) in state.sbs" :key="sb.id" class="card prod-card prod-card--video">
        <div class="prod-cover">
          <video
            v-if="state.hasVid(sb)"
            :src="'/' + state.getVideoUrl(sb)"
            class="prod-video"
            controls
            preload="metadata"
            playsinline
          />
          <img
            v-else-if="state.hasImg(sb)"
            :src="'/' + state.getStoryboardCover(sb)"
            class="previewable-image"
            @click.stop="handlers.openImageByPath(state.getStoryboardCover(sb), `镜头 #${String(i + 1).padStart(2, '0')} 参考图`)"
          />
          <div v-else class="prod-cover-empty">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <span class="prod-idx">#{{ String(i + 1).padStart(2, '0') }}</span>
          <span v-if="state.hasComposed(sb)" class="prod-overlay-badge">已合成</span>
        </div>
        <div class="prod-info">
          <div class="prod-title-row">
            <div class="prod-title">{{ sb.title || `镜头 ${String(i + 1).padStart(2, '0')}` }}</div>
            <span :class="['prod-state-pill', state.getVideoStateClass(sb)]">{{ state.getVideoStateText(sb) }}</span>
          </div>
          <div class="prod-desc">{{ sb.description || sb.title || '—' }}</div>
          <div class="prod-meta-line">{{ sb.shot_type || sb.shotType || '未设景别' }} · {{ sb.duration || 10 }}s</div>
          <div class="prod-caption">{{ state.getVideoReferenceSummary(sb) }}</div>
          <div class="prod-dots">
            <span :class="['dot', state.hasImg(sb) && 'ok']" /><span style="font-size:10px">图</span>
            <span :class="['dot', state.hasVid(sb) && 'ok', state.isPendingVideo(sb.id) && 'pending']" /><span style="font-size:10px">{{ state.isPendingVideo(sb.id) ? '视频生成中' : '视频' }}</span>
          </div>
          <div v-if="state.videoFailMessage(sb.id)" class="prod-error">{{ state.videoFailMessage(sb.id) }}</div>
        </div>
        <div class="prod-actions">
          <button class="btn btn-primary btn-sm" :disabled="state.isPendingVideo(sb.id)" @click="handlers.genVid(sb)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            {{ state.getVideoGenerateActionLabel(sb) }}
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
