/**
 * HTTP 工具类
 * 统一管理所有 fetch 请求，包括超时、错误处理
 */

const REQUEST_TIMEOUT = 30000 // 30秒超时

/**
 * 创建带超时的 AbortController
 * @param {number} timeout - 超时时间（毫秒），默认30秒
 * @returns {Object} { controller, timeoutId }
 */
export function createFetchController(timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeout)
  return { controller, timeoutId }
}

/**
 * 通用的 fetch 封装
 * @param {string} url - 请求URL
 * @param {Object} options - fetch 选项
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}) {
  const timeout = options.timeout || REQUEST_TIMEOUT
  const { controller, timeoutId } = createFetchController(timeout)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 处理 JSON 响应
 * @param {Response} response - fetch 响应
 * @returns {Promise<Object>}
 */
export async function handleJsonResponse(response) {
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`)
  }
  const data = await response.json()
  if (data.code !== 200) {
    throw new Error(data.message || '请求失败')
  }
  return data
}

/**
 * 处理 Blob 响应
 * @param {Response} response - fetch 响应
 * @returns {Promise<Blob>}
 */
export async function handleBlobResponse(response) {
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`)
  }
  return response.blob()
}

/**
 * POST 请求（JSON）
 * @param {string} url - 请求URL
 * @param {Object} data - 请求数据
 * @param {Object} options - 额外选项
 * @returns {Promise<Object>}
 */
export async function postJson(url, data = {}, options = {}) {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      ...options
    })
    return handleJsonResponse(response)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

/**
 * POST 请求（FormData）
 * @param {string} url - 请求URL
 * @param {FormData} formData - FormData 对象
 * @param {Object} options - 额外选项
 * @returns {Promise<Object>}
 */
export async function postFormData(url, formData, options = {}) {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      body: formData,
      ...options
    })
    return handleJsonResponse(response)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

/**
 * POST 请求（返回 Blob）
 * @param {string} url - 请求URL
 * @param {Object} data - 请求数据
 * @param {Object} options - 额外选项
 * @returns {Promise<Blob>}
 */
export async function postBlob(url, data = {}, options = {}) {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      ...options
    })
    return handleBlobResponse(response)
  } catch (error) {
    // 生产环境统一错误提示
    throw new Error('服务器繁忙，请稍后重试')
  }
}

/**
 * 流式 POST 请求
 * @param {string} url - 请求URL
 * @param {Object} data - 请求数据
 * @param {Function} onChunk - 数据块回调
 * @param {Object} options - 额外选项
 * @returns {Promise<Blob>}
 */
export async function postStream(url, data = {}, onChunk = () => {}, options = {}) {
  const { controller, timeoutId } = createFetchController(options.timeout || REQUEST_TIMEOUT)
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal
    })
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`)
    }
    
    const reader = response.body.getReader()
    const chunks = []
    let totalBytes = 0
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      chunks.push(value)
      totalBytes += value.length
      onChunk({ received: totalBytes, chunk: value })
    }
    
    return new Blob(chunks, { type: options.responseType || 'application/octet-stream' })
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 流式 POST 请求（实时播放音频）
 * 使用 MediaSource 实现边接收边播放，首块数据到达即可开始播放
 * @param {string} url - 请求URL
 * @param {Object} data - 请求数据
 * @param {Function} onChunk - 数据块回调
 * @param {Object} options - 额外选项
 * @returns {Promise<{audio: HTMLAudioElement, mediaSource: MediaSource}>}
 */
export async function postStreamRealtime(url, data = {}, onChunk = () => {}, options = {}) {
  const { controller, timeoutId } = createFetchController(options.timeout || REQUEST_TIMEOUT)
  
  // 创建 MediaSource 和音频元素
  const mediaSource = new MediaSource()
  const audio = new Audio()
  const audioUrl = URL.createObjectURL(mediaSource)
  audio.src = audioUrl
  
  let sourceBuffer = null
  let isSourceOpen = false
  let pendingChunks = []
  let totalBytes = 0
  let hasFirstChunk = false
  let streamEnded = false
  let detectedMimeType = null
  
  // 辅助函数：处理待处理数据块
  const flushPendingChunks = () => {
    if (!sourceBuffer || sourceBuffer.updating) {
      return
    }
    
    // 一次性处理多个待处理数据块，减少事件触发次数
    while (pendingChunks.length > 0 && !sourceBuffer.updating) {
      try {
        const chunk = pendingChunks.shift()
        sourceBuffer.appendBuffer(chunk)
        console.log(`📤 添加数据块到 SourceBuffer: ${chunk.length} bytes，待处理: ${pendingChunks.length}`)
      } catch (error) {
        console.error('❌ 添加缓冲区失败:', error)
        break
      }
    }
    
    // 如果流已结束且没有待处理数据，标记 MediaSource 为完成
    if (streamEnded && pendingChunks.length === 0 && !sourceBuffer.updating && mediaSource.readyState === 'open') {
      try {
        mediaSource.endOfStream()
        console.log('✅ 音频流结束')
      } catch (error) {
        console.error('❌ endOfStream 失败:', error)
      }
    }
  }
  
  // MediaSource 打开事件
  const sourceOpenPromise = new Promise((resolve) => {
    mediaSource.addEventListener('sourceopen', () => {
      console.log('📱 MediaSource 已打开，创建 SourceBuffer')
      isSourceOpen = true
      
      // 优先使用检测到的 mime-type，其次使用选项，最后使用默认值
      const mimeType = detectedMimeType || options.responseType || 'audio/mpeg'
      console.log(`🎵 使用 mime-type: ${mimeType}`)
      
      try {
        sourceBuffer = mediaSource.addSourceBuffer(mimeType)
        
        // 监听 updateend 事件，处理待处理数据
        sourceBuffer.addEventListener('updateend', () => {
          console.log(`📊 SourceBuffer 更新完成，待处理数据: ${pendingChunks.length} 块`)
          flushPendingChunks()
        })
        
        resolve()
      } catch (error) {
        console.error('❌ 创建 SourceBuffer 失败:', error)
        // 如果 mime-type 不支持，尝试使用默认值
        if (detectedMimeType && detectedMimeType !== 'audio/mpeg') {
          console.warn('⚠️ 尝试使用备用 mime-type: audio/mpeg')
          detectedMimeType = 'audio/mpeg'
          try {
            sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
            sourceBuffer.addEventListener('updateend', () => {
              console.log(`📊 SourceBuffer 更新完成，待处理数据: ${pendingChunks.length} 块`)
              flushPendingChunks()
            })
            resolve()
          } catch (fallbackError) {
            console.error('❌ 备用 mime-type 也失败了:', fallbackError)
            resolve() // 继续执行，可能后续会恢复
          }
        } else {
          resolve() // 继续执行，可能后续会恢复
        }
      }
    }, { once: true })
  })
  
  // 启动数据流处理
  const streamPromise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal
      })
      
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`)
      }
      
      // 从 response headers 获取 mime-type
      const contentType = response.headers.get('content-type')
      if (contentType) {
        // 提取 mime-type（去除参数，如 "audio/mpeg; charset=utf-8" -> "audio/mpeg"）
        detectedMimeType = contentType.split(';')[0].trim()
        console.log(`📥 从 Content-Type header 获取 mime-type: ${detectedMimeType}`)
      }
      
      const reader = response.body.getReader()
      
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log(`✅ 数据流接收完成，共 ${totalBytes} bytes`)
          streamEnded = true
          flushPendingChunks()
          break
        }
        
        totalBytes += value.length
        onChunk({ received: totalBytes, chunk: value })
        
        if (!hasFirstChunk) {
          hasFirstChunk = true
          console.log(`📥 收到首块数据: ${value.length} bytes`)
        }
        
        // 等待 MediaSource 打开
        await sourceOpenPromise
        
        if (isSourceOpen && sourceBuffer) {
          if (!sourceBuffer.updating) {
            try {
              sourceBuffer.appendBuffer(value)
            } catch (error) {
              console.error('❌ 添加缓冲区失败:', error)
              pendingChunks.push(value)
            }
          } else {
            // SourceBuffer 正在更新，缓存数据
            pendingChunks.push(value)
          }
          
          // 动态流量控制：如果待处理数据过多，稍微延迟接收
          if (pendingChunks.length > 5) {
            console.warn(`⚠️ 待处理数据堆积: ${pendingChunks.length} 块，暂停接收 50ms`)
            await new Promise(resolve => setTimeout(resolve, 50))
          }
        } else {
          // 还未初始化，缓存数据
          pendingChunks.push(value)
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.error('❌ 请求超时')
      } else {
        console.error('❌ 数据流错误:', error.message)
      }
      streamEnded = true
    }
  })()
  
  // 返回 Promise，在首块数据到达后立即返回，让缓冲区有足够数据时播放
  return new Promise((resolve, reject) => {
    // 监听首块数据
    const checkFirstChunk = setInterval(() => {
      if (hasFirstChunk) {
        clearInterval(checkFirstChunk)
        console.log('📥 首块音频数据已接收，继续缓冲...')
        
        // 动态判断何时开始播放：等待缓冲区有足够数据或 1 秒后开始
        let bufferCheckInterval = null
        let startTime = Date.now()
        
        const tryStartPlayback = () => {
          if (!sourceBuffer) {
            console.log('🎵 SourceBuffer 未就绪，继续等待...')
            return
          }
          
          // 检查 SourceBuffer 中缓冲的数据量
          const buffered = audio.buffered
          let totalBuffered = 0
          for (let i = 0; i < buffered.length; i++) {
            totalBuffered += buffered.end(i) - buffered.start(i)
          }
          
          const elapsedTime = Date.now() - startTime
          const hasEnoughBuffer = totalBuffered > 1 || elapsedTime > 1000  // 至少 1 秒音频或 1 秒时间
          
          console.log(`📊 缓冲进度: ${totalBuffered.toFixed(2)}s 音频数据, 等待时间: ${elapsedTime}ms`)
          
          if (hasEnoughBuffer) {
            console.log(`✅ 缓冲就绪 (${totalBuffered.toFixed(2)}s 数据)，开始播放`)
            if (bufferCheckInterval) clearInterval(bufferCheckInterval)
            resolve({ audio, mediaSource, sourceBuffer })
          }
        }
        
        // 每 100ms 检查一次缓冲情况
        bufferCheckInterval = setInterval(tryStartPlayback, 100)
        
        // 立即检查一次
        tryStartPlayback()
      }
    }, 5)
    
    // 超时检查
    setTimeout(() => {
      clearInterval(checkFirstChunk)
      if (!hasFirstChunk) {
        reject(new Error('数据流超时'))
      }
    }, 10000)
    
    // 错误处理
    audio.addEventListener('error', (e) => {
      clearInterval(checkFirstChunk)
      reject(new Error(`音频播放错误: ${e.target.error?.message || '未知错误'}`))
    }, { once: true })
    
    streamPromise.catch((error) => {
      if (!hasFirstChunk) {
        clearInterval(checkFirstChunk)
        reject(error)
      }
    })
  }).finally(() => {
    clearTimeout(timeoutId)
  })
}
