import { ipc } from './ipc'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { parseModelName } from '@/components/chat/ModelSelector'
import type { PetCharacter, PetMood } from '@/stores/petStore'
import type { ChatParams } from '@shared/types/model'

const FALLBACK_ANIMATION = 'idle'
const FALLBACK_EXPRESSION = 'neutral'

export interface PetAnimationResult {
  animation: string
  expression: string
}

function pickModel(): string | null {
  // 优先使用 UI store 选中的模型（复合键 provider:name），解析为纯 API 模型名。
  // chatStore.currentConversation.model / availableModels[].id 可能是数据库内部 ID，
  // 直接传给 provider 会触发 HTTP 400（模型名不合法）。
  const selected = useUIStore.getState().selectedModel
  if (selected) return parseModelName(selected)
  const chatState = useChatStore.getState()
  // 后备：主对话的模型（主对话场景下可能为合法模型名）
  if (chatState.currentConversation?.model) return chatState.currentConversation.model
  if (chatState.availableModels[0]?.id) return chatState.availableModels[0].id
  return null
}

function buildSystemPrompt(character: PetCharacter): string {
  return `${character.roleCard}

你是该角色的动作与表情导演。请根据下面的「用户消息」和「角色回复」，从可用动作和表情列表中各选择一个最合适的值。

可用动作：${character.animations.join(', ')}
可用表情：${character.expressions.join(', ')}

要求：
1. 仅返回 JSON 对象，不要有任何解释、注释或 markdown 代码块。
2. JSON 格式固定为：{"animation": "...", "expression": "..."}
3. animation 必须是「可用动作」之一，expression 必须是「可用表情」之一。
4. 如果无法判断，返回 {"animation": "${FALLBACK_ANIMATION}", "expression": "${FALLBACK_EXPRESSION}"}`
}

/**
 * 基于情绪的 fallback 映射。
 * 当 LLM 调用失败或返回无效值时，根据当前宠物情绪选择最合适的动作与表情。
 * 映射值必须存在于角色的可用列表中，否则退回 idle/neutral。
 */
const MOOD_FALLBACK_MAP: Record<PetMood, { animation: string; expression: string }> = {
  annoyed: { animation: 'angry', expression: 'angry' },
  happy: { animation: 'wave', expression: 'happy' },
  sleeping: { animation: 'sleep', expression: 'sleepy' },
  working: { animation: 'idle', expression: 'neutral' },
  talking: { animation: 'idle', expression: 'neutral' },
  idle: { animation: 'idle', expression: 'neutral' },
}

function getFallback(mood: PetMood | undefined, character: PetCharacter): PetAnimationResult {
  if (!mood) {
    return { animation: FALLBACK_ANIMATION, expression: FALLBACK_EXPRESSION }
  }
  const mapped = MOOD_FALLBACK_MAP[mood]
  const animation =
    mapped && character.animations.includes(mapped.animation)
      ? mapped.animation
      : FALLBACK_ANIMATION
  const expression =
    mapped && character.expressions.includes(mapped.expression)
      ? mapped.expression
      : FALLBACK_EXPRESSION
  return { animation, expression }
}

function parseResult(
  content: string,
  character: PetCharacter,
  mood: PetMood | undefined,
): PetAnimationResult {
  const fallback = getFallback(mood, character)
  try {
    // 剥离 markdown 代码块包裹，提取首个 JSON 对象
    let text = content.trim()
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) text = fenceMatch[1].trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) text = text.slice(start, end + 1)
    const raw = JSON.parse(text) as Partial<PetAnimationResult>
    const animation =
      typeof raw.animation === 'string' && character.animations.includes(raw.animation)
        ? raw.animation
        : fallback.animation
    const expression =
      typeof raw.expression === 'string' && character.expressions.includes(raw.expression)
        ? raw.expression
        : fallback.expression
    return { animation, expression }
  } catch {
    return fallback
  }
}

/**
 * 使用当前已配置的对话模型，根据用户消息与宠物回复生成动作与表情。
 * 解析失败或返回无效值时自动 fallback：若传入 mood 则使用情绪感知映射，否则 idle/neutral。
 */
export async function generatePetAnimation(
  userMessage: string,
  petReply: string,
  character: PetCharacter,
  mood?: PetMood,
): Promise<PetAnimationResult> {
  const model = pickModel()
  if (!model) {
    return getFallback(mood, character)
  }

  const params: ChatParams = {
    model,
    messages: [
      { role: 'system', content: buildSystemPrompt(character) },
      {
        role: 'user',
        content: `用户消息：${userMessage}\n角色回复：${petReply}`,
      },
    ],
    temperature: 0.3,
    // DeepSeek 等推理模型会消耗大量 token 用于"思考"，
    // max_tokens 过小会导致思考完毕后无 token 输出实际内容。
    max_tokens: 1024,
    stream: false,
  }

  try {
    const result = await ipc.provider.complete(params)
    if (!result.ok || !result.content) {
      return getFallback(mood, character)
    }
    return parseResult(result.content, character, mood)
  } catch {
    return getFallback(mood, character)
  }
}
