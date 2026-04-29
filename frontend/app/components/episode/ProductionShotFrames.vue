<template>
  <div class="shot-frames">
    <div class="shot-frames__toolbar">
      <div class="shot-frames__toolbar-meta">
        <span class="dim shot-frames__meta">{{ sbs.length }} 个镜头</span>
        <span class="tag mono">{{ shotImgCount }}/{{ sbs.length }} 已有帧图</span>
        <span class="tag">{{ lockedImageConfigLabel }}</span>
        <span v-if="selectedShot" class="tag mono">当前 #{{ selectedShotIndexLabel }}</span>
        <span class="tag shot-frames__jump-tip">中间切换分镜，左右联动当前镜头</span>
      </div>

      <div class="shot-frames__toolbar-actions">
        <button v-if="gridImagePath" class="btn btn-sm" @click="emit('reopen-grid-preview')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
          查看当前宫格图
        </button>
        <button class="btn btn-primary btn-sm" @click="emit('open-grid-tool')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          宫格图工具
        </button>
      </div>
    </div>

    <div v-if="selectedShot" class="shot-workbench">
      <section class="shot-panel shot-panel--studio">
        <div class="shot-panel__head shot-panel__head--compact">
          <div>
            <div class="shot-panel__title">图像创作</div>
          </div>
          <div class="shot-panel__head-tags">
            <span class="tag mono">{{ shotImageResolvedSize }}</span>
            <span v-if="lockedImageProvider" class="tag">{{ lockedImageProvider }}</span>
          </div>
        </div>

        <div class="shot-panel__scroll shot-panel__scroll--studio">
          <div class="shot-studio__group shot-studio__group--settings">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">基础设置</span>
              <span class="shot-studio__counter">输出 {{ shotImageResolvedSize }}</span>
            </div>

            <div class="shot-studio__settings-grid">
              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">当前模型</span>
                <div class="shot-studio__select-like">
                  <span>{{ lockedImageModelName || lockedImageConfigLabel || '未配置模型' }}</span>
                  <small v-if="lockedImageProvider">{{ lockedImageProvider }}</small>
                </div>
              </div>

              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">帧模式</span>
                <BaseSelect
                  :model-value="frameMode"
                  :options="frameModeOptions"
                  placeholder="帧模式"
                  searchable
                  style="width:100%"
                  @update:model-value="emit('change-frame-mode', $event)"
                />
              </div>

              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">画面比例</span>
                <div class="shot-frames__param-pills">
                  <button
                    v-for="option in shotImageAspectRatioOptions"
                    :key="option.value"
                    type="button"
                    :class="['shot-frames__pill', { active: shotImageAspectRatio === option.value }]"
                    :aria-pressed="shotImageAspectRatio === option.value"
                    @click="emit('change-shot-image-aspect-ratio', option.value)"
                  >
                    <span>{{ option.label }}</span>
                  </button>
                </div>
              </div>

              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">输出尺寸</span>
                <div class="shot-frames__size-grid">
                  <button
                    v-for="option in shotImageSizePresetOptions"
                    :key="option.value"
                    type="button"
                    :class="['shot-frames__size-pill', { active: shotImageSizePreset === option.value }]"
                    :aria-pressed="shotImageSizePreset === option.value"
                    @click="emit('change-shot-image-size-preset', option.value)"
                  >
                    <span class="shot-frames__size-main">{{ option.label }}</span>
                    <span class="shot-frames__size-note">{{ option.note }}</span>
                  </button>
                </div>
              </div>

              <div class="shot-studio__field shot-studio__field--full">
                <span class="shot-studio__field-label">生成数量</span>
                <div class="shot-studio__range-row">
                  <input
                    v-model.number="generationQuantity"
                    class="shot-studio__range-input"
                    type="range"
                    min="1"
                    max="4"
                    step="1"
                    :style="{ '--range-progress': `${((generationQuantity - 1) / 3) * 100}%` }"
                    aria-label="生成数量"
                  />
                  <span class="shot-studio__number-box">{{ generationQuantity }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="shot-studio__group">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">提示词</span>
              <span class="shot-studio__counter">{{ promptDraft.length }}/1000</span>
            </div>
            <textarea
              v-model="promptDraft"
              class="shot-studio__textarea"
              rows="6"
              maxlength="1000"
              placeholder="当前分镜的画面提示词"
              @blur="savePromptDraft()"
            />
          </div>

          <div class="shot-studio__group shot-studio__group--optional">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">负向提示词（可选）</span>
              <span class="shot-studio__counter">{{ negativePromptDraft.length }}/1000</span>
            </div>
            <textarea
              v-model="negativePromptDraft"
              class="shot-studio__textarea shot-studio__textarea--small"
              rows="3"
              maxlength="1000"
              placeholder="不需要的内容，如：模糊、低清、畸形、多余的手指..."
              @blur="saveNegativePromptDraft()"
            />
          </div>

          <div class="shot-studio__group">
            <div class="shot-studio__group-head">
              <span class="shot-studio__label">参考图</span>
              <span class="shot-studio__counter">{{ selectedReferenceDisplayImages.length }} 张</span>
            </div>
            <div v-if="selectedReferenceDisplayImages.length" class="shot-ref-strip">
              <button
                v-for="(src, index) in selectedReferenceDisplayImages"
                :key="src + index"
                class="shot-ref-strip__item"
                type="button"
                @click="openViewer(assetUrl(src), `镜头 #${selectedShotIndexLabel} 参考图 ${index + 1}`)"
              >
                <img :src="assetUrl(src)" class="previewable-image" />
                <span class="shot-ref-strip__remove" @click.stop="removeReferenceImage(src)">×</span>
              </button>
            </div>
            <button class="shot-ref-strip__add" type="button" @click="referencePickerOpen = true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>添加参考图</span>
            </button>
            <div v-if="!selectedReferenceDisplayImages.length" class="shot-empty-block">当前分镜还没有可用参考图，会直接基于提示词生成。</div>
          </div>

        </div>

        <div class="shot-studio__footer">
          <button class="btn btn-sm shot-studio__reset" type="button" @click="applyDerivedPrompt">重置提示词</button>
          <div class="shot-studio__actions">
            <button class="btn btn-primary" :disabled="selectedShotPendingAny" @click="generateSelectedFrames">
              <Loader2 v-if="selectedShotPendingAny" :size="13" class="animate-spin" />
              <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ frameMode === 'first_last' ? '生成当前分镜首尾帧' : '生成当前分镜首帧' }}
            </button>
            <button class="btn btn-sm" @click="generateSingleFrame('first_frame')">仅生成首帧</button>
            <button v-if="frameMode === 'first_last'" class="btn btn-sm" @click="generateSingleFrame('last_frame')">仅生成尾帧</button>
          </div>
        </div>
      </section>

      <section class="shot-panel shot-panel--board">
        <div class="shot-panel__head shot-panel__head--board">
          <div>
            <div class="shot-panel__title">分镜信息 <span>（可选）</span></div>
            <div class="shot-panel__desc">保留全部分镜列表，点击任意分镜，左右两侧联动到当前镜头。</div>
          </div>
          <div class="shot-panel__head-tags">
            <span class="shot-panel__toggle-label">启用分镜模式</span>
            <span class="shot-panel__switch is-active"><i></i></span>
            <span class="tag">{{ sbs.length }} 个分镜</span>
            <span class="tag mono">{{ selectedShotIndexLabel }}/{{ sbs.length }}</span>
          </div>
        </div>

        <div class="shot-board__toolbar">
          <button class="shot-board__add" type="button" @click="openStoryboard(selectedShot)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            添加分镜
          </button>
          <button class="shot-board__ai" type="button" @click="emit('open-grid-tool')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2z"/></svg>
            智能生成分镜
          </button>
        </div>

        <div class="shot-panel__scroll shot-panel__scroll--board">
          <div class="shot-board__list">
            <article
              v-for="(sb, index) in sbs"
              :key="sb.id"
              :class="['shot-board__item', { active: sb.id === selectedShot.id }]"
              role="button"
              tabindex="0"
              @click="emit('select-shot', sb)"
              @keydown.enter="emit('select-shot', sb)"
              @keydown.space.prevent="emit('select-shot', sb)"
            >
              <div class="shot-board__thumb">
                <img v-if="getShotCover(sb)" :src="assetUrl(getShotCover(sb))" class="previewable-image" />
                <div v-else class="shot-board__thumb-empty">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                </div>
              </div>

              <div class="shot-board__copy">
                <div class="shot-board__head">
                  <span class="shot-board__index">镜头 {{ index + 1 }}</span>
                  <span class="shot-board__badge">{{ sb.shot_type || sb.shotType || '未标注' }}</span>
                </div>
                <div class="shot-board__title">{{ sb.title || `镜头 ${String(index + 1).padStart(2, '0')}` }}</div>
                <div class="shot-board__desc">{{ sb.description || sb.title || '暂无分镜描述' }}</div>
                <div class="shot-board__meta">
                  <span :class="['shot-board__status', getFrameStateClass(sb, 'first_frame')]">首帧 {{ getFrameStateText(sb, 'first_frame') }}</span>
                  <span v-if="frameMode === 'first_last'" :class="['shot-board__status', getFrameStateClass(sb, 'last_frame')]">尾帧 {{ getFrameStateText(sb, 'last_frame') }}</span>
                </div>
              </div>

              <button class="shot-board__delete" type="button" title="查看分镜页" @click.stop="openStoryboard(sb)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            </article>
          </div>
        </div>

        <div class="shot-board__summary">
          <div class="shot-board__summary-head">
            <span class="shot-results__refs-title">分镜全局设置</span>
            <span class="shot-studio__counter">{{ shotGenerationProgress }}%</span>
          </div>
          <div class="shot-board__summary-tags">
            <span class="shot-board__summary-chip">{{ lockedImageConfigLabel || '默认模型' }}</span>
            <span class="shot-board__summary-chip">{{ shotImageAspectRatio }}</span>
            <span class="shot-board__summary-chip">{{ frameModeLabel }}</span>
          </div>
          <div class="shot-board__summary-track">
            <span class="shot-board__summary-fill" :style="{ width: `${shotGenerationProgress}%` }"></span>
          </div>
          <div class="shot-board__summary-meta">
            <span>当前输出 {{ shotImageResolvedSize }}</span>
            <span>{{ shotImgCount }}/{{ sbs.length }} 个镜头已有图片</span>
          </div>
        </div>
      </section>

      <section class="shot-panel shot-panel--results">
        <div class="shot-panel__head shot-panel__head--results">
          <div>
            <div class="shot-panel__title">生成结果</div>
            <div class="shot-panel__desc">{{ readyResultCount }}/{{ selectedResultCards.length }} 张图片</div>
          </div>
          <div class="shot-panel__head-tags shot-panel__head-tags--results">
            <span class="shot-results__selection">选择：全部</span>
            <button class="shot-results__tool" type="button" title="导出" @click="openFrameViewer(selectedResultCards.find(card => card.imageSrc) || selectedResultCards[0])">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="shot-results__tool shot-results__tool--text" type="button" disabled title="批量下载功能待接入">批量下载</button>
            <button class="shot-results__view active" type="button" title="网格视图">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button class="shot-results__view" type="button" title="列表视图">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
          </div>
        </div>

        <div class="shot-panel__scroll shot-panel__scroll--results">
          <div class="shot-results__grid">
            <article v-for="card in selectedResultCards" :key="card.key" class="shot-result-card">
              <div class="shot-result-card__cover" :style="{ aspectRatio: frameCardAspectRatio }">
                <span class="shot-result-card__check"></span>
                <img
                  v-if="card.imageSrc"
                  :src="assetUrl(card.imageSrc)"
                  class="shot-result-card__image previewable-image"
                  @click.stop="openFrameViewer(card)"
                />
                <button
                  v-else
                  class="shot-result-card__empty"
                  type="button"
                  :disabled="card.pending"
                  @click.stop="generateFrame(card)"
                >
                  <Loader2 v-if="card.pending" :size="18" class="animate-spin" />
                  <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  <span>{{ card.pending ? '生成中' : `生成${card.slotLabel}` }}</span>
                </button>

                <div class="shot-result-card__top">
                  <span class="shot-result-card__badge" :class="card.stateClass">{{ card.stateText }}</span>
                  <span class="shot-result-card__slot">{{ card.slotLabel }}</span>
                </div>

                <div v-if="card.imageSrc" class="shot-result-card__actions">
                  <button class="shot-result-card__icon" type="button" title="下载" @click.stop="openFrameViewer(card)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  <button class="shot-result-card__icon" type="button" title="查看大图" @click.stop="openFrameViewer(card)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  </button>
                  <button class="shot-result-card__icon shot-result-card__icon--primary" type="button" :disabled="card.pending" title="重新生成" @click.stop="generateFrame(card)">
                    <Loader2 v-if="card.pending" :size="14" class="animate-spin" />
                    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div class="shot-results__history">
          <div class="shot-results__history-head">
            <span class="shot-results__history-title">生成记录</span>
            <span class="shot-results__history-note">可将历史图片替换回当前结果</span>
          </div>
          <div v-if="selectedHistoryCards.length" class="shot-results__history-grid">
            <button
              v-for="item in selectedHistoryCards"
              :key="item.key"
              class="shot-results__history-item"
              type="button"
              @click="restoreHistoryImage(item)"
            >
              <img :src="assetUrl(item.src)" class="previewable-image" />
              <span>{{ item.slotLabel }}</span>
            </button>
          </div>
          <div v-else class="shot-empty-block">重新生成后，旧图片会自动进入这里。</div>
        </div>
      </section>
    </div>

    <div v-if="referencePickerOpen" class="overlay shot-reference-picker-overlay" @click.self="referencePickerOpen = false">
      <div class="card shot-reference-picker">
        <div class="shot-reference-picker__head">
          <div>
            <div class="shot-reference-picker__title">添加参考图</div>
            <div class="shot-reference-picker__desc">从角色形象和场景图片中选择，最多保留 6 张。</div>
          </div>
          <button class="btn btn-ghost btn-icon" type="button" @click="referencePickerOpen = false">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="shot-reference-picker__tabs">
          <button type="button" :class="{ active: referencePickerTab === 'character' }" @click="referencePickerTab = 'character'">角色形象</button>
          <button type="button" :class="{ active: referencePickerTab === 'scene' }" @click="referencePickerTab = 'scene'">场景图片</button>
        </div>
        <div v-if="filteredReferenceOptions.length" class="shot-reference-picker__grid">
          <button
            v-for="option in filteredReferenceOptions"
            :key="option.key"
            type="button"
            :class="['shot-reference-picker__item', { selected: selectedReferenceDisplayImages.includes(option.src) }]"
            @click="addReferenceImage(option.src)"
          >
            <img :src="assetUrl(option.src)" class="previewable-image" />
            <span>{{ option.label }}</span>
          </button>
        </div>
        <div v-else class="shot-empty-block">暂无可选择的{{ referencePickerTab === 'character' ? '角色形象' : '场景图片' }}。</div>
      </div>
    </div>

    <div v-if="!selectedShot" class="shot-empty-state">
      <div class="shot-empty-state__title">还没有可用分镜</div>
      <div class="shot-empty-state__desc">请先完成分镜拆解，再进入镜头图片工作台。</div>
    </div>

    <div v-if="gridHistory.length" class="grid-history-panel">
      <div v-if="gridImagePath" class="latest-grid-strip">
        <button class="latest-grid-strip-thumb" @click="openViewer(assetUrl(gridImagePath), '当前宫格图')">
          <img :src="assetUrl(gridImagePath)" class="previewable-image" />
        </button>
        <div class="latest-grid-strip-copy">
          <div class="latest-grid-strip-head">
            <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }}</span>
            <span v-if="gridRecoveredMode" class="tag">{{ gridRecoveredMode }}</span>
          </div>
          <div class="latest-grid-strip-title">当前宫格图</div>
          <div class="latest-grid-strip-meta">
            <span v-if="gridRecoveredAt">{{ gridRecoveredAt }}</span>
            <span>可继续切割并分配</span>
          </div>
        </div>
        <div class="latest-grid-strip-actions">
          <button class="btn btn-sm" @click="emit('reopen-grid-preview')">预览</button>
          <button class="btn btn-primary btn-sm" @click="emit('continue-grid-split')">继续切割</button>
        </div>
      </div>

      <div class="grid-history-head">
        <div>
          <div class="grid-history-title">历史宫格图</div>
          <div class="grid-history-subtitle">按需展开切换不同宫格图，不默认占用第一屏</div>
        </div>
        <button class="btn btn-sm" @click="emit('toggle-grid-history')">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline :points="showAllGridHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'"/></svg>
          {{ showAllGridHistory ? '收起历史宫格图' : `展开全部 (${gridHistory.length})` }}
        </button>
      </div>

      <div v-if="showAllGridHistory" class="grid-history-list">
        <button
          v-for="item in gridHistory"
          :key="item.id"
          :class="['grid-history-item', { active: item.localPath === gridImagePath }]"
          @click="emit('select-grid-history', item)"
        >
          <div class="grid-history-thumb">
            <img :src="assetUrl(item.localPath)" class="previewable-image" />
          </div>
          <div class="grid-history-copy">
            <div class="grid-history-tags">
              <span class="tag mono">#{{ item.id }}</span>
              <span class="tag mono">{{ item.layout.rows }}x{{ item.layout.cols }}</span>
              <span class="tag">{{ item.modeLabel }}</span>
            </div>
            <div class="grid-history-meta">{{ item.createdAtLabel }}</div>
          </div>
        </button>
      </div>
    </div>

    <div class="frame-gallery">
      <article
        v-for="card in frameCards"
        :key="card.key"
        :class="['frame-card', 'card', card.stateClass, { 'is-selected': selectedSbId === card.sb.id }]"
        @click="openStoryboard(card.sb)"
      >
        <div class="frame-card__cover" :style="{ aspectRatio: frameCardAspectRatio }">
          <img
            v-if="card.imageSrc"
            :src="assetUrl(card.imageSrc)"
            class="frame-card__image previewable-image"
            @click.stop="openFrameViewer(card)"
          />

          <button
            v-else
            class="frame-card__empty"
            type="button"
            :disabled="card.pending"
            @click.stop="generateFrame(card)"
          >
            <Loader2 v-if="card.pending" :size="18" class="animate-spin" />
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>{{ card.pending ? '生成中' : `生成${card.slotLabel}` }}</span>
          </button>

          <div class="frame-card__topbar">
            <span class="frame-card__badge" :class="card.stateClass">{{ card.stateText }}</span>
            <span class="frame-card__slot">{{ card.slotLabel }}</span>
          </div>

          <div class="frame-card__meta">
            <span class="frame-card__index">#{{ card.indexLabel }}</span>
            <span class="frame-card__shot-type">{{ card.shotType }}</span>
          </div>

          <div class="frame-card__actions" @click.stop>
            <button
              v-if="card.imageSrc"
              class="frame-card__icon-btn"
              type="button"
              title="查看大图"
              @click.stop="openFrameViewer(card)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button
              class="frame-card__icon-btn frame-card__icon-btn--primary"
              type="button"
              :disabled="card.pending"
              :title="card.actionLabel"
              @click.stop="generateFrame(card)"
            >
              <Loader2 v-if="card.pending" :size="14" class="animate-spin" />
              <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
          </div>
        </div>

        <div class="frame-card__body">
          <div class="frame-card__title-row">
            <div class="frame-card__title">{{ card.title }}</div>
            <button class="frame-card__jump" type="button" @click.stop="openStoryboard(card.sb)">
              分镜页
            </button>
          </div>

          <div class="frame-card__desc">{{ card.description }}</div>
          <div class="frame-card__foot">{{ card.stateNote }}</div>
        </div>
      </article>
    </div>

    <div v-if="gridDialog" class="overlay" @click.self="emit('close-grid-dialog')">
      <div class="card grid-tool">
        <div class="grid-tool-head">
          <span class="shot-frames__dialog-title">宫格图工具</span>
          <button class="btn btn-ghost btn-icon ml-auto" @click="emit('close-grid-dialog')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div v-if="gridStep === 0" class="grid-tool-body">
          <div class="grid-mode-tabs">
            <button
              v-for="m in gridModes"
              :key="m.id"
              :class="['grid-mode-tab', { active: gridMode === m.id }]"
              @click="emit('change-grid-mode', m.id)"
            >
              <span style="font-weight:600">{{ m.label }}</span>
              <span class="dim" style="font-size:11px">{{ m.desc }}</span>
            </button>
          </div>

          <div class="grid-config">
            <label v-if="gridMode !== 'multi_ref'" class="field" style="flex:0 0 auto">
              <span class="field-label">宫格</span>
              <BaseSelect
                :model-value="gridLayout"
                :options="gridLayoutOptions"
                placeholder="宫格"
                style="width:90px"
                @update:model-value="emit('change-grid-layout', $event)"
              />
            </label>
            <div class="field" style="flex:1">
              <span class="field-label">
                {{ gridMode === 'multi_ref' ? '选择目标镜头' : '选择镜头' }}
                <span v-if="gridMode !== 'multi_ref'" class="dim">(已选 {{ gridSelected.length }})</span>
              </span>
            </div>
            <div v-if="gridMode !== 'multi_ref'" style="align-self:flex-end">
              <button class="btn btn-sm" @click="emit('toggle-grid-select-all')">{{ gridSelected.length === sbs.length ? '取消全选' : '全选' }}</button>
            </div>
          </div>

          <div class="grid-pick-list">
            <label
              v-for="(sb, i) in sbs"
              :key="sb.id"
              :class="['grid-pick-item', { selected: gridMode === 'multi_ref' ? gridSingleTarget === sb.id : gridSelected.includes(sb.id) }]"
            >
              <input
                v-if="gridMode === 'multi_ref'"
                type="radio"
                :checked="gridSingleTarget === sb.id"
                name="grid-target"
                @change="emit('change-grid-single-target', sb.id)"
              />
              <input
                v-else
                type="checkbox"
                :checked="gridSelected.includes(sb.id)"
                @change="emit('toggle-grid-shot', { id: sb.id, checked: $event.target.checked })"
              />
              <span class="mono" style="font-size:11px;width:28px">#{{ String(i + 1).padStart(2, '0') }}</span>
              <span class="truncate" style="flex:1;font-size:12px">{{ sb.description || sb.title || '—' }}</span>
            </label>
          </div>

          <div class="grid-tool-foot">
            <span v-if="gridCanStart" class="tag mono">{{ gridAutoLayout.rows }}x{{ gridAutoLayout.cols }} = {{ gridAutoLayout.rows * gridAutoLayout.cols }}格</span>
            <span class="dim" style="font-size:11px">{{ gridPromptLoading ? gridPromptStatus : gridSummary }}</span>
            <button class="btn btn-primary ml-auto" :disabled="!gridCanStart || gridPromptLoading" @click="emit('generate-grid-prompt')">
              <Loader2 v-if="gridPromptLoading" :size="12" class="animate-spin" />
              <svg v-else width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              {{ gridPromptLoading ? '生成中' : '生成提示词' }}
            </button>
          </div>
        </div>

        <div v-else-if="gridStep === 1" class="grid-tool-body">
          <div class="grid-prompt-summary">
            <div class="grid-prompt-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              宫格图提示词
              <span v-if="gridPromptSource" class="tag ml-8">{{ gridPromptSource === 'agent' ? 'AI生成' : '模板兜底' }}</span>
            </div>
            <div class="grid-prompt-text">{{ gridPromptText || '（等待生成）' }}</div>
          </div>

          <div class="grid-blank-preview" :style="gridBlankStyle">
            <div v-for="(cell, i) in gridCellPrompts" :key="i" class="grid-blank-cell">
              <div class="grid-blank-cell-index">#{{ cell.shot_number }} {{ { first_frame: '首帧', last_frame: '尾帧', reference: '参考' }[cell.frame_type] || '' }}</div>
              <div class="grid-blank-cell-desc">{{ cell.prompt }}</div>
            </div>
            <div v-for="i in Math.max(0, (gridAutoLayout.rows * gridAutoLayout.cols) - gridCellPrompts.length)" :key="'empty-' + i" class="grid-blank-cell empty">
              <div class="grid-blank-cell-index">空</div>
              <div class="grid-blank-cell-desc">—</div>
            </div>
          </div>

          <div class="grid-tool-foot">
            <button class="btn" @click="emit('change-grid-step', 0)">上一步</button>
            <button class="btn ml-auto" :disabled="gridPromptLoading" @click="emit('generate-grid-prompt')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              重新生成
            </button>
            <button class="btn btn-primary" @click="emit('start-grid-generation')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              生成宫格图
            </button>
          </div>
        </div>

        <div v-else-if="gridStep === 2" class="grid-tool-body shot-frames__loading-step">
          <Loader2 :size="28" class="animate-spin" style="color:var(--accent)" />
          <div class="loading-text" style="margin-top:12px">宫格图生成中...</div>
          <div class="dim" style="font-size:11px;margin-top:6px">{{ gridStatusText }}</div>
        </div>

        <div v-else-if="gridStep === 3" class="grid-tool-body grid-tool-body-preview">
          <div class="grid-preview-layout">
            <div class="grid-preview-pane">
              <div class="grid-preview-wrap">
                <div class="grid-preview-stage">
                  <img
                    :src="assetUrl(gridImagePath)"
                    class="grid-preview-img previewable-image"
                    @click.stop="openViewer(assetUrl(gridImagePath), '宫格图预览')"
                  />
                  <div class="grid-overlay" :style="gridOverlayStyle">
                    <button
                      v-for="(assignment, i) in gridAssignments"
                      :key="i"
                      type="button"
                      :class="['grid-overlay-cell', activeGridCell === i && 'active']"
                      @click="emit('focus-grid-cell', i)"
                    >
                      <span class="grid-cell-label">{{ gridCellLabel(assignment) }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="grid-adjust-summary">
                <span class="tag mono">{{ gridActualLayout.rows }}x{{ gridActualLayout.cols }} = {{ gridActualLayout.rows * gridActualLayout.cols }}格</span>
                <span class="dim" style="font-size:12px">{{ gridAssignedCount }}/{{ gridAssignments.length }} 格已分配</span>
                <span v-if="gridAssignedCount < gridAssignments.length" class="tag">未分配格子会被忽略，不会写回分镜</span>
              </div>
            </div>

            <div class="grid-assignment-pane">
              <div class="grid-assign-head">
                <div class="grid-assign-title">格子分配</div>
                <div class="grid-assign-subtitle">切分后由你自己决定每格对应哪个分镜</div>
              </div>
              <div v-if="gridAssignmentTotalPages > 1" class="grid-assign-pagination">
                <button class="btn btn-sm" :disabled="gridAssignmentPage === 0" @click="emit('change-grid-assignment-page', gridAssignmentPage - 1)">上一页</button>
                <span class="dim">第 {{ gridAssignmentPage + 1 }}/{{ gridAssignmentTotalPages }} 页</span>
                <span class="dim">{{ gridAssignmentPageStart + 1 }}-{{ gridAssignmentPageEnd }} / {{ gridAssignments.length }}</span>
                <button class="btn btn-sm ml-auto" :disabled="gridAssignmentPage >= gridAssignmentTotalPages - 1" @click="emit('change-grid-assignment-page', gridAssignmentPage + 1)">下一页</button>
              </div>
              <div class="grid-assign-columns">
                <span>格</span>
                <span>镜头</span>
                <span>类型</span>
                <span>当前绑定</span>
              </div>
              <div class="grid-assign-info">
                <div
                  v-for="item in pagedGridAssignments"
                  :key="item.index"
                  :class="['grid-assign-row', activeGridCell === item.index && 'active']"
                >
                  <span class="grid-assign-index">格{{ item.index + 1 }}</span>
                  <BaseSelect
                    :model-value="item.assignment.storyboard_id"
                    :options="gridAssignmentShotOptions"
                    placeholder="选择镜头"
                    @update:model-value="emit('update-grid-assignment', { index: item.index, field: 'storyboard_id', value: $event })"
                  />
                  <BaseSelect
                    :model-value="item.assignment.frame_type"
                    :options="gridFrameTypeOptions"
                    placeholder="帧类型"
                    style="width:100%"
                    @update:model-value="emit('update-grid-assignment', { index: item.index, field: 'frame_type', value: $event })"
                  />
                  <span class="grid-assign-bind">{{ gridCellTitle(item.assignment.storyboard_id) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="grid-tool-foot">
            <button class="btn" @click="emit('change-grid-step', 1)">返回</button>
            <button class="btn btn-primary ml-auto" @click="emit('do-grid-split')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              切分并分配
            </button>
          </div>
        </div>

        <div v-else-if="gridStep === 4" class="grid-tool-body shot-frames__done-step">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <div class="shot-frames__done-title">分配完成</div>
          <div class="dim" style="font-size:13px;margin-top:4px">{{ gridAssignedCount }} 格已分配</div>
          <button class="btn btn-primary" style="margin-top:16px" @click="emit('finish-grid-dialog')">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import BaseSelect from '~/components/BaseSelect.vue'

const props = defineProps({
  sbs: { type: Array, default: () => [] },
  shotImgCount: { type: Number, default: 0 },
  lockedImageConfigLabel: { type: String, default: '' },
  lockedImageModelName: { type: String, default: '' },
  selectedSbId: { type: Number, default: 0 },
  referenceOptions: { type: Array, default: () => [] },
  shotImageHistory: { type: Object, default: () => ({}) },
  frameMode: { type: String, default: 'first' },
  frameModeOptions: { type: Array, default: () => [] },
  shotImageAspectRatio: { type: String, default: '16:9' },
  shotImageAspectRatioOptions: { type: Array, default: () => [] },
  shotImageSizePreset: { type: String, default: '2K' },
  shotImageSizePresetOptions: { type: Array, default: () => [] },
  shotImageResolvedSize: { type: String, default: '2560x1440' },
  lockedImageProvider: { type: String, default: '' },
  gridImagePath: { type: String, default: '' },
  gridActualLayout: { type: Object, default: () => ({ rows: 3, cols: 3 }) },
  gridRecoveredMode: { type: String, default: '' },
  gridRecoveredAt: { type: String, default: '' },
  showAllGridHistory: { type: Boolean, default: false },
  gridHistory: { type: Array, default: () => [] },
  gridDialog: { type: Boolean, default: false },
  gridStep: { type: Number, default: 0 },
  gridModes: { type: Array, default: () => [] },
  gridMode: { type: String, default: 'first_frame' },
  gridLayout: { type: String, default: '3x3' },
  gridLayoutOptions: { type: Array, default: () => [] },
  gridSelected: { type: Array, default: () => [] },
  gridSingleTarget: { type: Number, default: null },
  gridCanStart: { type: Boolean, default: false },
  gridAutoLayout: { type: Object, default: () => ({ rows: 3, cols: 3 }) },
  gridPromptLoading: { type: Boolean, default: false },
  gridPromptStatus: { type: String, default: '' },
  gridSummary: { type: String, default: '' },
  gridPromptSource: { type: String, default: '' },
  gridPromptText: { type: String, default: '' },
  gridCellPrompts: { type: Array, default: () => [] },
  gridBlankStyle: { type: Object, default: () => ({}) },
  gridStatusText: { type: String, default: '' },
  gridOverlayStyle: { type: Object, default: () => ({}) },
  gridAssignments: { type: Array, default: () => [] },
  activeGridCell: { type: Number, default: 0 },
  gridAssignedCount: { type: Number, default: 0 },
  gridAssignmentTotalPages: { type: Number, default: 1 },
  gridAssignmentPage: { type: Number, default: 0 },
  gridAssignmentPageStart: { type: Number, default: 0 },
  gridAssignmentPageEnd: { type: Number, default: 0 },
  pagedGridAssignments: { type: Array, default: () => [] },
  gridAssignmentShotOptions: { type: Array, default: () => [] },
  gridFrameTypeOptions: { type: Array, default: () => [] },
  getFirstFrame: { type: Function, required: true },
  getLastFrame: { type: Function, required: true },
  getShotReferenceImages: { type: Function, required: true },
  getShotManualReferenceImages: { type: Function, default: null },
  isPendingShotFrame: { type: Function, required: true },
  gridCellLabel: { type: Function, required: true },
  gridCellTitle: { type: Function, required: true },
})

const emit = defineEmits([
  'change-frame-mode',
  'change-shot-image-aspect-ratio',
  'change-shot-image-size-preset',
  'open-grid-tool',
  'reopen-grid-preview',
  'continue-grid-split',
  'toggle-grid-history',
  'select-grid-history',
  'select-shot',
  'open-storyboard',
  'update-shot-field',
  'generate-shot-frame',
  'restore-shot-frame',
  'open-image-viewer',
  'close-grid-dialog',
  'change-grid-mode',
  'change-grid-layout',
  'toggle-grid-select-all',
  'toggle-grid-shot',
  'change-grid-single-target',
  'generate-grid-prompt',
  'start-grid-generation',
  'change-grid-step',
  'focus-grid-cell',
  'change-grid-assignment-page',
  'update-grid-assignment',
  'do-grid-split',
  'finish-grid-dialog',
])

function openViewer(src, title) {
  emit('open-image-viewer', { src, title })
}

function openStoryboard(sb) {
  emit('select-shot', sb)
  emit('open-storyboard', sb)
}

function getFrameImage(sb, frameType) {
  return frameType === 'last_frame' ? props.getLastFrame(sb) : props.getFirstFrame(sb)
}

function getShotCover(sb) {
  return sb?.composed_image || sb?.composedImage || getFrameImage(sb, 'first_frame') || getFrameImage(sb, 'last_frame') || ''
}

function hasFrameByType(sb, frameType) {
  return !!getFrameImage(sb, frameType)
}

function getFrameActionLabel(sb, frameType) {
  if (props.isPendingShotFrame(sb.id, frameType)) return '生成中'
  return hasFrameByType(sb, frameType) ? '重新生成' : '立即生成'
}

function getFrameStateText(sb, frameType) {
  if (props.isPendingShotFrame(sb.id, frameType)) return '生成中'
  return hasFrameByType(sb, frameType) ? '已出图' : '待出图'
}

function getFrameStateClass(sb, frameType) {
  const text = getFrameStateText(sb, frameType)
  if (text === '生成中') return 'is-pending'
  if (text === '待出图') return 'is-empty'
  return 'is-ready'
}

const frameCardAspectRatio = computed(() => {
  const [width, height] = String(props.shotImageAspectRatio || '1:1').split(':').map(Number)
  if (!width || !height) return '1 / 1'
  return `${width} / ${height}`
})

const selectedShot = computed(() => (
  props.sbs.find(sb => sb.id === props.selectedSbId) || props.sbs[0] || null
))

const generationQuantity = ref(1)
const referencePickerOpen = ref(false)
const referencePickerTab = ref('character')

const selectedShotIndex = computed(() => {
  if (!selectedShot.value) return -1
  return props.sbs.findIndex(sb => sb.id === selectedShot.value.id)
})

const selectedShotIndexLabel = computed(() => String(selectedShotIndex.value + 1).padStart(2, '0'))

function deriveShotPrompt(sb) {
  if (!sb) return ''

  const characters = Array.isArray(sb.character_names)
    ? sb.character_names
    : String(sb.characterNames || sb.character_names || '').split(/[、,，]/).map(item => item.trim()).filter(Boolean)

  return [
    sb.title ? `镜头标题：${sb.title}` : '',
    sb.description ? `画面描述：${sb.description}` : '',
    sb.shot_type || sb.shotType ? `景别：${sb.shot_type || sb.shotType}` : '',
    sb.angle ? `机位：${sb.angle}` : '',
    sb.movement ? `运镜：${sb.movement}` : '',
    sb.location ? `地点：${sb.location}` : '',
    sb.time ? `时间：${sb.time}` : '',
    sb.action ? `动作：${sb.action}` : '',
    sb.atmosphere ? `氛围：${sb.atmosphere}` : '',
    characters.length ? `角色：${characters.join('、')}` : '',
    '请生成电影感强、构图清晰、主体明确的单帧画面。',
  ].filter(Boolean).join('\n')
}

const promptDraft = ref('')
const negativePromptDraft = ref('')

watch(
  () => [
    selectedShot.value?.id || 0,
    selectedShot.value?.image_prompt || selectedShot.value?.imagePrompt || '',
  ],
  () => {
    const shot = selectedShot.value
    if (!shot) {
      promptDraft.value = ''
      return
    }
    promptDraft.value = shot.image_prompt || shot.imagePrompt || deriveShotPrompt(shot)
  },
  { immediate: true },
)

watch(
  () => [
    selectedShot.value?.id || 0,
    selectedShot.value?.negative_prompt || selectedShot.value?.negativePrompt || '',
  ],
  () => {
    const shot = selectedShot.value
    negativePromptDraft.value = shot?.negative_prompt || shot?.negativePrompt || ''
  },
  { immediate: true },
)

function savePromptDraft(nextValue = promptDraft.value) {
  if (!selectedShot.value) return
  const value = String(nextValue ?? '').trim()
  promptDraft.value = value
  emit('update-shot-field', {
    sb: selectedShot.value,
    field: 'image_prompt',
    value,
  })
}

function saveNegativePromptDraft(nextValue = negativePromptDraft.value) {
  if (!selectedShot.value) return
  const value = String(nextValue ?? '').trim()
  negativePromptDraft.value = value
  emit('update-shot-field', {
    sb: selectedShot.value,
    field: 'negative_prompt',
    value,
  })
}

function applyDerivedPrompt() {
  if (!selectedShot.value) return
  const nextPrompt = deriveShotPrompt(selectedShot.value)
  promptDraft.value = nextPrompt
  savePromptDraft(nextPrompt)
}

function saveReferenceImages(nextImages) {
  if (!selectedShot.value) return
  emit('update-shot-field', {
    sb: selectedShot.value,
    field: 'reference_images',
    value: JSON.stringify(nextImages.slice(0, 6)),
  })
}

const selectedManualReferenceImages = computed(() => (
  selectedShot.value && props.getShotManualReferenceImages
    ? props.getShotManualReferenceImages(selectedShot.value)
    : []
))

const selectedReferenceImages = computed(() => (
  selectedShot.value ? props.getShotReferenceImages(selectedShot.value) : []
))

const selectedReferenceDisplayImages = computed(() => {
  if (!selectedShot.value) return []
  const first = getFrameImage(selectedShot.value, 'first_frame')
  const last = getFrameImage(selectedShot.value, 'last_frame')
  return selectedReferenceImages.value.filter(src => src !== first && src !== last)
})

const filteredReferenceOptions = computed(() => (
  props.referenceOptions.filter(option => option.type === referencePickerTab.value && option.src)
))

function addReferenceImage(src) {
  if (!src) return
  const next = [...selectedManualReferenceImages.value]
  if (!next.includes(src)) next.unshift(src)
  saveReferenceImages(next)
}

function removeReferenceImage(src) {
  saveReferenceImages(selectedManualReferenceImages.value.filter(item => item !== src))
}

const frameModeLabel = computed(() => (
  props.frameMode === 'first_last' ? '首尾帧' : '首帧模式'
))

const shotGenerationProgress = computed(() => {
  if (!props.sbs.length) return 0
  return Math.round((props.shotImgCount / props.sbs.length) * 100)
})

const selectedResultCards = computed(() => {
  const frameTypes = props.frameMode === 'first_last'
    ? ['first_frame', 'last_frame']
    : ['first_frame']

  if (!selectedShot.value) return []

  return frameTypes.map((frameType) => {
    const slotLabel = frameType === 'last_frame' ? '尾帧' : '首帧'
    const imageSrc = getFrameImage(selectedShot.value, frameType)
    const pending = props.isPendingShotFrame(selectedShot.value.id, frameType)
    const stateText = getFrameStateText(selectedShot.value, frameType)

    return {
      key: `${selectedShot.value.id}-${frameType}`,
      sb: selectedShot.value,
      frameType,
      imageSrc,
      pending,
      slotLabel,
      viewerTitle: `镜头 #${selectedShotIndexLabel.value} ${slotLabel}`,
      actionLabel: getFrameActionLabel(selectedShot.value, frameType),
      stateText,
      stateClass: getFrameStateClass(selectedShot.value, frameType),
      stateNote: pending
        ? `${slotLabel}正在生成中`
        : imageSrc
          ? `${slotLabel}已生成，可查看大图或重新生成`
          : `当前还没有${slotLabel}，可以直接开始生成`,
    }
  })
})

const selectedHistoryCards = computed(() => {
  if (!selectedShot.value) return []
  const history = props.shotImageHistory?.[selectedShot.value.id] || []
  return history.map((item, index) => ({
    key: `${selectedShot.value.id}-${item.frameType}-${item.src}-${index}`,
    ...item,
    slotLabel: item.frameType === 'last_frame' ? '尾帧' : '首帧',
  }))
})

const readyResultCount = computed(() => selectedResultCards.value.filter(card => card.imageSrc).length)

const selectedShotPendingAny = computed(() => (
  selectedResultCards.value.some(card => card.pending)
))

function openFrameViewer(card) {
  if (!card.imageSrc) return
  openViewer(assetUrl(card.imageSrc), card.viewerTitle)
}

function generateFrame(card) {
  savePromptDraft()
  emit('generate-shot-frame', { sb: card.sb, frameType: card.frameType, quantity: generationQuantity.value })
}

function generateSingleFrame(frameType) {
  if (!selectedShot.value) return
  savePromptDraft()
  emit('generate-shot-frame', { sb: selectedShot.value, frameType, quantity: generationQuantity.value })
}

function generateSelectedFrames() {
  if (!selectedShot.value) return
  savePromptDraft()
  emit('generate-shot-frame', { sb: selectedShot.value, frameType: 'first_frame', quantity: generationQuantity.value })
  if (props.frameMode === 'first_last') {
    emit('generate-shot-frame', { sb: selectedShot.value, frameType: 'last_frame', quantity: generationQuantity.value })
  }
}

function restoreHistoryImage(item) {
  if (!selectedShot.value || !item?.src || !item?.frameType) return
  emit('restore-shot-frame', { sb: selectedShot.value, frameType: item.frameType, src: item.src })
}
</script>

<style>
@import url('~/assets/production-shot-frames.css');
</style>
