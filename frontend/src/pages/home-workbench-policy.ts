export type HomeProjectStatusKey = 'all' | 'running' | 'draft' | 'done'
export type HomeProjectSortKey = 'updated' | 'progress' | 'episodes'

export interface HomeProjectStatus {
  key: Exclude<HomeProjectStatusKey, 'all'>
  label: string
  tone: 'green' | 'amber' | 'blue'
}

export interface HomeProjectStats {
  total: number
  running: number
  draft: number
  done: number
  characters: number
  scenes: number
  automation: number
}

type LooseProject = Record<string, any>

export function getHomeProjectProgress(project: LooseProject): number {
  const episodes = Array.isArray(project?.episodes) ? project.episodes : []
  if (!episodes.length) return 0

  const scripted = episodes.filter((episode) => Boolean(episode?.script_content || episode?.scriptContent)).length
  return Math.round((scripted / episodes.length) * 100)
}

export function getHomeProjectStatus(project: LooseProject): HomeProjectStatus {
  const progress = getHomeProjectProgress(project)
  const runningCount = Number(project?.automation_running_count || project?.automationRunningCount || 0)

  if (progress >= 100) {
    return { key: 'done', label: '已完成', tone: 'blue' }
  }

  if (runningCount > 0 || progress > 0) {
    return { key: 'running', label: '制作中', tone: 'green' }
  }

  return { key: 'draft', label: '草稿', tone: 'amber' }
}

export function filterHomeProjects(
  projects: LooseProject[],
  status: HomeProjectStatusKey,
  query: string,
): LooseProject[] {
  const keyword = query.trim().toLowerCase()

  return projects.filter((project) => {
    const matchesStatus = status === 'all' || getHomeProjectStatus(project).key === status
    if (!matchesStatus) return false

    if (!keyword) return true
    return getSearchableProjectText(project).toLowerCase().includes(keyword)
  })
}

export function sortHomeProjects(projects: LooseProject[], sort: HomeProjectSortKey): LooseProject[] {
  return [...projects].sort((left, right) => {
    if (sort === 'progress') {
      return getHomeProjectProgress(right) - getHomeProjectProgress(left)
    }

    if (sort === 'episodes') {
      return getCount(right, 'episodes') - getCount(left, 'episodes')
    }

    return getUpdatedTime(right) - getUpdatedTime(left)
  })
}

export function getHomeProjectStats(projects: LooseProject[]): HomeProjectStats {
  return projects.reduce<HomeProjectStats>((stats, project) => {
    const status = getHomeProjectStatus(project)
    stats.total += 1
    stats[status.key] += 1
    stats.characters += getCount(project, 'characters')
    stats.scenes += getCount(project, 'scenes')
    stats.automation += Number(project?.automation_running_count || project?.automationRunningCount || 0)
    return stats
  }, {
    total: 0,
    running: 0,
    draft: 0,
    done: 0,
    characters: 0,
    scenes: 0,
    automation: 0,
  })
}

function getSearchableProjectText(project: LooseProject): string {
  return [
    project?.title,
    project?.style,
    nestedListText(project?.characters),
    nestedListText(project?.scenes),
  ].filter(Boolean).join(' ')
}

function nestedListText(value: unknown): string {
  if (!Array.isArray(value)) return ''

  return value.map((item) => {
    if (item == null) return ''
    if (typeof item === 'string') return item
    if (typeof item === 'number') return String(item)
    if (typeof item === 'object') {
      return Object.values(item as Record<string, unknown>)
        .filter((part) => typeof part === 'string' || typeof part === 'number')
        .join(' ')
    }
    return ''
  }).join(' ')
}

function getCount(project: LooseProject, key: string): number {
  return Array.isArray(project?.[key]) ? project[key].length : 0
}

function getUpdatedTime(project: LooseProject): number {
  const value = project?.updated_at || project?.updatedAt || project?.created_at || project?.createdAt
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}
