/**
 * WebSocket 连接诊断脚本
 * 在浏览器控制台运行此脚本来快速诊断问题
 * 
 * 使用方法:
 * 1. 按 F12 打开浏览器开发者工具
 * 2. 进入 Console 标签页
 * 3. 复制此脚本的内容并粘贴运行
 */

console.log('🔍 开始 WebSocket 连接诊断...\n');

// 1. 检查 API Key
console.group('1️⃣  API Key 检查');
const apiKey = import.meta.env.VITE_DASHSCOPE_API_KEY;
if (!apiKey) {
  console.error('❌ 未找到 API Key');
  console.log('💡 解决方案: 创建 .env.local 文件并配置 VITE_DASHSCOPE_API_KEY');
} else {
  console.log('✅ API Key 已配置');
  console.log('📊 长度:', apiKey.length);
  console.log('🔑 前缀:', apiKey.substring(0, 10) + '...');
  
  if (apiKey.startsWith('sk-')) {
    console.log('✅ 格式正确 (以 sk- 开头)');
  } else {
    console.error('❌ 格式错误 (应该以 sk- 开头)');
  }
}
console.groupEnd();

// 2. 检查网络连接
console.group('2️⃣  网络连接检查');
fetch('https://dashscope.aliyuncs.com', { method: 'HEAD' })
  .then(() => {
    console.log('✅ 可以访问 dashscope.aliyuncs.com');
  })
  .catch(error => {
    console.error('❌ 无法访问 dashscope.aliyuncs.com');
    console.error('📋 错误:', error.message);
    console.log('💡 可能原因:');
    console.log('  - 网络连接问题');
    console.log('  - 防火墙/代理阻止');
    console.log('  - DNS 解析失败');
  });
console.groupEnd();

// 3. 检查浏览器 WebSocket 支持
console.group('3️⃣  浏览器支持检查');
if (window.WebSocket) {
  console.log('✅ 浏览器支持 WebSocket');
} else {
  console.error('❌ 浏览器不支持 WebSocket (过旧的浏览器)');
}
console.groupEnd();

// 4. 检查环境模式
console.group('4️⃣  环境配置');
console.log('🌍 环境模式:', import.meta.env.MODE);
console.log('📦 Base URL:', import.meta.env.BASE_URL);
console.groupEnd();

// 5. 测试 WebSocket 连接
console.group('5️⃣  WebSocket 连接测试');
if (apiKey) {
  console.log('开始测试连接...');
  const testWsUrl = `wss://dashscope.aliyuncs.com/api-ws/v1/inference/?token=${apiKey}`;
  
  const testWs = new WebSocket(testWsUrl);
  
  testWs.onopen = () => {
    console.log('✅ WebSocket 连接成功!');
    testWs.close();
  };
  
  testWs.onerror = (error) => {
    console.error('❌ WebSocket 连接失败');
    console.error('错误:', error);
    console.log('💡 可能原因:');
    console.log('  - API Key 无效或过期');
    console.log('  - API Key 配额已用尽');
    console.log('  - 网络/防火墙问题');
  };
  
  testWs.onclose = (event) => {
    console.log('🔌 连接已关闭');
    console.log('状态码:', event.code);
    console.log('原因:', event.reason || '(无)');
  };
  
  // 30秒后超时
  setTimeout(() => {
    if (testWs.readyState === WebSocket.CONNECTING) {
      console.warn('⚠️  连接超时 (30秒)');
      testWs.close();
    }
  }, 30000);
} else {
  console.log('⏭️  跳过 (API Key 未配置)');
}
console.groupEnd();

// 6. 环境变量汇总
console.group('6️⃣  环境变量汇总');
console.table({
  'API Key 已配置': !!apiKey,
  'API Key 格式正确': apiKey?.startsWith('sk-'),
  '浏览器支持 WebSocket': !!window.WebSocket,
  '环境': import.meta.env.MODE
});
console.groupEnd();

console.log('\n✨ 诊断完成!');
console.log('📝 如需更多帮助，查看 WEBSOCKET_TROUBLESHOOTING.md');
