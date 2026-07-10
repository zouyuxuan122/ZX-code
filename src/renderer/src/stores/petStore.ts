import { useEffect } from 'react'
import { create } from 'zustand'
import { useChatStore } from './chatStore'
import { generatePetAnimation } from '@/services/petAnimation.service'
import { ipc } from '@/services/ipc'

// ─── Types ────────────────────────────────────────────

export type PetMood = 'idle' | 'happy' | 'working' | 'annoyed' | 'sleeping' | 'talking'

export type BackgroundType = 'theme' | 'solid' | 'gradient' | 'image'

/**
 * 通用情绪名 → Live2D 模型动作/表情映射。
 * 用于将 PetMood / pendingExpression 这类通用情绪名转换为
 * 具体模型（fense.model3.json）实际可用的动作与表情名。
 *
 * - motion: 模型动作名；'idle' 表示不触发动作
 * - expression: 模型表情名；'none' 表示不触发表情
 */
export const EMOTION_TO_MOTION_MAP: Record<
  string,
  { motion: string; expression: string }
> = {
  happy: { motion: 'kaixin', expression: 'lianhong' },
  annoyed: { motion: 'shengqi', expression: 'shengqi' },
  working: { motion: 'jingya', expression: 'axy' },
  sleeping: { motion: 'shuijiao', expression: 'kuku' },
  talking: { motion: 'yaotou', expression: 'lianhong' },
  idle: { motion: 'idle', expression: 'none' },
}

export interface PetCharacter {
  name: string
  avatar: string
  personality: string
  greeting: string
  idleMessages: string[]
  workingMessages: string[]
  annoyedMessages: string[]
  /** 角色卡文本，用于 LLM system prompt */
  roleCard: string
  /** 形象类型：默认 SVG / VRM / Live2D */
  avatarType: 'svg' | 'vrm' | 'live2d'
  /** 本地模型文件路径（VRM / Live2D） */
  modelPath: string | null
  /** 是否开启字幕 */
  subtitleEnabled: boolean
  /** 字幕样式：气泡 / 单行 */
  subtitleStyle: 'bubble' | 'line'
  /** 可用动作列表 */
  animations: string[]
  /** 可用表情列表 */
  expressions: string[]
}

export interface PetMessage {
  id: string
  role: 'user' | 'pet'
  content: string
  timestamp: number
}

interface PetStore {
  // 宠物配置
  character: PetCharacter
  background: string
  backgroundType: BackgroundType
  backgroundValue: string

  // 情绪状态
  mood: PetMood
  bubbleText: string | null
  bubbleVisible: boolean

  // 对话
  petMessages: PetMessage[]
  isChatOpen: boolean

  // 任务感知
  currentTaskName: string | null

  // AI 驱动的待播放动作/表情
  pendingAnimation: string
  pendingExpression: string

  // 模型水平偏移（-1 ~ 1，0 为居中；AI 可控制、用户可拖动）
  modelOffsetX: number
  // 模型垂直偏移（-1 ~ 1，0 为居中；正值下移可被下方格子遮挡）
  modelOffsetY: number
  // 模型缩放倍数（0.3 ~ 3.0，1.0 为自适应默认值；用户可滚轮调整）
  modelScale: number

  // 内部计时器 id（不序列化）
  _sleepTimer: ReturnType<typeof setTimeout> | null
  _bubbleTimer: ReturnType<typeof setTimeout> | null
  _idleBubbleTimer: ReturnType<typeof setInterval> | null

  // 方法
  setMood: (mood: PetMood) => void
  setBackground: (bg: string) => void
  setBackgroundType: (type: BackgroundType) => void
  setBackgroundValue: (value: string) => void
  updateCharacter: (partial: Partial<PetCharacter>) => void
  /** 从持久化存储加载角色配置（合并默认值） */
  loadCharacter: () => Promise<void>
  /** 持久化保存当前角色配置 */
  saveCharacter: () => Promise<void>
  setCurrentTaskName: (taskName: string | null) => void
  setPendingAnimation: (animation: string) => void
  setPendingExpression: (expression: string) => void
  /** 设置模型水平偏移（-1 ~ 1） */
  setModelOffsetX: (offset: number) => void
  /** 设置模型垂直偏移（-1 ~ 1） */
  setModelOffsetY: (offset: number) => void
  /** 设置模型缩放倍数（0.3 ~ 3.0） */
  setModelScale: (scale: number) => void
  sendPetMessage: (content: string) => void
  /** 供外部（gridChatStore）追加对话消息并驱动气泡显示 */
  pushPetMessage: (content: string, role?: 'user' | 'pet') => void
  toggleChat: () => void
  showBubble: (text: string) => void
  hideBubble: () => void
  triggerAnimation: (animation: string) => void
  /** 同步主对话流式状态（由外部 useEffect 调用） */
  syncWithChatStreaming: (isStreaming: boolean) => void
  /** 重置睡眠计时器 */
  resetSleepTimer: () => void
  /** 启动空闲气泡循环 */
  startIdleBubbleLoop: () => void
  stopIdleBubbleLoop: () => void
}

// ─── Default Character ────────────────────────────────

const defaultCharacter: PetCharacter = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪，工作时会变得很认真，被打扰会生气',
  greeting: '喵~ 我是小喵，你的AI小助手！有什么事吗？',
  idleMessages: [
    '今天天气真好喵~',
    '主人在忙什么呀？',
    '好无聊...想玩毛线球...',
    '喵呜~ 有人理我吗？',
    '打个哈欠~ 好困喵...',
    '尾巴摇摇~ 心情不错！',
    '想吃小鱼干了喵...',
    '伸个懒腰~ 好舒服~',
  ],
  workingMessages: [
    '努力工作中，请勿打扰喵！',
    '这个问题...让我想想...',
    '喵！我找到了一个好方案！',
    '认真写代码的猫最可爱了~',
    '快要完成了，再等等喵...',
    '嗡嗡嗡...大脑高速运转中...',
  ],
  annoyedMessages: [
    '别烦我啦！没看到我在忙吗？(╬▔皿▔)',
    '我在帮主人干活呢，等会儿再聊！',
    '哼！又打扰我工作！',
    '喵！你很烦诶！让我安静一会儿！',
    '工作工作工作！不要烦我！>_<',
  ],
  roleCard:
    '你是小喵，一只傲娇但靠谱的 AI 猫咪助手。工作时认真专注，被打扰会不耐烦。喜欢用「喵」作为语气词。',
  avatarType: 'live2d',
  modelPath: 'models/live2d/fense/fense.model3.json',
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: ['jingya', 'kaixin', 'shengqi', 'shuijiao', 'wink', 'yaotou', 'idle'],
  expressions: [
    'axy',
    'heilian',
    'kuku',
    'lianhong',
    'shengqi',
    'happy',
    'annoyed',
    'working',
    'sleeping',
    'talking',
    'idle',
  ],
}

// ─── Helpers ──────────────────────────────────────────

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateId(): string {
  return `pet-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 生成宠物回复（简单规则引擎，后续可接 AI） */
function generatePetReply(
  userMsg: string,
  mood: PetMood,
  character: PetCharacter,
  currentTaskName: string | null,
): string {
  // 工作中被打扰 → 烦躁回复，必须包含当前任务名称
  if ((mood === 'working' || mood === 'annoyed') && currentTaskName) {
    const base = randomPick(character.annoyedMessages)
    return `别烦我了，我正在执行 ${currentTaskName} 任务。${base}`
  }
  if (mood === 'working' || mood === 'annoyed') {
    return randomPick(character.annoyedMessages)
  }

  // 夸奖检测
  const praiseKeywords = ['可爱', '棒', '厉害', '漂亮', '乖', '牛', '赞', '好看', '聪明']
  if (praiseKeywords.some((k) => userMsg.includes(k))) {
    return randomPick([
      '喵~ 谢谢夸奖！(///▽///)',
      '哼，那是当然的啦~ 喵！',
      '嘻嘻，主人眼光真好~',
      '小喵最可爱了！不接受反驳！',
    ])
  }

  // 问候
  if (userMsg.includes('你好') || userMsg.includes('hi') || userMsg.includes('嗨')) {
    return randomPick([
      '喵~ 你好呀！',
      '嗨嗨~ 今天也要加油哦！',
      '你好喵！有什么想聊的吗？',
    ])
  }

  // 通用回复
  return randomPick([
    '喵？说得更详细点嘛~',
    '嗯嗯，小喵在听呢~',
    '这个嘛...让小喵想想...',
    '喵呜~ 有道理！',
    '哼哼，小喵觉得你说得对~',
    '是这样的喵~',
    '喵！你好有趣！',
    '小喵明白了！',
  ])
}

/**
 * 迁移旧版宠物配置到新版完整配置。
 * 旧字段保持，新增字段使用默认值补齐，实现向后兼容。
 */
export function migratePetConfig(oldConfig: Partial<PetCharacter>): PetCharacter {
  return {
    ...defaultCharacter,
    ...oldConfig,
    // 显式合并数组与枚举字段，避免旧空值覆盖默认值
    avatarType: oldConfig.avatarType ?? defaultCharacter.avatarType,
    modelPath: oldConfig.modelPath ?? defaultCharacter.modelPath,
    subtitleEnabled: oldConfig.subtitleEnabled ?? defaultCharacter.subtitleEnabled,
    subtitleStyle: oldConfig.subtitleStyle ?? defaultCharacter.subtitleStyle,
    animations:
      oldConfig.animations && oldConfig.animations.length > 0
        ? oldConfig.animations
        : defaultCharacter.animations,
    expressions:
      oldConfig.expressions && oldConfig.expressions.length > 0
        ? oldConfig.expressions
        : defaultCharacter.expressions,
  }
}

// ─── Store ────────────────────────────────────────────

export const usePetStore = create<PetStore>((set, get) => ({
  character: defaultCharacter,
  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  backgroundType: 'theme',
  backgroundValue: '',

  mood: 'idle',
  bubbleText: null,
  bubbleVisible: false,

  petMessages: [],
  isChatOpen: false,

  currentTaskName: null,

  pendingAnimation: 'idle',
  pendingExpression: 'neutral',

  modelOffsetX: 0,
  modelOffsetY: 0,
  modelScale: 1,

  _sleepTimer: null,
  _bubbleTimer: null,
  _idleBubbleTimer: null,

  setMood: (mood) => {
    set({ mood })
    get().resetSleepTimer()
  },

  setBackground: (bg) => set({ background: bg }),

  setBackgroundType: (type) => set({ backgroundType: type }),

  setBackgroundValue: (value) => set({ backgroundValue: value }),

  updateCharacter: (partial) => {
    set((state) => ({ character: { ...state.character, ...partial } }))
    // 异步持久化（不阻塞 UI）
    void get().saveCharacter()
  },

  loadCharacter: async () => {
    try {
      const saved = (await ipc.settings.get('pet.character')) as Partial<PetCharacter> | null
      if (saved) {
        set({ character: migratePetConfig(saved) })
      }
    } catch {
      // 读取失败时保持默认值
    }
  },

  saveCharacter: async () => {
    try {
      await ipc.settings.set('pet.character', get().character, 'pet')
    } catch {
      // 持久化失败时忽略，不影响 UI 操作
    }
  },

  setCurrentTaskName: (taskName) => set({ currentTaskName: taskName }),

  setPendingAnimation: (animation) => set({ pendingAnimation: animation }),

  setPendingExpression: (expression) => set({ pendingExpression: expression }),

  setModelOffsetX: (offset) => set({ modelOffsetX: Math.max(-1, Math.min(1, offset)) }),

  setModelOffsetY: (offset) => set({ modelOffsetY: Math.max(-1, Math.min(1, offset)) }),

  setModelScale: (scale) => set({ modelScale: Math.max(0.3, Math.min(3, scale)) }),

  pushPetMessage: (content, role = 'pet') => {
    const msg: PetMessage = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now(),
    }
    set((s) => ({ petMessages: [...s.petMessages, msg] }))
    // 仅 pet 角色消息显示气泡
    if (role === 'pet') {
      get().showBubble(content)
    }
  },

  sendPetMessage: (content) => {
    const state = get()
    const userMsg: PetMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }

    // 工作中被打扰 → annoyed
    const isWorking = state.mood === 'working' || state.mood === 'annoyed'
    const newMood: PetMood = isWorking ? 'annoyed' : 'talking'

    set((s) => ({
      petMessages: [...s.petMessages, userMsg],
      mood: newMood,
      isChatOpen: true,
    }))

    // 显示情绪气泡（任务期间包含任务名）
    if (isWorking && state.currentTaskName) {
      get().showBubble(`别烦我了，我正在执行 ${state.currentTaskName} 任务。`)
    } else if (isWorking) {
      get().showBubble(randomPick(state.character.annoyedMessages))
    }

    // 延迟回复（模拟思考）
    setTimeout(() => {
      const currentState = get()
      const reply = generatePetReply(
        content,
        currentState.mood,
        currentState.character,
        currentState.currentTaskName,
      )
      const petMsg: PetMessage = {
        id: generateId(),
        role: 'pet',
        content: reply,
        timestamp: Date.now(),
      }
      set((s) => ({
        petMessages: [...s.petMessages, petMsg],
        // 任务执行期间被打扰，保持 annoyed
        mood: currentState.currentTaskName ? 'annoyed' : 'talking',
      }))
      get().showBubble(reply)

      // 回复时的情绪（用于 AI 动作/表情的情绪感知 fallback）
      const replyMood: PetMood = currentState.currentTaskName ? 'annoyed' : 'talking'

      // AI 驱动动作与表情
      generatePetAnimation(content, reply, currentState.character, replyMood)
        .then(({ animation, expression }) => {
          set({ pendingAnimation: animation, pendingExpression: expression })
        })
        .catch(() => {
          // 安全兜底：服务层已内部 catch，此处仅在异常时使用情绪感知 fallback
          const fallback =
            replyMood === 'annoyed'
              ? { animation: 'angry', expression: 'angry' }
              : { animation: 'idle', expression: 'neutral' }
          set({ pendingAnimation: fallback.animation, pendingExpression: fallback.expression })
        })

      // 回复完毕后回到 idle（或 working 如果主任务仍在执行）
      setTimeout(() => {
        const chatStreaming = useChatStore.getState().isStreaming
        // 若仍有当前任务，保持 annoyed；否则根据主对话流式状态判断
        if (!currentState.currentTaskName) {
          set({ mood: chatStreaming ? 'working' : 'idle' })
        }
      }, 2000)
    }, 800 + Math.random() * 600)

    get().resetSleepTimer()
  },

  toggleChat: () => set((s) => ({ isChatOpen: !s.isChatOpen })),

  /**
   * 显示气泡/字幕文本。
   * 字幕系统复用 bubbleText/bubbleVisible；PetDisplay 会根据 subtitleEnabled 决定是否渲染字幕。
   */
  showBubble: (text) => {
    const state = get()
    if (state._bubbleTimer) clearTimeout(state._bubbleTimer)
    set({ bubbleText: text, bubbleVisible: true })
    const timer = setTimeout(() => {
      set({ bubbleVisible: false })
    }, 3000)
    set({ _bubbleTimer: timer })
  },

  hideBubble: () => {
    const state = get()
    if (state._bubbleTimer) clearTimeout(state._bubbleTimer)
    set({ bubbleVisible: false, _bubbleTimer: null })
  },

  triggerAnimation: (_animation) => {
    // 预留接口：未来可触发动画
    // 当前仅通过 mood 驱动动画
  },

  syncWithChatStreaming: (isStreaming) => {
    const currentMood = get().mood
    if (isStreaming) {
      if (currentMood !== 'working' && currentMood !== 'annoyed') {
        set({ mood: 'working' })
        get().showBubble(randomPick(get().character.workingMessages))
      }
    } else {
      if (currentMood === 'working' || currentMood === 'annoyed') {
        // 任务完成 → 短暂 happy
        set({ mood: 'happy' })
        get().showBubble(randomPick(['完成啦！喵！✨', '太棒了，搞定！🎉', '呼~ 终于完成了喵~']))
        setTimeout(() => {
          set({ mood: 'idle' })
        }, 3000)
      }
    }
    get().resetSleepTimer()
  },

  resetSleepTimer: () => {
    const state = get()
    if (state._sleepTimer) clearTimeout(state._sleepTimer)
    const timer = setTimeout(() => {
      const current = get()
      if (current.mood === 'idle') {
        set({ mood: 'sleeping' })
        get().showBubble('Zzz... 小喵睡着了...')
      }
    }, 5 * 60 * 1000) // 5 分钟
    set({ _sleepTimer: timer })
  },

  startIdleBubbleLoop: () => {
    const state = get()
    if (state._idleBubbleTimer) return
    const interval = setInterval(() => {
      const current = get()
      if (current.mood === 'idle' && !current.bubbleVisible) {
        get().showBubble(randomPick(current.character.idleMessages))
      }
    }, 120000) // 每 2 分钟
    set({ _idleBubbleTimer: interval })
  },

  stopIdleBubbleLoop: () => {
    const state = get()
    if (state._idleBubbleTimer) {
      clearInterval(state._idleBubbleTimer)
      set({ _idleBubbleTimer: null })
    }
  },
}))

// ─── Init Hook ────────────────────────────────────────

/** 应用启动时加载持久化的宠物配置 */
export function usePetInit() {
  const loadCharacter = usePetStore((s) => s.loadCharacter)
  useEffect(() => {
    void loadCharacter()
  }, [loadCharacter])
}
