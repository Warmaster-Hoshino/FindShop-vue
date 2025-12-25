/**
 * WebSocket 配置
 * 用于实时通信和消息推送
 */

const ENV = {
  development: {
    WS_BASE_URL: 'ws://localhost:8000',
    WS_PATH: '/ws',
  },
  production: {
    WS_BASE_URL: 'wss://www.ryougi.top',
    WS_PATH: '/ws',
  },
  test: {
    WS_BASE_URL: 'ws://test-api.example.com',
    WS_PATH: '/ws',
  }
}

const currentEnv = import.meta.env.MODE || 'development'

export const WS_CONFIG = ENV[currentEnv] || ENV.development

export const WS_OPTIONS = {
  autoReconnect: true,
  reconnectInterval: 3000,
  reconnectAttempts: 5,
  heartbeat: true,
  heartbeatInterval: 30000,
  heartbeatTimeout: 5000,
  binaryType: 'arraybuffer',
}

export const WS_MESSAGE_TYPES = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  PING: 'ping',
  PONG: 'pong',
  QUESTION: 'question',
  ANSWER: 'answer',
  ERROR: 'error',
  NOTIFICATION: 'notification',
}

export const ALIYUN_WS_PARAMS = {
  format: 'pcm',
  sample_rate: 16000,
  enable_intermediate_result: true,
}
