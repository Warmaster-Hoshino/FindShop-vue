/**
 * 问答相关的API接口
 */

import { API_CONFIG, API_ENDPOINTS, FEEDBACK_ENDPOINTS } from '@/config/api'
import { postFormData, postJson } from '@/utils/http'

export async function uploadAudio(audioBlob) {
  try {
    const formData = new FormData()
    formData.append('audio', audioBlob, 'audio.webm')
    return await postFormData(`${API_CONFIG.API_BASE_URL}${API_ENDPOINTS.UPLOAD_AUDIO}`, formData)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

export async function getAnswer(message) {
  try {
    const result = await postJson(`${API_CONFIG.API_BASE_URL}${API_ENDPOINTS.QA_QUESTION}`, { message })
    // 仅显示 text 翻译结果
    return result
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

export async function submitFeedback(feedback) {
  try {
    return await postJson(`${API_CONFIG.API_BASE_URL}${FEEDBACK_ENDPOINTS.QA_FEEDBACK}`, feedback)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}
