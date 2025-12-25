/**
 * API配置文件
 * 统一管理所有API的基础URL和环境配置
 */

const ENV = {
  development: {
    API_BASE_URL: 'http://localhost:8000',
    FEEDBACK_API_BASE_URL: 'http://localhost:8001',
  },
  production: {
    API_BASE_URL: '',
    FEEDBACK_API_BASE_URL: '',
  },
  test: {
    API_BASE_URL: 'http://test-api.example.com',
    FEEDBACK_API_BASE_URL: 'http://test-feedback.example.com',
  }
}

const currentEnv = import.meta.env.MODE || 'development'

export const API_CONFIG = ENV[currentEnv] || ENV.development

export const API_ENDPOINTS = {
  UPLOAD_AUDIO: '/api/upload-audio',
  QA_QUESTION: '/api/qa',
}

export const FEEDBACK_ENDPOINTS = {
  QA_FEEDBACK: '/api/qa/feedback',
}
