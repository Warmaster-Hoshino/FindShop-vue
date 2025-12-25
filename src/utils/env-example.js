/**
 * 环境变量使用工具
 * 提供安全地访问和验证环境变量的方法
 */

export const getEnvSafely = () => {
  return {
    apiKey: import.meta.env.VITE_DASHSCOPE_API_KEY,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    wsUrl: import.meta.env.VITE_WS_URL
  }
}
