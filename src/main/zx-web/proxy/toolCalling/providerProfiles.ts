// @ts-nocheck
import type { NormalizedToolResult, ToolProtocolId } from './types.ts'
import { managedXmlProtocol } from './protocols/managedXml.ts'

export interface ProviderToolProfile {
  providerId: 'deepseek' | 'kimi' | 'glm' | 'qwen' | string
  managedSupport: boolean
  supportsNativeTools: boolean
  preferredManagedProtocol: ToolProtocolId
  formatAssistantToolCalls(calls: Array<{ id: string; name: string; arguments: string }>): string
  formatToolResult(result: NormalizedToolResult): string
}

const zxWebXmlHistoryProfile: Omit<ProviderToolProfile, 'providerId'> = {
  managedSupport: true,
  supportsNativeTools: false,
  preferredManagedProtocol: 'managed_xml',
  formatAssistantToolCalls(calls) {
    return managedXmlProtocol.formatAssistantToolCalls(calls)
  },
  formatToolResult(result) {
    return managedXmlProtocol.formatToolResult(result)
  },
}

const profiles: Record<string, ProviderToolProfile> = {
  deepseek: {
    providerId: 'deepseek',
    ...zxWebXmlHistoryProfile,
  },
  kimi: {
    providerId: 'kimi',
    ...zxWebXmlHistoryProfile,
  },
  glm: {
    providerId: 'glm',
    ...zxWebXmlHistoryProfile,
  },
  qwen: {
    providerId: 'qwen',
    ...zxWebXmlHistoryProfile,
  },
}

export function getProviderToolProfile(providerId: string): ProviderToolProfile {
  return profiles[providerId] ?? {
    providerId,
    ...zxWebXmlHistoryProfile,
  }
}
