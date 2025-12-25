#!/usr/bin/env node

/**
 * 环境配置验证脚本
 * 在项目启动前检查所有必需的环境变量
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

console.log('🔍 验证环境配置...\n')

// 检查函数
function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath)
  const status = exists ? '✅' : '❌'
  console.log(`${status} ${description}: ${path.relative(projectRoot, filePath)}`)
  return exists
}

function checkFileContent(filePath, searchString, description) {
  if (!fs.existsSync(filePath)) return false
  const content = fs.readFileSync(filePath, 'utf8')
  const contains = content.includes(searchString)
  const status = contains ? '✅' : '❌'
  console.log(`${status} ${description}`)
  return contains
}

// 检查环境文件
console.log('📁 检查环境文件:')
const hasEnv = checkFile(path.join(projectRoot, '.env'), '.env 文件')
const hasEnvLocal = checkFile(path.join(projectRoot, '.env.local'), '.env.local 文件（开发）')
const hasEnvProduction = checkFile(path.join(projectRoot, '.env.production'), '.env.production 文件（生产）')

console.log('\n🔐 检查 .gitignore:')
const hasGitignore = checkFileContent(
  path.join(projectRoot, '.gitignore'),
  '.env.local',
  '.env.local 已在 .gitignore 中'
)

console.log('\n📝 检查环境变量内容:')
if (hasEnvLocal) {
  const envLocal = fs.readFileSync(path.join(projectRoot, '.env.local'), 'utf8')
  const hasApiKey = envLocal.includes('VITE_DASHSCOPE_API_KEY=')
  const hasValidKey = /VITE_DASHSCOPE_API_KEY=sk-/.test(envLocal)
  
  console.log(`${hasApiKey ? '✅' : '❌'} .env.local 中包含 VITE_DASHSCOPE_API_KEY`)
  console.log(`${hasValidKey ? '✅' : '⚠️'} API Key 格式看起来正确 (sk-...)`)
  
  if (!hasValidKey && hasApiKey) {
    console.log('   💡 API Key 应该以 sk- 开头')
  }
}

console.log('\n🔧 检查代码配置:')
checkFileContent(
  path.join(projectRoot, 'src/utils/env.js'),
  'getApiKey',
  '环境变量工具函数已创建'
)

checkFileContent(
  path.join(projectRoot, 'src/api/modules/tts.js'),
  'VITE_DASHSCOPE_API_KEY',
  'tts.js 已使用环境变量'
)

console.log('\n✨ 验证完成!\n')

// 使用建议
console.log('💡 后续步骤:')
console.log('1. 如果 .env.local 中的 API Key 已正确配置，可以直接运行: npm run dev')
console.log('2. 在生产环境前，更新 .env.production 中的 API Key')
console.log('3. 永远不要将 .env.local 或 .env.production 提交到 Git')
console.log('4. 查看 API_KEY_QUICK_GUIDE.md 了解更多详情\n')
