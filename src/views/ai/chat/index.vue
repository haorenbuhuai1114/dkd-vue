<template>
  <div class="ai-chat-layout">
    <!-- 左侧：历史会话列表 -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <el-button type="primary" :icon="Plus" round @click="createConversation">
          新建对话
        </el-button>
      </div>
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          :class="['conv-item', { active: conv.id === currentSessionId }]"
          @click="switchConversation(conv.id)"
        >
          <div class="conv-main">
            <div class="conv-title">{{ conv.title || '新对话' }}</div>
            <div class="conv-time">{{ formatConvTime(conv.createTime) }}</div>
          </div>
          <el-icon
            class="conv-del"
            @click.stop="deleteConversation(conv.id)"
          >
            <Close />
          </el-icon>
        </div>
        <div v-if="conversations.length === 0" class="empty-tip">
          暂无历史对话
        </div>
      </div>
    </aside>

    <!-- 右侧：聊天主区 -->
    <div class="ai-chat-container">
      <div class="chat-header">
        <div class="header-left">
          <el-icon :size="24" color="#409eff"><ChatDotRound /></el-icon>
          <span class="title">AI 运维助手</span>
        </div>
        <el-tag v-if="!online" type="danger" size="small">离线</el-tag>
        <el-tag v-else type="success" size="small">在线</el-tag>
      </div>

      <div class="chat-messages" ref="messagesRef">
        <div
          v-for="(msg, idx) in currentMessages"
          :key="idx"
          :class="['message-item', msg.role]"
        >
          <div class="avatar">
            <el-icon v-if="msg.role === 'user'" :size="20" color="#fff"><User /></el-icon>
            <el-icon v-else :size="20" color="#fff"><Cpu /></el-icon>
          </div>
          <div class="content">
            <div class="bubble" :class="msg.role">
              <span v-html="formatMessage(msg.content)"></span>
            </div>
            <div class="time">{{ msg.time }}</div>
          </div>
        </div>

        <div v-if="loading" class="message-item assistant">
          <div class="avatar">
            <el-icon :size="20" color="#fff"><Cpu /></el-icon>
          </div>
          <div class="content">
            <div class="bubble assistant">
              <span class="typing">
                <i></i><i></i><i></i>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="quick-actions">
        <el-button
          v-for="action in quickActions"
          :key="action"
          size="small"
          round
          @click="sendQuick(action)"
        >
          {{ action }}
        </el-button>
      </div>

      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          placeholder="输入指令，如：86号机该维修了"
          @keydown.enter.ctrl="sendMessage"
          :disabled="loading"
        />
        <el-button
          type="primary"
          :icon="Promotion"
          :loading="loading"
          @click="sendMessage"
          class="send-btn"
        >
          发送
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { ChatDotRound, User, Cpu, Promotion, Plus, Close } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { chatWithAI, checkAIHealth, clearAIHistory } from '@/api/ai/chat'

// ========== localStorage Key ==========
const LS_CONVS_KEY = 'ai:chat:conversations'
const LS_CURRENT_KEY = 'ai:chat:currentSessionId'

// ========== 欢迎语 ==========
const WELCOME_MSG = {
  role: 'assistant',
  content: '你好！我是 AI 运维助手，可以帮你：\n• 查询异常设备\n• 创建维修/补货/运营工单\n• 回答运维相关问题\n\n试试对我说："查一下有哪些异常设备" 或 "3号机该维修了"'
}

// ========== 状态 ==========
const conversations = ref([])      // localStorage 中的所有对话
const currentSessionId = ref('')   // 当前会话 sessionId
const inputText = ref('')
const loading = ref(false)
const online = ref(false)
const messagesRef = ref(null)

const quickActions = [
  '查一下有哪些异常设备',
  '86号机该维修了',
  '3号机该补货了',
  '1号机需要投放'
]

// 当前会话的消息（从 conversations 中派生，确保切换时一致）
const currentMessages = computed(() => {
  const conv = conversations.value.find(c => c.id === currentSessionId.value)
  return conv ? conv.messages : [WELCOME_MSG]
})

// ========== 工具函数 ==========
function formatTime(d) {
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function formatConvTime(ts) {
  const d = new Date(ts)
  const today = new Date()
  const isToday = d.toDateString() === today.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

function formatMessage(text) {
  return (text || '').replace(/\n/g, '<br>')
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// ========== sessionId 生成 ==========
function generateSessionId() {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `ai_${ts}_${rand}`
}

// ========== localStorage 读写 ==========
function loadConversations() {
  try {
    const raw = localStorage.getItem(LS_CONVS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    console.warn('解析 localStorage 对话失败:', e)
    return []
  }
}

function saveConversations() {
  try {
    localStorage.setItem(LS_CONVS_KEY, JSON.stringify(conversations.value))
    localStorage.setItem(LS_CURRENT_KEY, currentSessionId.value)
  } catch (e) {
    console.error('保存 localStorage 失败:', e)
    ElMessage.warning('本地存储失败，可能空间不足')
  }
}

// ========== 会话操作 ==========
function createConversation() {
  const id = generateSessionId()
  const newConv = {
    id,
    title: '新对话',
    createTime: Date.now(),
    messages: [{ ...WELCOME_MSG, time: formatTime(new Date()) }]
  }
  conversations.value.unshift(newConv)
  currentSessionId.value = id
  saveConversations()
  scrollToBottom()
}

function switchConversation(id) {
  if (id === currentSessionId.value) return
  currentSessionId.value = id
  saveConversations()
  scrollToBottom()
}

function deleteConversation(id) {
  ElMessageBox.confirm('确定删除该对话？删除后无法恢复。', '提示', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(async () => {
      const idx = conversations.value.findIndex(c => c.id === id)
      if (idx === -1) return
      conversations.value.splice(idx, 1)

      // 调后端清 Redis（失败不阻塞，Redis 还有 7 天 TTL 兜底）
      try {
        await clearAIHistory(id)
      } catch (e) {
        console.warn('清 Redis 失败（不影响本地删除）:', e)
      }

      // 若删除的是当前会话，则切换到第一个或新建
      if (currentSessionId.value === id) {
        if (conversations.value.length > 0) {
          currentSessionId.value = conversations.value[0].id
        } else {
          createConversation()
          return
        }
      }
      saveConversations()
      scrollToBottom()
    })
    .catch(() => {})
}

// ========== 发送消息 ==========
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || loading.value) return

  // 若无当前会话，自动新建
  if (!currentSessionId.value) {
    createConversation()
  }

  const conv = conversations.value.find(c => c.id === currentSessionId.value)
  if (!conv) return

  // 追加用户消息
  conv.messages.push({
    role: 'user',
    content: text,
    time: formatTime(new Date())
  })

  // 首条用户消息 → 自动生成标题
  if (conv.title === '新对话') {
    conv.title = text.length > 20 ? text.slice(0, 20) + '...' : text
  }

  inputText.value = ''
  loading.value = true
  saveConversations()
  scrollToBottom()

  try {
    const res = await chatWithAI(text, currentSessionId.value)
    if (res.code === 200) {
      conv.messages.push({
        role: 'assistant',
        content: res.data || 'AI 没有返回内容',
        time: formatTime(new Date())
      })
    } else {
      conv.messages.push({
        role: 'assistant',
        content: res.msg || 'AI 对话失败',
        time: formatTime(new Date())
      })
      ElMessage.error(res.msg || 'AI 对话失败')
    }
  } catch (err) {
    conv.messages.push({
      role: 'assistant',
      content: '抱歉，AI 服务暂时不可用，请稍后重试。',
      time: formatTime(new Date())
    })
  } finally {
    loading.value = false
    saveConversations()
    scrollToBottom()
  }
}

function sendQuick(text) {
  inputText.value = text
  sendMessage()
}

// ========== 初始化 ==========
onMounted(async () => {
  // 恢复历史会话
  conversations.value = loadConversations()
  const savedCurrent = localStorage.getItem(LS_CURRENT_KEY)
  if (savedCurrent && conversations.value.find(c => c.id === savedCurrent)) {
    currentSessionId.value = savedCurrent
  } else if (conversations.value.length > 0) {
    currentSessionId.value = conversations.value[0].id
  } else {
    // 无历史 → 新建一个
    createConversation()
  }
  scrollToBottom()

  // 健康检查
  try {
    const res = await checkAIHealth()
    online.value = res.code === 200
  } catch {
    online.value = false
  }
})
</script>

<style scoped lang="scss">
.ai-chat-layout {
  display: flex;
  height: calc(100vh - 120px);
  gap: 12px;
}

/* ===== 左侧侧栏 ===== */
.sidebar {
  width: 240px;
  flex-shrink: 0;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid #ebeef5;

  .sidebar-header {
    padding: 12px;
    border-bottom: 1px solid #ebeef5;

    .el-button {
      width: 100%;
    }
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;

    .conv-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
      margin-bottom: 4px;

      &:hover {
        background: #f5f7fa;

        .conv-del {
          opacity: 1;
        }
      }

      &.active {
        background: #ecf5ff;
        border: 1px solid #d9ecff;
      }

      .conv-main {
        flex: 1;
        min-width: 0;

        .conv-title {
          font-size: 13px;
          color: #303133;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
        }

        .conv-time {
          font-size: 11px;
          color: #909399;
          margin-top: 2px;
        }
      }

      .conv-del {
        opacity: 0;
        color: #f56c6c;
        font-size: 14px;
        cursor: pointer;
        transition: opacity 0.2s;
        flex-shrink: 0;

        &:hover {
          color: #f78989;
        }
      }
    }

    .empty-tip {
      text-align: center;
      color: #909399;
      font-size: 13px;
      padding: 20px 0;
    }
  }
}

/* ===== 右侧主聊天区 ===== */
.ai-chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  border-radius: 12px;
  overflow: hidden;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;

    .title {
      font-size: 16px;
      font-weight: 600;
      color: #303133;
    }
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;

  .message-item {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;

    &.user {
      flex-direction: row-reverse;

      .avatar {
        background: #409eff;
      }

      .bubble {
        background: #409eff;
        color: #fff;
      }

      .content {
        align-items: flex-end;
      }

      .time {
        text-align: right;
      }
    }

    &.assistant {
      .avatar {
        background: #67c23a;
      }

      .bubble {
        background: #fff;
        color: #303133;
        border: 1px solid #ebeef5;
      }
    }

    .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .content {
      display: flex;
      flex-direction: column;
      max-width: 70%;
    }

    .bubble {
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.6;
      word-break: break-word;
    }

    .time {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
    }
  }
}

.typing {
  display: inline-flex;
  gap: 4px;

  i {
    width: 6px;
    height: 6px;
    background: #909399;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;

    &:nth-child(1) { animation-delay: -0.32s; }
    &:nth-child(2) { animation-delay: -0.16s; }
  }
}

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 24px;
  background: #fff;
  border-top: 1px solid #ebeef5;
}

.chat-input {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  background: #fff;
  border-top: 1px solid #ebeef5;

  .send-btn {
    height: 40px;
  }
}
</style>
