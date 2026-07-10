import { api } from './client.ts'
import type {
  AgentConfig,
  AiConfig,
  ApiEntity,
  ApiRequestBody,
  AutomationPreferences,
  AutomationStatusPayload,
  AutomationStatusValue,
  SkillSummary,
} from './types.ts'

export const aiConfigAPI = {
  list: (type?: string) => api.get<AiConfig[]>(`/ai-configs${type ? `?service_type=${type}` : ''}`),
  create: (data: ApiRequestBody) => api.post<AiConfig>('/ai-configs', data),
  update: (id: number, data: ApiRequestBody) => api.put<AiConfig>(`/ai-configs/${id}`, data),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (data: ApiRequestBody) => api.post<ApiEntity>('/ai-configs/test', data),
}

export const agentConfigAPI = {
  list: () => api.get<AgentConfig[]>('/agent-configs'),
  get: (id: number) => api.get<AgentConfig>(`/agent-configs/${id}`),
  create: (data: ApiRequestBody) => api.post<AgentConfig>('/agent-configs', data),
  update: (id: number, data: ApiRequestBody) => api.put<AgentConfig>(`/agent-configs/${id}`, data),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get<SkillSummary[]>('/skills'),
  get: (id: string) => api.get<string>(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const preferencesAPI = {
  get: () => api.get<AutomationPreferences>('/preferences'),
  put: (data: Partial<AutomationPreferences>) => api.put<AutomationPreferences>('/preferences', data),
}

export const automationAPI = {
  start: (episodeId: number) => api.post<{ status: AutomationStatusValue }>(`/episodes/${episodeId}/automation/start`, {}),
  patch: (episodeId: number, action: 'cancel' | 'resume' | 'abort') => api.patch<{ action: string }>(`/episodes/${episodeId}/automation`, { action }),
  get: (episodeId: number) => api.get<AutomationStatusPayload>(`/episodes/${episodeId}/automation`),
}
