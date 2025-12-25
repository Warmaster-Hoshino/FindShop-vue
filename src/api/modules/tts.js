import { API_CONFIG } from '@/config/api.js'
import { postStream, postBlob, postStreamRealtime } from '@/utils/http'

/**
 * 创建TTS配置对象
 */
function createTTSConfig(options = {}) {
  return {
    voice: options.voice || 'longanyang',
    format: options.format || 'mp3',
    sample_rate: options.sample_rate || 22050,
    volume: options.volume || 50,
    rate: options.rate || 1,
    pitch: options.pitch || 1,
    enable_ssml: options.enable_ssml || false
  }
}

/**
 * 播放音频Blob
 */
export const playAudio = (audioBlob) => {
  const audioUrl = URL.createObjectURL(audioBlob)
  const audio = new Audio(audioUrl)
  audio.volume = 0.8
  
  audio.play().catch(() => {
    // 生产环境不输出详细错误
    URL.revokeObjectURL(audioUrl)
  })
  
  // 播放完成时释放 URL（而不是立即释放）
  audio.onended = () => {
    URL.revokeObjectURL(audioUrl)
  }
  
  // 出错时也释放 URL
  audio.onerror = () => {
    URL.revokeObjectURL(audioUrl)
  }
  
  return audio
}

/**
 * 文本转语音（缓冲模式）
 */
export const textToSpeech = async (text, options = {}) => {
  try {
    const audioBlob = await postBlob(`${API_CONFIG.API_BASE_URL}/api/tts/synthesize`, { text })
    return audioBlob
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

/**
 * 流式文本转语音（边接收边播放，支持手机微信）
 */
export const textToSpeechStreaming = async (text, options = {}) => {
  try {
    const onStart = options.onStart || (() => {})
    const onProgress = options.onProgress || (() => {})
    const onComplete = options.onComplete || (() => {})
    const onError = options.onError || (() => {})
    const onBlob = options.onBlob || (() => {})
    onStart()
    const audioBlob = await postStream(
      `${API_CONFIG.API_BASE_URL}/api/tts/synthesize-stream`,
      { text },
      (info) => {
        onProgress({ received: info.received })
      },
      { responseType: 'audio/mpeg' }
    )
    onBlob(audioBlob)
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio.volume = 0.8
    return new Promise((resolve, reject) => {
      audio.addEventListener('ended', () => {
        setTimeout(() => {
          URL.revokeObjectURL(audioUrl)
        }, 100)
        onComplete()
        resolve()
      })
      audio.addEventListener('error', () => {
        URL.revokeObjectURL(audioUrl)
        const error = new Error('服务器繁忙，请稍后重试')
        onError(error)
        reject(error)
      })
      audio.play().catch(() => {
        URL.revokeObjectURL(audioUrl)
        const error = new Error('服务器繁忙，请稍后重试')
        onError(error)
        reject(error)
      })
    })
  } catch (error) {
    // 生产环境统一错误提示
    onError(new Error('服务器繁忙，请稍后重试'))
    throw new Error('服务器繁忙，请稍后重试')
  }
}

/**
 * 实时流式文本转语音（接收即播放）
 * 使用 MediaSource API，支持实时音频播放，无需等待全部数据接收
 * 首块数据到达时即可开始播放，无需等待传输完成
 */
export const textToSpeechRealtime = async (text, options = {}) => {
  try {
    console.log('🎤 开始实时流式文本转语音...')
    
    const onStart = options.onStart || (() => {})
    const onProgress = options.onProgress || (() => {})
    const onComplete = options.onComplete || (() => {})
    const onError = options.onError || (() => {})
    
    onStart()
    
    try {
      const onStart = options.onStart || (() => {})
      const onProgress = options.onProgress || (() => {})
      const onComplete = options.onComplete || (() => {})
      const onError = options.onError || (() => {})
      onStart()
      const { audio, mediaSource } = await postStreamRealtime(
        `${API_CONFIG.API_BASE_URL}/api/tts/synthesize-stream`,
        { text },
        (info) => {
          onProgress({ received: info.received })
        },
        { responseType: 'audio/mpeg' }
      )
      audio.volume = 0.8
      await audio.play()
      audio.addEventListener('ended', () => {
        onComplete()
        setTimeout(() => {
          try {
            const url = audio.src
            if (url) URL.revokeObjectURL(url)
          } catch (e) {
            // 生产环境不输出详细错误
          }
        }, 100)
      }, { once: true })
      audio.addEventListener('error', () => {
        const error = new Error('服务器繁忙，请稍后重试')
        onError(error)
        setTimeout(() => {
          try {
            const url = audio.src
            if (url) URL.revokeObjectURL(url)
          } catch (e) {
            // 生产环境不输出详细错误
          }
        }, 100)
      }, { once: true })
      return { audio, mediaSource }
    } catch (error) {
      // 生产环境统一错误提示
      onError(new Error('服务器繁忙，请稍后重试'))
      throw new Error('服务器繁忙，请稍后重试')
    }
  } catch (error) { // 补充外层try的闭合catch
    // 生产环境统一错误提示
    onError(new Error('服务器繁忙，请稍后重试'))
    throw new Error('服务器繁忙，请稍后重试')
  }
} // 补充textToSpeechRealtime函数的闭合花括号

export const textToSpeechAndPlay = async (text, options = {}) => {
  try {
    const audioBlob = await textToSpeech(text, options)
    playAudio(audioBlob)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}