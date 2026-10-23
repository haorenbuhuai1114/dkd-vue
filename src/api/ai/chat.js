import axios from 'axios'
import { getToken } from '@/utils/auth'

// AI Agent base URL (独立于 dev-api，走 ai-api 代理)
const aiService = axios.create({
  baseURL: '/ai-api',
  timeout: 60000
})

// 请求拦截：透传帝可得登录 token（对齐主 service 的 request.js 做法）
aiService.interceptors.request.use(
  config => {
    if (getToken()) {
      config.headers['Authorization'] = 'Bearer ' + getToken()
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截：AI Agent 返回 {code: 200, msg, data}，只取 data
aiService.interceptors.response.use(
  res => res.data,
  error => {
    console.error('AI 请求失败:', error)
    return Promise.reject(error)
  }
)

// AI 对话（带 sessionId，由方案 D 前端生成，关联 Redis 中的会话历史）
export function chatWithAI(message, sessionId) {
  return aiService.post('/ai/chat', { message, sessionId })
}

// 清除会话历史（删 Redis）
export function clearAIHistory(sessionId) {
  return aiService.post('/ai/clearHistory', { sessionId })
}

// AI 健康检查
export function checkAIHealth() {
  return aiService.get('/ai/health')
}
