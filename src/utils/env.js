/**
 * 环境变量工具
 * 用于安全地访问和验证环境变量
 */

/**
 * 获取环境变量
 * @param {string} key - 变量键名
 * @param {string} defaultValue - 默认值
 * @returns {string} 环境变量值
 */
export const getEnv = (key, defaultValue = '') => {
  return import.meta.env[key] || defaultValue
}

/**
 * 获取并验证 API Key
 * @param {string} keyName - API Key 的环境变量名
 * @returns {string} API Key
 * @throws {Error} 如果 API Key 未配置或格式错误
 */
export const getApiKey = (keyName) => {
  const key = getEnv(keyName)
  
  if (!key) {
    throw new Error(
      `❌ 未找到 API Key: ${keyName}\n\n` +
      '📝 请按以下步骤配置:\n' +
      '1. 在项目根目录创建 .env.local 文件\n' +
      '2. 添加: ' + keyName + '=sk-your-api-key\n' +
      '3. 重启开发服务器 (npm run dev)\n\n' +
      '💡 提示: .env.local 已在 .gitignore 中，不会被提交到 Git'
    )
  }
  
  return key
}

/**
 * 验证 API Key 格式
 * @param {string} key - API Key
 * @param {string} prefix - 预期的前缀 (默认 'sk-')
 * @returns {boolean} 是否有效
 */
export const validateApiKey = (key, prefix = 'sk-') => {
  if (!key) return false
  if (typeof key !== 'string') return false
  if (key.length < 20) return false
  if (!key.startsWith(prefix)) return false
  return true
}

/**
 * 获取环境信息
 * @returns {object} 环境信息对象
 */
export const getEnvironmentInfo = () => {
  const isDev = import.meta.env.DEV
  const isProd = import.meta.env.PROD
  const mode = import.meta.env.MODE
  
  return {
    isDev,
    isProd,
    mode,
    env: import.meta.env.VITE_APP_ENV || mode,
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
    wsUrl: import.meta.env.VITE_WS_URL,
    title: import.meta.env.VITE_APP_TITLE
  }
}

/**
 * 打印环境信息（仅开发环境）
 */
export const logEnvironmentInfo = () => {
  if (import.meta.env.DEV) {
    const info = getEnvironmentInfo()
    console.group('🌍 环境信息')
    console.table(info)
    console.groupEnd()
  }
}

/**
 * 验证所有必需的环境变量
 * @param {string[]} requiredKeys - 必需的环境变量键名
 * @returns {object} 验证结果 { valid: boolean, missing: string[] }
 */
export const validateRequiredEnvs = (requiredKeys) => {
  const missing = []
  
  requiredKeys.forEach(key => {
    const value = import.meta.env[key]
    if (!value) {
      missing.push(key)
    }
  })
  
  return {
    valid: missing.length === 0,
    missing
  }
}

/**
 * 安全地访问环境变量（隐藏敏感信息）
 * @param {string} key - 变量键名
 * @returns {string} 处理后的值（敏感信息已隐藏）
 */
export const getEnvSafe = (key) => {
  const value = import.meta.env[key]
  
  if (!value) return 'NOT_SET'
  
  // 隐藏 API Key
  if (key.includes('KEY') || key.includes('TOKEN') || key.includes('SECRET')) {
    const str = String(value)
    const visible = 3
    if (str.length <= visible * 2) {
      return '***' + str.slice(-visible)
    }
    return str.slice(0, visible) + '***' + str.slice(-visible)
  }
  
  return value
}
