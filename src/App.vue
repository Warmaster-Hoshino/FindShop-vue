<script setup>
import { ref, onMounted } from 'vue'
import { uploadAudio, getAnswer } from '@/api/modules/qa'
import { textToSpeechRealtime, playAudio } from '@/api/modules/tts'

/**
 * 状态管理
 */
// UI 显示
const questionText = ref('请按住麦克风提问，可以试试方言哦')  // 用户的问题文本
const answerText = ref('')                    // 系统的答案文本

// 录音状态
const isRecording = ref(false)                // 是否正在录音
const mediaRecorder = ref(null)               // 录音机实例
const audioChunks = ref([])                   // 音频数据块缓冲区
let recordingTimer = null                     // 超时计时器（10秒自动停止）

// 播放状态
const isPlaying = ref(false)                  // 是否正在播放音频
const playProgress = ref(0)                   // 播放进度 (0-100)
const isAnswerReady = ref(false)              // QA API 是否已返回答案
const cachedAnswer = ref('')                  // 缓存的上一个答案（用于判断是否需要重新生成音频）
const cachedAudioBlob = ref(null)             // 缓存的音频 Blob（用于复用音频）
const currentAudioElement = ref(null)         // 当前播放的音频元素
const currentMediaSource = ref(null)          // 当前的 MediaSource 对象

// 请求防抖状态 ✅ 防止恶意多次请求
const isLoading = ref(false)                  // 是否正在加载答案（防止音频重复提交）
const isProcessing = ref(false)               // 是否正在处理TTS请求（防止播放重复触发）

// 录音事件状态 ✅ 防止按住状态被绕过
const isStartingRecording = ref(false)        // 是否正在启动录音（防止touchstart多次触发）
const lastEventType = ref(null)               // 最后一次事件类型（防止鼠标/触摸混乱）

onMounted(async () => {
  try {
    // 1️⃣ 申请麦克风权限并获取音频流
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    
    // 2️⃣ 选择浏览器支持的音频格式
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 
                     MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
    
    // 3️⃣ 创建录音机实例
    mediaRecorder.value = new MediaRecorder(stream, { mimeType })
    
    // 4️⃣ 音频数据可用时，将其添加到缓冲区
    mediaRecorder.value.ondataavailable = (e) => e.data.size > 0 && audioChunks.value.push(e.data)
    
    // 5️⃣ 停止录音时，处理音频数据
    mediaRecorder.value.onstop = async () => {
      await sendAudioToServer(new Blob(audioChunks.value, { type: 'audio/webm' }))
      audioChunks.value = []
    }
    
    // 6️⃣ 录音出错处理
    mediaRecorder.value.onerror = (e) => {
      // 生产环境不输出详细错误
      questionText.value = '服务器繁忙，请稍后重试'
      isRecording.value = false
    }
  } catch (error) {
    // 生产环境不输出详细错误
    questionText.value = '服务器繁忙，请稍后重试'
  }
})

/**
 * 按住麦克风按钮开始录音
 * ✅ 防止多次触发：检查 isStartingRecording 标志
 * ✅ 防止事件混乱：记录事件类型，只允许匹配的 End 事件
 */
const handleTouchStart = (event) => {
  // ✅ 防止重复触发（防抖）
  if (isStartingRecording.value) {
    console.warn('❌ 录音已在启动中，忽略此次事件')
    return
  }
  
  // ✅ 防止不匹配的事件配对
  if (!mediaRecorder.value || isRecording.value) {
    console.warn('❌ 录音机未初始化或已在录音中')
    return
  }
  
  isStartingRecording.value = true
  lastEventType.value = event.type  // 记录事件类型：touchstart 或 mousedown
  
  try {
    audioChunks.value = []
    isRecording.value = true
    questionText.value = '正在录音...'
    answerText.value = ''
    
    mediaRecorder.value.start()
    recordingTimer = setTimeout(() => {
      if (isRecording.value) {
        stopRecording()
        answerText.value = '服务器繁忙，请稍后重试'
      }
    }, 10000)
  } catch (error) {
    // 生产环境不输出详细错误
    questionText.value = '服务器繁忙，请稍后重试'
    isRecording.value = false
  } finally {
    // ✅ 重置启动标志
    isStartingRecording.value = false
  }
}

/**
 * 松开麦克风按钮停止录音
 * ✅ 验证事件匹配：touchend 应该匹配 touchstart，mouseup 应该匹配 mousedown
 */
const handleTouchEnd = (event) => {
  // ✅ 防止事件错配
  const eventType = event.type  // touchend 或 mouseup
  const expectedType = lastEventType.value === 'touchstart' ? 'touchend' : 'mouseup'
  
  // 允许交叉事件配对（用户可能从touch切到mouse），但要求至少一个事件已触发
  if (!isRecording.value) {
    console.warn('❌ 没有活跃的录音会话，忽略此次事件')
    return
  }
  
  // ✅ 检查事件类型是否合理
  const isValidEventPair = 
    (lastEventType.value === 'touchstart' && eventType === 'touchend') ||
    (lastEventType.value === 'mousedown' && eventType === 'mouseup')
  
  if (!isValidEventPair) {
    console.warn(`⚠️ 事件类型不匹配: 开始类型=${lastEventType.value}, 结束类型=${eventType}，继续处理`)
    // 仍然停止录音，但记录警告
  }
  
  stopRecording()
}

/**
 * 停止录音的核心逻辑
 * ✅ 重置所有相关状态，包括事件类型
 */
const stopRecording = () => {
  if (mediaRecorder.value?.state === 'recording') {
    mediaRecorder.value.stop()
  }
  isRecording.value = false
  recordingTimer && (clearTimeout(recordingTimer), recordingTimer = null)
  lastEventType.value = null  // ✅ 重置事件类型，为下一次按住做准备
}

/**
 * 发送音频到服务器进行处理
 */
const sendAudioToServer = async (audioBlob) => {
  // ✅ 防抖检查：阻止重复请求
  if (isLoading.value) {
    console.warn('请求处理中，请勿重复提交')
    return
  }
  
  isLoading.value = true
  questionText.value = '正在识别...'
  answerText.value = ''
  
  try {
    // 第1步：获取后端返回的response，并验证状态码
    const response = await uploadAudio(audioBlob)
    
    // 第2步：验证接口返回码
    if (response.code !== 200) {
      throw new Error(`接口返回错误：${response.message || '未知错误'}`)
    }
    
    // 第3步：直接提取 text 字段（后台已返回纯文本）
    const text = response.text?.trim() || ''
    
    if (!text) throw new Error('未能识别出文本内容')
    
    console.log('✅ 识别文本:', text)
    
    questionText.value = text
    answerText.value = '我正在思考.........'
    isAnswerReady.value = false
    
    const result = await getAnswer(text)
    // data 字段直接就是答案文本
    answerText.value = result.data || '未获取到答案'
    isAnswerReady.value = true
    
    // 清除之前的缓存，答案已更新
    cachedAnswer.value = ''
    
  } catch (error) {
    // 生产环境不输出详细错误
    questionText.value = '服务器繁忙，请稍后重试'
    answerText.value = '服务器繁忙，请稍后重试'
  } finally {
    // ✅ 务必重置加载状态
    isLoading.value = false
  }
}

/**
 * 播放答案的语音版本
 */
const playAnswerVoice = async () => {
  // ✅ 如果正在播放，则停止播放
  if (isPlaying.value) {
    console.log('⏸️ 停止音频播放')
    if (currentAudioElement.value) {
      currentAudioElement.value.pause()
      currentAudioElement.value.currentTime = 0
    }
    isPlaying.value = false
    playProgress.value = 0
    isProcessing.value = false
    return
  }
  
  // ✅ 防抖检查：阻止重复触发
  if (!answerText.value || isProcessing.value) return
  
  isProcessing.value = true
  isPlaying.value = true
  playProgress.value = 0
  
  try {
    console.log('🔊 开始播放语音，文本长度:', answerText.value.length)
    
    // 检查缓存：如果答案没变化，复用之前的语音（无需重新请求）
    if (cachedAnswer.value === answerText.value && cachedAudioBlob.value) {
      console.log('✅ 答案未变化，复用缓存音频')
      // 直接通过 playAudio 播放缓存的音频 Blob
      const audioUrl = URL.createObjectURL(cachedAudioBlob.value)
      const audio = new Audio(audioUrl)
      audio.volume = 0.8
      currentAudioElement.value = audio
      
      audio.addEventListener('ended', () => {
        console.log('✅ 缓存音频播放完成')
        isPlaying.value = false
        playProgress.value = 0
        isProcessing.value = false
        URL.revokeObjectURL(audioUrl)
      }, { once: true })
      
      audio.addEventListener('error', (e) => {
        console.error('❌ 缓存音频播放失败:', e)
        isPlaying.value = false
        playProgress.value = 0
        isProcessing.value = false
        URL.revokeObjectURL(audioUrl)
      }, { once: true })
      
      audio.play().catch((e) => {
        console.error('❌ 缓存音频播放异常:', e)
        isPlaying.value = false
        isProcessing.value = false
      })
      return
    }
    
    // 🎵 使用真正的流式播放（首块数据到达即开始播放）
    const { audio, mediaSource } = await textToSpeechRealtime(answerText.value, {
      voice: 'longanyang',
      format: 'mp3',
      sample_rate: 22050,
      volume: 50,
      rate: 1,
      pitch: 1,
      
      onStart: () => {
        console.log('🔊 开始生成音频流...')
      },
      onProgress: (info) => {
        // 实时更新接收进度
        playProgress.value = Math.min((info.received / (answerText.value.length * 100)) * 100, 100)
      },
      onComplete: () => {
        console.log('✅ 音频流播放完成')
        isPlaying.value = false
        playProgress.value = 0
        isProcessing.value = false
        cachedAnswer.value = answerText.value  // 缓存当前答案
        cachedAudioBlob.value = null  // 流式播放不缓存 Blob
      },
      onError: (error) => {
        // 生产环境不输出详细错误
        isPlaying.value = false
        playProgress.value = 0
        isProcessing.value = false
        answerText.value = '服务器繁忙，请稍后重试'
      }
    })
    
    // 保存当前播放的音频和媒体源
    currentAudioElement.value = audio
    currentMediaSource.value = mediaSource
    
    // 音频已在后台自动开始播放（首块数据到达时）
    console.log('🎵 音频流已自动开始播放，可点击按钮停止')
    
  } catch (error) {
    // 生产环境不输出详细错误
    answerText.value = '服务器繁忙，请稍后重试'
    isPlaying.value = false
    playProgress.value = 0
    isProcessing.value = false
  }
}
</script>

<template>
  <div class="container">
    <h1 class="title">AI找店</h1>
    
    <div class="content">
      <!-- 问题显示区 -->
      <div class="text-box question-box">
        <div class="text-content question" :class="{ placeholder: !questionText }">
          {{ questionText || '请按住麦克风提问，可以试试方言哦' }}
        </div>
      </div>
      
      <!-- 答案显示区 -->
      <div class="text-box answer-box">
        <!-- 答案文本 -->
        <div class="text-content answer">
          {{ answerText }}
        </div>
        
        <!-- 播放按钮 -->
        <button 
          v-if="answerText && !isRecording && isAnswerReady"
          class="play-button"
          :class="{ playing: isPlaying }"
          @click="playAnswerVoice"
          :disabled="isProcessing"
          :title="isProcessing ? '音频处理中，请勿重复点击' : (isPlaying ? '点击停止播放' : '点击播放答案')"
        >
          <svg v-if="!isPlaying" class="play-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3-13h6v10H9z"/>
          </svg>
          <svg v-else class="play-icon playing" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-3-13h2v10H9zm4 0h2v10h-2z"/>
          </svg>
        </button>
      </div>
      
      <!-- 麦克风按钮 -->
      <div class="mic-container">
        <button 
          class="mic-button"
          :class="{ recording: isRecording }"
          :disabled="isLoading || isStartingRecording"
          @touchstart.prevent="handleTouchStart"
          @touchend.prevent="handleTouchEnd"
          @mousedown.prevent="handleTouchStart"
          @mouseup.prevent="handleTouchEnd"
          :title="isLoading ? '请求处理中，请勿重复提交' : (isStartingRecording ? '启动中...' : '按住说话')"
        >
          <svg class="mic-icon" viewBox="0 0 24 24" fill="none">
            <path d="M12 1C10.34 1 9 2.34 9 4V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V4C15 2.34 13.66 1 12 1Z" fill="currentColor"/>
            <path d="M19 10V12C19 15.87 15.87 19 12 19C8.13 19 5 15.87 5 12V10H3V12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12V10H19Z" fill="currentColor"/>
            <path d="M11 22H13V24H11V22Z" fill="currentColor"/>
          </svg>
          <span class="mic-text">{{ isLoading ? '处理中...' : (isRecording ? '松开结束' : '按住说话') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }

.container {
  height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  flex-direction: column;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}

.title {
  color: white;
  text-align: center;
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 30px;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
}

.content { 
  flex: 1; 
  display: flex; 
  flex-direction: column; 
  gap: 20px; 
  overflow: hidden;
  min-height: 0;
}

.text-box {
  background: white;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
}

.question-box {
  flex: 1;
}

.answer-box {
  flex: 3;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.text-content {
  width: 100%;
  font-size: 16px;
  line-height: 1.6;
  color: #333;
  font-family: inherit;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
  flex: 1;
  overflow-y: auto;
}

.text-content.placeholder {
  color: #999;
}

/* 播放按钮 */
.play-button {
  align-self: flex-start;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.play-button:hover:not(:disabled) {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.play-button:active:not(:disabled) {
  transform: scale(0.95);
}

.play-button:disabled {
  opacity: 0.8;
  cursor: not-allowed;
}

.play-button.playing {
  animation: playPulse 1.5s ease-in-out infinite;
}

@keyframes playPulse {
  0%, 100% { 
    transform: scale(1);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  }
  50% { 
    transform: scale(1.15);
    box-shadow: 0 4px 16px rgba(102, 126, 234, 0.6);
  }
}

.play-icon {
  width: 24px;
  height: 24px;
}

.play-icon.playing {
  animation: iconPulse 0.6s ease-in-out infinite;
}

@keyframes iconPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.mic-container { 
  display: flex; 
  justify-content: center; 
  padding: 20px 0; 
}

.mic-button {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: none;
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  color: #667eea;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.mic-button:active:not(:disabled) { 
  transform: scale(0.95); 
}

.mic-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background: #f0f0f0;
  color: #999;
}

.mic-button.recording {
  background: #ff4757;
  color: white;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }
  50% { box-shadow: 0 0 0 20px rgba(255, 71, 87, 0); }
}

.mic-icon { 
  width: 32px; 
  height: 32px; 
  margin-bottom: 4px; 
}

.mic-text { 
  font-size: 12px; 
  font-weight: 500; 
}

@media (max-width: 768px) {
  .container { padding: 15px; }
  .title { font-size: 28px; margin-bottom: 20px; }
  .text-box { padding: 15px; min-height: 120px; }
  .text-content { font-size: 15px; }
  .mic-button { width: 70px; height: 70px; }
  .mic-icon { width: 28px; height: 28px; }
  .play-button { font-size: 13px; padding: 6px 12px; }
}

@media (max-width: 480px) {
  .title { font-size: 24px; }
  .text-box { min-height: 100px; }
}
</style>
