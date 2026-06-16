import assert from 'node:assert/strict'

import {
  filterHomeProjects,
  getHomeProjectStatus,
  getHomeProjectStats,
  sortHomeProjects,
} from '../home-workbench-policy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const projects = [
  {
    id: 1,
    title: '霓虹未眠',
    style: '都市情感',
    updated_at: '2026-06-16T08:00:00.000Z',
    automation_running_count: 1,
    episodes: [{ script_content: 'ok' }, { script_content: '' }],
    characters: [{ name: '林澈' }],
    scenes: [{ name: '医院夜景' }],
  },
  {
    id: 2,
    title: '逆光告白',
    style: '校园甜宠',
    updated_at: '2026-06-15T08:00:00.000Z',
    episodes: [{ script_content: '' }, { script_content: '' }],
    characters: [],
    scenes: [],
  },
  {
    id: 3,
    title: '万家灯火',
    style: '家庭治愈',
    updated_at: '2026-06-14T08:00:00.000Z',
    episodes: [{ script_content: 'ok' }, { script_content: 'ok' }],
    characters: [{ name: '陈姨' }],
    scenes: [{ name: '客厅' }],
  },
]

runTest('home project status reflects running, draft, and completed projects', () => {
  assert.equal(getHomeProjectStatus(projects[0]).key, 'running')
  assert.equal(getHomeProjectStatus(projects[1]).key, 'draft')
  assert.equal(getHomeProjectStatus(projects[2]).key, 'done')
})

runTest('home project filtering matches status and searchable project text', () => {
  assert.deepEqual(filterHomeProjects(projects, 'running', '').map((project) => project.id), [1])
  assert.deepEqual(filterHomeProjects(projects, 'all', '林澈').map((project) => project.id), [1])
  assert.deepEqual(filterHomeProjects(projects, 'draft', '霓虹').map((project) => project.id), [])
})

runTest('home project sorting can use updated time and progress', () => {
  assert.deepEqual(sortHomeProjects(projects, 'updated').map((project) => project.id), [1, 2, 3])
  assert.deepEqual(sortHomeProjects(projects, 'progress').map((project) => project.id), [3, 1, 2])
})

runTest('home project stats summarize the workbench surface', () => {
  assert.deepEqual(getHomeProjectStats(projects), {
    total: 3,
    running: 1,
    draft: 1,
    done: 1,
    characters: 2,
    scenes: 2,
    automation: 1,
  })
})
