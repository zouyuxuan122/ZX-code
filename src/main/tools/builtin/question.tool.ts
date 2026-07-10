import type { BuiltinTool, ToolExecutionResult, QuestionItem } from '@shared/types/tool'

/**
 * question 工具：让 AI 在执行任务期间向用户提问
 *
 * 使用场景：收集偏好/需求、澄清模糊指令、获取实现决策、提供方向选择
 *
 * 交互流程：
 * 1. AI 调用 question 工具，传入问题列表
 * 2. 工具通过 context.onQuestion 回调向用户展示问题卡片
 * 3. 用户在输入框上方的卡片中选择选项或输入自定义答案
 * 4. 答案返回给 AI，继续执行
 */
export const questionTool: BuiltinTool = {
  name: 'question',
  description: `向用户提问以获取澄清、偏好或决策。当需要收集用户需求、澄清模糊指令、获取实现决策时使用。
每个问题包含：
- question: 完整问题描述
- header: 极短标签（≤30字符）
- options: 选项列表（每个含 label 和 description）
- multiple: 是否允许多选（默认 false）
- custom: 是否允许用户输入自定义答案（默认 true）
若推荐某选项，将其放首位并在 label 末尾加 "(推荐)"。
不要包含 "其他" 或万能选项，custom 开启时会自动添加自定义输入。`,
  parameters: {
    questions: {
      type: 'array',
      description: '问题列表',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '完整问题描述' },
          header: { type: 'string', description: '极短标签（≤30字符）' },
          options: {
            type: 'array',
            description: '选项列表',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '选项标签（1-5词）' },
                description: { type: 'string', description: '选项解释' },
              },
              required: ['label', 'description'],
            },
          },
          multiple: { type: 'boolean', description: '是否允许多选' },
          custom: { type: 'boolean', description: '是否允许自定义输入（默认 true）' },
        },
        required: ['question', 'header', 'options'],
      },
    },
  },
  required: ['questions'],
  requiredPermissions: [],
  async execute(args, context): Promise<ToolExecutionResult> {
    const questions = args.questions as QuestionItem[]

    if (!Array.isArray(questions) || questions.length === 0) {
      return {
        tool_call_id: '',
        content: '参数 questions 必须为非空数组',
        is_error: true,
      }
    }

    // 规范化：custom 默认 true
    const normalizedQuestions = questions.map((q) => ({
      question: q.question,
      header: q.header,
      options: q.options,
      multiple: q.multiple ?? false,
      custom: q.custom ?? true,
    }))

    if (!context.onQuestion) {
      return {
        tool_call_id: '',
        content: '当前环境不支持提问交互',
        is_error: true,
      }
    }

    try {
      const answers = await context.onQuestion(normalizedQuestions)
      // 格式化答案为可读文本
      const answerTexts = normalizedQuestions.map((q, i) => {
        const ans = answers[i] || []
        return `"${q.question}" = ${ans.join(', ')}`
      })
      return {
        tool_call_id: '',
        content: `用户已回答: ${answerTexts.join('; ')}`,
        is_error: false,
      }
    } catch (err) {
      return {
        tool_call_id: '',
        content: `提问失败: ${(err as Error).message}`,
        is_error: true,
      }
    }
  },
}
