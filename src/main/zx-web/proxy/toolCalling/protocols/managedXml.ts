// @ts-nocheck
import type { ToolProtocolAdapter } from './base.ts'
import type { ToolParseContext } from '../types.ts'
import {
  addParameter,
  buildToolCall,
  createParseResult,
  detectMarkers,
  escapeXmlAttribute,
  parseJsonValue,
  renderToolList,
  stripFencedCodeBlocks,
  toolNames,
} from './shared.ts'

const ZX_WEB_START = '<|ZX-WEB|tool_calls>'
const ZX_WEB_END = '</|ZX-WEB|tool_calls>'
const XML_START = '<tool_calls>'

export const managedXmlProtocol: ToolProtocolAdapter = {
  id: 'managed_xml',

  renderPrompt(tools) {
    return `## Available Tools
You can invoke the following developer tools. Tool names are case-sensitive.
Use only the exact tool names listed below. Do not rename, camelCase, translate, shorten, or invent tool names.

${renderToolList(tools)}

When calling tools, respond with only this ZxWeb XML block:

<|ZX-WEB|tool_calls><|ZX-WEB|invoke name="exact_tool_name"><|ZX-WEB|parameter name="argument"><![CDATA[value]]></|ZX-WEB|parameter></|ZX-WEB|invoke></|ZX-WEB|tool_calls>

Tool results will be provided as ZxWeb XML result blocks:

<|ZX-WEB|tool_result tool_call_id="call_id"><![CDATA[result]]></|ZX-WEB|tool_result>`
  },

  detectStart(buffer) {
    return detectMarkers(buffer, [ZX_WEB_START, XML_START])
  },

  parse(content: string, context: ToolParseContext) {
    const parseable = stripFencedCodeBlocks(content)
    const allowedNames = toolNames(context.tools)
    const rawMatches: string[] = []
    const invalidToolNames: string[] = []
    const toolCalls = []

    parseBlocks(parseable, {
      blockPattern: /<\|ZX-WEB\|tool_calls>([\s\S]*?)<\/\|ZX-WEB\|tool_calls>/g,
      invokePattern: /<\|ZX-WEB\|invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/\|ZX-WEB\|invoke>/g,
      parameterPattern: /<\|ZX-WEB\|parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\/\|ZX-WEB\|parameter>/g,
      rawMatches,
      invalidToolNames,
      allowedNames,
      toolCalls,
    })

    parseBlocks(parseable, {
      blockPattern: /<tool_calls>([\s\S]*?)<\/tool_calls>/g,
      invokePattern: /<invoke\s+name="([^"]+)"\s*>([\s\S]*?)<\/invoke>/g,
      parameterPattern: /<parameter\s+name="([^"]+)"\s*>([\s\S]*?)<\/parameter>/g,
      rawMatches,
      invalidToolNames,
      allowedNames,
      toolCalls,
    })

    if (toolCalls.length === 0) {
      return createParseResult({
        content,
        toolCalls,
        protocol: rawMatches.length > 0 ? 'managed_xml' : 'unknown',
        rawMatches,
        invalidToolNames,
      })
    }

    const cleanContent = rawMatches.reduce((acc, raw) => acc.replace(raw, ''), parseable).trim()
    return createParseResult({
      content: cleanContent,
      toolCalls,
      protocol: 'managed_xml',
      rawMatches,
      invalidToolNames,
    })
  },

  formatAssistantToolCalls(calls) {
    const invokes = calls.map((call) => {
      const args = safeParseObject(call.arguments)
      const params = Object.entries(args)
        .map(([name, value]) => {
          const text = typeof value === 'string' ? value : JSON.stringify(value)
          return `<|ZX-WEB|parameter name="${escapeXmlAttribute(name)}"><![CDATA[${text}]]></|ZX-WEB|parameter>`
        })
        .join('')
      return `<|ZX-WEB|invoke name="${escapeXmlAttribute(call.name)}">${params}</|ZX-WEB|invoke>`
    })
    return `${ZX_WEB_START}${invokes.join('')}${ZX_WEB_END}`
  },

  formatToolResult(result) {
    return `<|ZX-WEB|tool_result tool_call_id="${escapeXmlAttribute(result.toolCallId)}"><![CDATA[${result.content}]]></|ZX-WEB|tool_result>`
  },
}

interface ParseBlockOptions {
  blockPattern: RegExp
  invokePattern: RegExp
  parameterPattern: RegExp
  rawMatches: string[]
  invalidToolNames: string[]
  allowedNames: Set<string>
  toolCalls: ReturnType<typeof buildToolCall>[]
}

function parseBlocks(content: string, options: ParseBlockOptions): void {
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = options.blockPattern.exec(content)) !== null) {
    options.rawMatches.push(blockMatch[0])
    let invokeMatch: RegExpExecArray | null

    while ((invokeMatch = options.invokePattern.exec(blockMatch[1])) !== null) {
      const name = invokeMatch[1].trim()
      if (!options.allowedNames.has(name)) {
        options.invalidToolNames.push(name)
        continue
      }

      const args: Record<string, unknown> = {}
      let parameterMatch: RegExpExecArray | null
      options.parameterPattern.lastIndex = 0
      while ((parameterMatch = options.parameterPattern.exec(invokeMatch[2])) !== null) {
        addParameter(args, parameterMatch[1].trim(), parseJsonValue(parameterMatch[2]))
      }

      options.toolCalls.push(
        buildToolCall(`call_${options.toolCalls.length}`, options.toolCalls.length, name, JSON.stringify(args), invokeMatch[0]),
      )
    }
  }
}

function safeParseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
