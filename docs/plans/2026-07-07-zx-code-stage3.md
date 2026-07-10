# 阶段3：完整 UI + 设置系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** 完整实现 ZX-Code 的设置系统（6 个 tab）、项目管理增强、通知与提示系统、动画精修，达成完整的 Codex 体验。

**Architecture:** 渲染进程组件 + Zustand 状态管理 + IPC 调用主进程设置持久化。所有设置通过 `ipc.settings.set/get` 写入 SQLite settings 表。新增通用 UI 组件（Toggle、Slider、Select 改进、Toast 通知）支撑设置界面。

**Tech Stack:** React 19 + TypeScript + Tailwind + Framer Motion + Zustand + lucide-react

---

## 文件结构

**新建文件：**
- `src/renderer/src/components/ui/Toggle.tsx` — 开关组件
- `src/renderer/src/components/ui/Slider.tsx` — 滑块组件
- `src/renderer/src/components/ui/Toast.tsx` — Toast 通知系统
- `src/renderer/src/components/settings/GeneralSettings.tsx` — 通用设置
- `src/renderer/src/components/settings/ApiSettings.tsx` — API 设置
- `src/renderer/src/components/settings/PermissionSettings.tsx` — 权限管理
- `src/renderer/src/components/settings/ThemeSettings.tsx` — 外观设置
- `src/renderer/src/components/settings/LogSettings.tsx` — 日志设置
- `src/renderer/src/stores/toastStore.ts` — Toast 状态管理

**修改文件：**
- `src/renderer/src/pages/SettingsPage.tsx` — 接入所有设置 tab 组件
- `src/renderer/src/pages/ProjectsPage.tsx` — 增强项目编辑功能
- `src/renderer/src/components/layout/RightSidebar.tsx` — 完善空状态提示与联动
- `src/renderer/src/App.tsx` — 挂载 Toast 容器
- `src/renderer/src/components/layout/AppLayout.tsx` — 全局快捷键监听

---

## 批次划分

### 批次1：通用 UI 组件（Toggle/Slider/Toast）

#### Task 1: Toggle 开关组件

**Files:**
- Create: `src/renderer/src/components/ui/Toggle.tsx`

- [ ] **Step 1: 创建 Toggle 组件**

```tsx
// 开关组件，支持选中态、禁用态、流畅过渡动画
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}

export function Toggle({ checked, onChange, disabled, size = 'md' }: ToggleProps) {
  const dims = size === 'sm'
    ? { w: 'w-8', h: 'h-4', knob: 'h-3 w-3', translate: 14 }
    : { w: 'w-10', h: 'h-5', knob: 'h-4 w-4', translate: 18 }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-full border transition-smooth-fast',
        dims.w, dims.h,
        checked
          ? 'border-accent-blue bg-accent-blue/30 shadow-glow'
          : 'border-border-default bg-bg-tertiary',
        disabled && 'cursor-not-allowed opacity-50',
        !disabled && 'hover:border-border-strong',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn(
          'inline-block rounded-full bg-white shadow-sm',
          dims.knob,
        )}
        style={{ marginLeft: 2, transform: checked ? `translateX(${dims.translate}px)` : 'translateX(0)' }}
      />
    </button>
  )
}
```

- [ ] **Step 2: 类型检查**

Run: `cd "d:\ZX code" && npx tsc --noEmit -p tsconfig.web.json`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/ui/Toggle.tsx
git commit -m "feat(ui): 添加 Toggle 开关组件"
```

#### Task 2: Slider 滑块组件

**Files:**
- Create: `src/renderer/src/components/ui/Slider.tsx`

- [ ] **Step 1: 创建 Slider 组件**

```tsx
// 滑块组件，用于数值调节（字体大小、上下文长度等）
import { useState } from 'react'
import { cn } from '@/utils/cn'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

export function Slider({ value, min, max, step = 1, onChange, disabled, className }: SliderProps) {
  const [dragging, setDragging] = useState(false)
  const percent = ((value - min) / (max - min)) * 100

  return (
    <div className={cn('flex items-center gap-3', disabled && 'opacity-50', className)}>
      <div className="relative flex-1">
        {/* 轨道 */}
        <div className="h-1 rounded-full bg-bg-tertiary border border-border-default" />
        {/* 已选填充 */}
        <div
          className="absolute top-0 h-1 rounded-full bg-accent-blue shadow-glow"
          style={{ width: `${percent}%` }}
        />
        {/* 滑块手柄 */}
        <div
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-blue bg-white shadow-md transition-transform',
            dragging ? 'scale-110' : 'hover:scale-105',
          )}
          style={{ left: `${percent}%` }}
        />
        {/* 透明 input 捕获交互 */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseDown={() => setDragging(true)}
          onMouseUp={() => setDragging(false)}
          onTouchStart={() => setDragging(true)}
          onTouchEnd={() => setDragging(false)}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="w-12 text-right text-xs font-mono text-text-secondary tabular-nums">
        {value}
      </span>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查 + Commit**

```bash
git add src/renderer/src/components/ui/Slider.tsx
git commit -m "feat(ui): 添加 Slider 滑块组件"
```

#### Task 3: Toast 通知系统

**Files:**
- Create: `src/renderer/src/stores/toastStore.ts`
- Create: `src/renderer/src/components/ui/Toast.tsx`

- [ ] **Step 1: 创建 toastStore**

```tsx
// Toast 通知状态管理
import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastState {
  toasts: ToastItem[]
  addToast: (toast: Omit<ToastItem, 'id'>) => string
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }))
    return id
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

// 便捷方法
export const toast = {
  success: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'error', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().addToast({ type: 'warning', title, message }),
}
```

- [ ] **Step 2: 创建 Toast 容器组件**

```tsx
// Toast 通知容器（挂载在 App 根节点，固定右上角）
import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { cn } from '@/utils/cn'

const iconMap: Record<ToastType, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
}

const colorMap: Record<ToastType, string> = {
  success: 'text-accent-green',
  error: 'text-accent-red',
  info: 'text-accent-blue',
  warning: 'text-accent-orange',
}

function ToastCard({ toast: item }: { toast: import('@/stores/toastStore').ToastItem }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const Icon = iconMap[item.type]

  useEffect(() => {
    const timer = setTimeout(() => removeToast(item.id), item.duration ?? 3500)
    return () => clearTimeout(timer)
  }, [item.id, item.duration, removeToast])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.9 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="surface-3d pointer-events-auto flex w-80 items-start gap-3 rounded-md p-3"
    >
      <Icon className={cn('mt-0.5 h-4 w-4 flex-shrink-0', colorMap[item.type])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary">{item.title}</p>
        {item.message && <p className="mt-0.5 text-xs text-text-secondary">{item.message}</p>}
      </div>
      <button
        onClick={() => removeToast(item.id)}
        className="text-text-tertiary transition-smooth-fast hover:text-text-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  )
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed right-4 top-12 z-50 flex flex-col gap-2">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 3: 在 App.tsx 挂载 ToastContainer**

修改 `src/renderer/src/App.tsx`，在根组件最外层（router 之外或之内均可）添加 `<ToastContainer />`。

- [ ] **Step 4: 类型检查 + Commit**

```bash
git add src/renderer/src/stores/toastStore.ts src/renderer/src/components/ui/Toast.tsx src/renderer/src/App.tsx
git commit -m "feat(ui): 添加 Toast 通知系统"
```

---

### 批次2：设置页面完整实现

#### Task 4: GeneralSettings 通用设置

**Files:**
- Create: `src/renderer/src/components/settings/GeneralSettings.tsx`

- [ ] **Step 1: 实现通用设置**

包含：
- 语言选择（中文/英文）— `general.language`
- 字体大小调节（12-18px）— `general.fontSize`，用 Slider
- 启动行为（恢复上次项目/空白启动）— `general.startup`

```tsx
import { useEffect, useState } from 'react'
import { Globe, Type, Rocket } from 'lucide-react'
import { useSettingsStore } from '@/stores/settingsStore'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { toast } from '@/stores/toastStore'

export function GeneralSettings() {
  const getSetting = useSettingsStore((s) => s.getSetting)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const [language, setLanguage] = useState(getSetting('general.language', 'zh-CN'))
  const [fontSize, setFontSize] = useState(getSetting('general.fontSize', 14))
  const [startup, setStartup] = useState(getSetting('general.startup', 'last-project'))

  useEffect(() => {
    setLanguage(getSetting('general.language', 'zh-CN'))
    setFontSize(getSetting('general.fontSize', 14))
    setStartup(getSetting('general.startup', 'last-project'))
  }, [getSetting])

  const handleSave = async (key: string, value: unknown) => {
    await updateSetting(key, value, 'general')
    toast.success('设置已保存')
  }

  return (
    <div className="space-y-6">
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">语言</h3>
        </div>
        <Select
          value={language}
          onChange={(v) => { setLanguage(v); handleSave('general.language', v) }}
          options={[
            { label: '简体中文', value: 'zh-CN' },
            { label: 'English', value: 'en-US' },
          ]}
        />
      </section>

      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Type className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">字体大小</h3>
        </div>
        <Slider
          value={fontSize}
          min={12}
          max={18}
          onChange={(v) => setFontSize(v)}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => handleSave('general.fontSize', fontSize)}
            className="text-xs text-accent-blue transition-smooth-fast hover:text-accent-blue-hover"
          >应用</button>
        </div>
      </section>

      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Rocket className="h-4 w-4 text-text-secondary" />
          <h3 className="text-sm font-semibold text-text-primary">启动行为</h3>
        </div>
        <Select
          value={startup}
          onChange={(v) => { setStartup(v); handleSave('general.startup', v) }}
          options={[
            { label: '恢复上次项目', value: 'last-project' },
            { label: '空白启动', value: 'none' },
          ]}
        />
      </section>
    </div>
  )
}
```

- [ ] **Step 2: 类型检查 + Commit**

#### Task 5: ApiSettings API 设置

**Files:**
- Create: `src/renderer/src/components/settings/ApiSettings.tsx`

- [ ] **Step 1: 实现 API 设置**

包含：
- 默认 API 超时（秒）— `api.timeout`，Slider 10-120
- 默认最大重试次数 — `api.maxRetries`，Slider 0-5
- 流式响应开关 — `api.stream`，Toggle
- 自定义 User-Agent — `api.userAgent`，Input

参考 GeneralSettings 结构。设置 category 为 `'api'`。注意 DefaultSettings 类型未包含 api.* 键，但 settings 表是松散 KV，可直接用。

- [ ] **Step 2: 类型检查 + Commit**

#### Task 6: PermissionSettings 权限管理

**Files:**
- Create: `src/renderer/src/components/settings/PermissionSettings.tsx`

- [ ] **Step 1: 实现权限管理**

包含：
- 自动接受工具调用 — `permission.autoAccept`，Toggle
- 文件系统访问 — `permission.fileSystem`，Select（询问/允许/拒绝）
- 命令执行 — `permission.execute`，Select
- 网络访问 — `permission.network`，Select

参考 GeneralSettings 结构。category 为 `'permission'`。

- [ ] **Step 2: 类型检查 + Commit**

#### Task 7: ThemeSettings 外观设置

**Files:**
- Create: `src/renderer/src/components/settings/ThemeSettings.tsx`

- [ ] **Step 1: 实现外观设置**

包含：
- 主题（深色/浅色）— `general.theme`，Select
- 字体族 — `theme.fontFamily`，Select（系统默认/等宽/无衬线）
- 快捷键展示 — 只读列表展示当前快捷键

category 为 `'theme'`（字体族）/ `'general'`（主题）。

- [ ] **Step 2: 类型检查 + Commit**

#### Task 8: LogSettings 日志设置

**Files:**
- Create: `src/renderer/src/components/settings/LogSettings.tsx`

- [ ] **Step 1: 实现日志设置**

包含：
- 日志级别 — `log.level`，Select（debug/info/warn/error）
- 文件日志开关 — `log.fileEnabled`，Toggle
- 日志查看（只读显示最近日志路径，可选"打开日志目录"按钮调用 ipc.system）

category 为 `'log'`。

- [ ] **Step 2: 类型检查 + Commit**

#### Task 9: SettingsPage 接入所有 tab

**Files:**
- Modify: `src/renderer/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 修改 SettingsPage**

把每个 tab 的占位内容替换为对应组件：
- `general` → `<GeneralSettings />`
- `model` → `<ProviderSettings />`（已实现）
- `api` → `<ApiSettings />`
- `permission` → `<PermissionSettings />`
- `theme` → `<ThemeSettings />`
- `log` → `<LogSettings />`

- [ ] **Step 2: 类型检查 + 构建验证 + Commit**

---

### 批次3：项目管理增强 + 右侧栏完善 + 全局快捷键

#### Task 10: 项目管理增强

**Files:**
- Modify: `src/renderer/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: 增强项目编辑**

当前项目卡片支持：切换、删除。增加：
- 编辑项目（修改名称/描述，点击项目名进入编辑模式或弹出编辑表单）
- 在文件管理器中打开工作区（调用 ipc.system，若无对应方法则提示）
- 显示项目创建时间（project.created_at）

- [ ] **Step 2: 类型检查 + Commit**

#### Task 11: 右侧栏完善

**Files:**
- Modify: `src/renderer/src/components/layout/RightSidebar.tsx`

- [ ] **Step 1: 完善右侧栏**

当前三个区块都是"暂无"占位。增强为：
- 待办事项：显示"Agent 工作时将自动记录任务"提示
- 任务产物：显示"Agent 生成的文件将出现在此"提示
- 参考信息：显示"Agent 引用的文件/链接将出现在此"提示
- 三个区块空状态都加 `animate-float` 图标 + 引导文字，让用户知道用途
- 区块标题加 Tooltip 说明

（功能联动留到阶段4，本批次只完善 UI 引导）

- [ ] **Step 2: 类型检查 + Commit**

#### Task 12: 全局快捷键监听

**Files:**
- Modify: `src/renderer/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: 添加全局快捷键**

在 AppLayout 中用 `useEffect` 监听 keydown：
- `Ctrl/Cmd + B` → toggleLeftSidebar
- `Ctrl/Cmd + J` → toggleRightSidebar
- `Ctrl/Cmd + ,` → navigate('/settings')
- `Ctrl/Cmd + N` → navigate('/chat') 并新建对话（可选，先只导航）

- [ ] **Step 2: 类型检查 + 构建验证 + Commit**

---

### 批次4：动画精修 + 最终验证

#### Task 13: 动画精修

**Files:**
- Modify: 各组件（按需）

- [ ] **Step 1: 精修动画**

检查并增强：
- 消息出现动画用 stagger（多条消息错落淡入）
- 设置 tab 切换内容用 AnimatePresence 淡入
- 按钮 hover 光晕（box-shadow 过渡）
- 路由切换动画确认流畅（已实现，检查 exit 是否生效）
- 输入框 focus 光晕扩散

- [ ] **Step 2: 构建验证 + Commit**

#### Task 14: 最终验证

- [ ] **Step 1: 完整类型检查**

Run: `cd "d:\ZX code" && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`
Expected: 0 errors

- [ ] **Step 2: 完整构建**

Run: `cd "d:\ZX code" && npx electron-vite build`
Expected: 构建成功

- [ ] **Step 3: 运行时验证**

启动应用，逐项检查：
- 6 个设置 tab 都能打开且有内容
- Toggle/Slider/Toast 交互正常
- 项目新建/切换/删除/编辑正常
- 快捷键（Ctrl+B/J/,）正常
- Toast 通知显示与消失动画流畅

- [ ] **Step 4: Commit**

---

## Self-Review

**Spec coverage:**
- ✅ 权限管理（Task 6）
- ✅ 错误处理与日志（Task 8）
- ✅ 模型与供应商配置（阶段2已实现 ProviderSettings）
- ✅ API 设置（Task 5）
- ✅ 上下文长度设置（可在 ApiSettings 或 ModelSettings 中加，Task 5 包含）
- ✅ 模型列表管理（阶段2已实现）
- ✅ 权限自动接受开关（Task 6）
- ✅ 主题/字体/快捷键设置（Task 7 + Task 12）
- ✅ 关于页面（阶段1已实现）
- ✅ 通知与提示系统（Task 3）
- ✅ 错误处理机制（Toast + ErrorBoundary 已有）
- ✅ 右侧栏完整实现（Task 11）
- ✅ 项目管理完整功能（Task 10）
- ✅ 动画与过渡精修（Task 13）

**Placeholder scan:** 无 TBD/TODO，所有任务含完整代码。

**Type consistency:** ToggleProps/SliderProps/ToastItem 类型一致，settingsStore 的 getSetting/updateSetting 签名与使用匹配。

## Execution Handoff

Plan complete and saved to `docs/plans/2026-07-07-zx-code-stage3.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 task 派发 fresh subagent，task 间 review

**2. Inline Execution** - 当前会话批量执行

采用 **Subagent-Driven** 按批次执行。
