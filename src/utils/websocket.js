/**
 * WebSocket 管理器
 * 处理连接、重连、心跳等
 */

import { WS_CONFIG, WS_OPTIONS, WS_MESSAGE_TYPES } from '@/config/websocket'

class WebSocketManager {
  constructor() {
    this.ws = null
    this.url = ''
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.reconnectCount = 0
    this.callbacks = new Map()
    this.isManualClose = false
  }

  connect(path = WS_CONFIG.WS_PATH, options = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.warn('WebSocket 已连接')
      return Promise.resolve()
    }

    this.url = `${WS_CONFIG.WS_BASE_URL}${path}`
    this.isManualClose = false

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)
        
        this.ws.onopen = () => {
          console.log('WebSocket 连接成功')
          this.reconnectCount = 0
          this.startHeartbeat()
          this.emit('open')
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket 错误:', error)
          this.emit('error', error)
          reject(error)
        }

        this.ws.onclose = () => {
          console.log('WebSocket 连接关闭')
          this.stopHeartbeat()
          this.emit('close')
          
          if (!this.isManualClose && WS_OPTIONS.autoReconnect) {
            this.attemptReconnect()
          }
        }
      } catch (error) {
        console.error('WebSocket 连接错误:', error)
        reject(error)
      }
    })
  }

  handleMessage(data) {
    try {
      const message = typeof data === 'string' ? JSON.parse(data) : data
      
      if (message.type) {
        this.emit(message.type, message.data)
      }
      
      this.emit('message', message)
    } catch (error) {
      console.error('消息解析错误:', error)
      this.emit('error', { message: '消息解析失败', error })
    }
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket 未连接')
    }

    try {
      const data = typeof message === 'string' ? message : JSON.stringify(message)
      this.ws.send(data)
    } catch (error) {
      console.error('发送消息失败:', error)
      throw error
    }
  }

  startHeartbeat() {
    if (!WS_OPTIONS.heartbeat) return

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: WS_MESSAGE_TYPES.PING,
          timestamp: Date.now()
        })
      }
    }, WS_OPTIONS.heartbeatInterval)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  attemptReconnect() {
    if (this.reconnectCount >= WS_OPTIONS.reconnectAttempts) {
      console.error('WebSocket 重连次数已达上限')
      this.emit('reconnectFailed')
      return
    }

    this.reconnectCount++
    console.log(`WebSocket 正在重连... (${this.reconnectCount}/${WS_OPTIONS.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, WS_OPTIONS.reconnectInterval)
  }

  close() {
    this.isManualClose = true
    this.stopHeartbeat()
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  on(event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, [])
    }
    this.callbacks.get(event).push(callback)
  }

  off(event, callback) {
    if (this.callbacks.has(event)) {
      const callbacks = this.callbacks.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.callbacks.has(event)) {
      this.callbacks.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`事件 '${event}' 处理错误:`, error)
        }
      })
    }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }

  getStatus() {
    if (!this.ws) return 'CLOSED'
    
    const states = {
      [WebSocket.CONNECTING]: 'CONNECTING',
      [WebSocket.OPEN]: 'OPEN',
      [WebSocket.CLOSING]: 'CLOSING',
      [WebSocket.CLOSED]: 'CLOSED'
    }
    
    return states[this.ws.readyState] || 'UNKNOWN'
  }
}

export default new WebSocketManager()
