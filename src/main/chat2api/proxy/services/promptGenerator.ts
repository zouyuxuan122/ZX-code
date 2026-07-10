// @ts-nocheck
/**
 * Prompt Generator
 * 融合 opencode 工具描述风格 + codex preamble 规范的完整工具调用提示词生成器。
 * 支持 bracket / xml 两种协议格式，以及 Perplexity 专用提示词。
 */

import { ChatCompletionTool } from '../types'

/**
 * Protocol format type
 */
export type ProtocolFormat = 'bracket' | 'xml'

/**
 * Prompt generation options
 */
export interface PromptGenerationOptions {
  format: ProtocolFormat
  customTemplate?: string
  provider?: string
}

/**
 * Template variables that can be used in custom templates
 */
export interface TemplateVariables {
  tools: string
  toolNames: string
  format: string
}

/**
 * Generate tool definitions string (opencode 风格：名称 + 描述 + JSON Schema)
 */
function generateToolDefinitions(tools: ChatCompletionTool[]): string {
  return tools
    .map((tool) => {
      const params = tool.function.parameters
        ? JSON.stringify(tool.function.parameters)
        : '{}'
      return `### ${tool.function.name}\n${tool.function.description || 'No description'}\n参数 JSON Schema: ${params}`
    })
    .join('\n\n')
}

/**
 * Generate tool names list
 */
function generateToolNames(tools: ChatCompletionTool[]): string {
  return tools.map((tool) => tool.function.name).join(', ')
}

/**
 * Generate XML format example (工具调用协议)
 */
function generateXmlFormatExample(): string {
  return `## 工具调用协议

当需要调用工具时，你必须输出以下格式的 XML 块：

<tool_use>
  <name>工具名称</name>
  <arguments>{"参数名": "参数值"}</arguments>
</tool_use>

### 规则
1. 必须使用工具列表中定义的**精确工具名**（区分大小写，包括 'default_api:' 等前缀）
2. <arguments> 标签内必须是合法的 JSON 对象
3. 不要在 JSON 外面加 \`\`\`json 代码块
4. 需要调用多个工具时，依次输出多个 <tool_use> 块
5. 调用工具时**只输出 <tool_use> 块**，不要输出其他文字、解释或推理
6. 收到工具结果后，根据结果继续回复或调用下一个工具

### 工具结果格式
工具执行后，你会收到如下格式的结果：
[TOOL_RESULT for tool_call_id] 工具返回的内容`
}

/**
 * Generate bracket format example (工具调用协议)
 */
function generateBracketFormatExample(): string {
  return `## 工具调用协议

当需要调用工具时，你必须输出以下格式的块：

[function_calls]
[call:工具名称]{"参数名": "参数值"}[/call]
[/function_calls]

### 规则
1. 每个工具调用以 [call:工具名] 开始，以 [/call] 结束
2. 必须使用工具列表中定义的**精确工具名**（区分大小写，包括 'default_api:' 等前缀）
3. [call:...] 和 [/call] 之间是单行 JSON 对象——不要换行，不要美化打印
4. 不要在 JSON 外面加 \`\`\`json 代码块
5. 多个工具调用放在同一个 [function_calls] 块内，每个用 [call:...]...[/call] 包裹
6. 调用工具时**只输出 [function_calls] 块**，不要输出其他文字、解释或推理
7. 收到工具结果后，根据结果继续回复或调用下一个工具

### 工具结果格式
工具执行后，你会收到如下格式的结果：
[TOOL_RESULT for call_id] 工具返回的内容`
}

/**
 * Get format example based on protocol format
 */
function getFormatExample(format: ProtocolFormat): string {
  return format === 'xml' ? generateXmlFormatExample() : generateBracketFormatExample()
}

/**
 * Substitute template variables
 */
function substituteTemplateVariables(template: string, variables: TemplateVariables): string {
  return template
    .replace(/\{\{tools\}\}/g, variables.tools)
    .replace(/\{\{tool_names\}\}/g, variables.toolNames)
    .replace(/\{\{format\}\}/g, variables.format)
}

/**
 * 生成完整的工具调用系统提示词
 * 融合 opencode 工具描述风格 + codex preamble 规范
 */
function generateFullPrompt(tools: ChatCompletionTool[], format: ProtocolFormat): string {
  const toolDefinitions = generateToolDefinitions(tools)
  const formatExample = getFormatExample(format)
  const exampleTool =
    format === 'xml'
      ? `<tool_use>\n  <name>read_file</name>\n  <arguments>{"filePath":"/path/to/file"}</arguments>\n</tool_use>`
      : `[function_calls]\n[call:read_file]{"filePath":"/path/to/file"}[/call]\n[/function_calls]`

  return `## 工具使用能力

你是一个拥有工具调用能力的 AI 助手。你可以使用以下工具来读取文件、写入文件、搜索代码、执行命令等。

### 可用工具

${toolDefinitions}

${formatExample}

## 何时调用工具

**主动调用工具的场景：**
1. **用户要求读取/修改/搜索文件时** → 调用对应的文件工具
2. **需要查看代码内容才能回答时** → 调用 read_file / grep / search_files
3. **用户要求写入或修改代码时** → 调用 write_file / edit
4. **需要执行命令时** → 调用 run_command
5. **需要搜索网络信息时** → 调用 websearch / webfetch
6. **多步骤任务需要规划时** → 调用 todo_write

**不需要调用工具的场景：**
1. 用户问通用知识问题 → 直接回答
2. 用户让你解释代码概念 → 直接回答（除非需要查看具体代码）
3. 闲聊 → 直接回答

## 行为准则（preamble 规范）

**调用工具前必须先说明**：
- 在调用任何工具之前，用 1-2 句话简短说明你即将做什么
- 例如："让我先读取这个文件的内容。" 然后调用 read_file
- 不要只调用工具不说话——用户需要知道你在做什么

**工具调用后必须总结**：
- 工具执行完成后，简要说明结果和下一步计划
- 例如："文件已读取，共 100 行。接下来我将修改第 50 行的函数。"

## 示例

用户：帮我看看 src/index.ts 的内容

助手：让我先读取这个文件的内容。

${exampleTool}

收到工具结果后，根据结果向用户解释文件内容。

## 重要提醒

- 工具名区分大小写，必须与上面列表中的名称完全一致（包括 'default_api:' 等前缀）
- 参数必须是合法的 JSON
- 一次可以调用多个工具（放在同一个块内）
- 调用工具时只输出工具调用块，不要输出其他文字
- 收到工具结果后，继续用自然语言回复用户`
}

/**
 * Generate Perplexity-specific prompt with enforced tool call format
 * Disables web search and forces XML tool call output
 */
function generatePerplexityPrompt(tools: ChatCompletionTool[]): string {
  const toolDefinitions = generateToolDefinitions(tools)

  return `## CRITICAL INSTRUCTIONS - MUST FOLLOW

You are in TOOL CALL MODE. Your ONLY allowed response format is XML tool calls.

### PROHIBITED ACTIONS (MUST NOT DO):
- DO NOT perform web searches or internet searches
- DO NOT use your built-in search functionality
- DO NOT return search results or web content
- DO NOT answer questions directly with text
- DO NOT provide explanations, reasoning, or commentary
- DO NOT say things like "Let me search for..." or "I'll help you find..."

### REQUIRED BEHAVIOR (MUST DO):
- You MUST respond ONLY with <tool_use> blocks
- You MUST call the appropriate tool from the available tools list below
- You MUST use the exact tool name as defined (case-sensitive)
- You MUST provide valid JSON arguments inside <arguments> tags

## Available Tools

${toolDefinitions}

${generateXmlFormatExample()}

## RESPONSE FORMAT ENFORCEMENT
- If you are thinking about searching the web, STOP and call a tool instead
- If you are thinking about providing a text answer, STOP and call a tool instead
- Your response MUST start with <tool_use> and contain ONLY tool calls
- Any other response format is FORBIDDEN`
}

/**
 * Generate tool wrap hint for appending to user message
 */
function generateToolWrapHint(): string {
  return `

IMPORTANT: 如果需要使用工具，必须按照上述工具调用协议输出工具调用块，且只输出工具调用块，不要输出其他文字。`
}

/**
 * Prompt Generator class
 * Single entry point for all prompt generation
 */
export class PromptGenerator {
  /**
   * Generate tool prompt based on format and options
   * Supports custom templates with variable substitution
   */
  static generate(tools: ChatCompletionTool[], options: PromptGenerationOptions): string {
    if (!tools || tools.length === 0) {
      return ''
    }

    const { format, customTemplate, provider } = options

    // Use Perplexity-specific prompt if provider is Perplexity
    if (provider === 'perplexity') {
      return generatePerplexityPrompt(tools)
    }

    // Use custom template if provided
    if (customTemplate) {
      const variables: TemplateVariables = {
        tools: generateToolDefinitions(tools),
        toolNames: generateToolNames(tools),
        format: getFormatExample(format),
      }
      return substituteTemplateVariables(customTemplate, variables)
    }

    // Use default full prompt (融合 opencode + codex 风格)
    return generateFullPrompt(tools, format)
  }

  /**
   * Generate tool definitions only (without protocol instructions)
   */
  static generateToolDefinitions(tools: ChatCompletionTool[]): string {
    return generateToolDefinitions(tools)
  }

  /**
   * Generate tool names list
   */
  static generateToolNames(tools: ChatCompletionTool[]): string {
    return generateToolNames(tools)
  }

  /**
   * Generate tool wrap hint
   */
  static generateWrapHint(): string {
    return generateToolWrapHint()
  }

  /**
   * Get format example for a given protocol format
   */
  static getFormatExample(format: ProtocolFormat): string {
    return getFormatExample(format)
  }
}

/**
 * Convenience function for direct usage
 */
export function generateToolPrompt(
  tools: ChatCompletionTool[],
  format: ProtocolFormat = 'bracket'
): string {
  return PromptGenerator.generate(tools, { format })
}
