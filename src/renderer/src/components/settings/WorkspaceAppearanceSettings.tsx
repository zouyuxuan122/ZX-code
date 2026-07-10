import { useState, useRef } from 'react'
import { Bot, User, Image as ImageIcon, Trash2, Upload, Palette, Link2, Link2Off, Maximize2 } from 'lucide-react'
import { useProjectStore } from '@/stores/projectStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { ipc } from '@/services/ipc'
import { toast } from '@/stores/toastStore'
import { Toggle } from '@/components/ui/Toggle'
import { Slider } from '@/components/ui/Slider'
import { cn } from '@/utils/cn'
import type { UpdateProjectDto } from '@shared/types/project'

/**
 * 工作区外观设置
 *
 * 共享开关：
 * - 开启：所有工作区共用同一套头像/背景，存到 settings 表
 *        （上传/清除时写入 workspace.shared* 设置项）
 * - 关闭：每个工作区独立设置，存到 project 自身字段
 *        （上传/清除时写入当前 project）
 *
 * 当前展示的值始终来自 currentProject（后端已根据共享设置覆盖）。
 */
export function WorkspaceAppearanceSettings() {
  const currentProject = useProjectStore((s) => s.currentProject)
  const refreshCurrentProject = useProjectStore((s) => s.refreshCurrentProject)
  const updateSetting = useSettingsStore((s) => s.updateSetting)
  const getSetting = useSettingsStore((s) => s.getSetting)
  const colorInputRef = useRef<HTMLInputElement>(null)

  // 共享开关（直接读 settings store，保证即时反映）
  const shareAppearance = getSetting<boolean>('workspace.shareAppearance', false)

  // 本地颜色输入值
  const [colorValue, setColorValue] = useState('#1a1a1a')
  
  // 头像大小设置
  const [avatarSize, setAvatarSize] = useState(getSetting<number>('workspace.avatarSize', 32))

  /** 保存头像大小设置 */
  const saveAvatarSize = async (size: number) => {
    setAvatarSize(size)
    try {
      await updateSetting('workspace.avatarSize', size, 'workspace')
    } catch (e) {
      toast.error('保存失败', (e as Error).message)
    }
  }

  if (!currentProject) {
    return (
      <div className="surface-3d rounded-md p-4 text-center text-xs text-text-tertiary">
        请先在左侧栏选择一个工作区后再设置外观
      </div>
    )
  }

  /**
   * 上传图片。
   * 共享开启 → 写入 settings 表的 workspace.shared* 项；
   * 关闭 → 写入当前 project 字段。
   */
  const uploadImage = async (kind: 'ai_avatar' | 'user_avatar' | 'background'): Promise<void> => {
    try {
      const result = await ipc.upload.image()
      if (!result) return
      if (shareAppearance) {
        // 写入共享设置
        if (kind === 'ai_avatar') await updateSetting('workspace.sharedAiAvatar', result.url, 'workspace')
        else if (kind === 'user_avatar') await updateSetting('workspace.sharedUserAvatar', result.url, 'workspace')
        else {
          await updateSetting('workspace.sharedBackground', result.url, 'workspace')
          await updateSetting('workspace.sharedBackgroundType', 'image', 'workspace')
        }
      } else {
        // 写入当前 project
        const patch: UpdateProjectDto = { [kind]: result.url }
        if (kind === 'background') patch.background_type = 'image'
        await ipc.project.update(currentProject.id, patch)
      }
      await refreshCurrentProject()
      toast.success('已更新')
    } catch (err) {
      toast.error('上传失败', (err as Error).message)
    }
  }

  /** 清除字段 */
  const clearField = async (kind: 'ai_avatar' | 'user_avatar' | 'background'): Promise<void> => {
    if (shareAppearance) {
      if (kind === 'ai_avatar') await updateSetting('workspace.sharedAiAvatar', '', 'workspace')
      else if (kind === 'user_avatar') await updateSetting('workspace.sharedUserAvatar', '', 'workspace')
      else {
        await updateSetting('workspace.sharedBackground', '', 'workspace')
        await updateSetting('workspace.sharedBackgroundType', 'none', 'workspace')
      }
    } else {
      const patch: UpdateProjectDto = { [kind]: '' }
      if (kind === 'background') patch.background_type = 'none'
      await ipc.project.update(currentProject.id, patch)
    }
    await refreshCurrentProject()
    toast.success('已清除')
  }

  /** 应用颜色背景 */
  const applyColorBackground = async (): Promise<void> => {
    if (shareAppearance) {
      await updateSetting('workspace.sharedBackground', colorValue, 'workspace')
      await updateSetting('workspace.sharedBackgroundType', 'color', 'workspace')
    } else {
      await ipc.project.update(currentProject.id, { background: colorValue, background_type: 'color' })
    }
    await refreshCurrentProject()
    toast.success('背景颜色已应用')
  }

  /** 恢复默认背景 */
  const clearBackground = async (): Promise<void> => {
    if (shareAppearance) {
      await updateSetting('workspace.sharedBackground', '', 'workspace')
      await updateSetting('workspace.sharedBackgroundType', 'none', 'workspace')
    } else {
      await ipc.project.update(currentProject.id, { background: '', background_type: 'none' })
    }
    await refreshCurrentProject()
    toast.success('已恢复默认背景')
  }

  /** 切换共享开关 */
  const toggleShare = async (next: boolean) => {
    await updateSetting('workspace.shareAppearance', next, 'workspace')
    await refreshCurrentProject()
    toast.success(next ? '已开启共享外观' : '已关闭共享外观，各工作区独立')
  }

  // 当前展示值（后端已根据共享设置覆盖 currentProject 字段）
  const aiAvatar = currentProject.ai_avatar
  const userAvatar = currentProject.user_avatar
  const background = currentProject.background
  const backgroundType = currentProject.background_type

  return (
    <div className="space-y-4">
      {/* 共享外观开关 */}
      <section className="surface-3d rounded-md p-4">
        <div className="flex items-center gap-2">
          {shareAppearance ? (
            <Link2 className="h-4 w-4 text-accent-blue" />
          ) : (
            <Link2Off className="h-4 w-4 text-text-tertiary" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-text-primary">共享外观</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {shareAppearance
                ? '所有工作区共用同一套头像与背景（在此处统一设置）'
                : '各工作区独立设置头像与背景（仅作用于当前工作区）'}
            </p>
          </div>
          <Toggle checked={shareAppearance} onChange={(next) => void toggleShare(next)} />
        </div>
        {shareAppearance && (
          <div className="mt-3 rounded-md border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-xs text-text-secondary">
            共享模式已开启：下方所有外观设置将同步到全部工作区
          </div>
        )}
      </section>

      {/* 头像大小 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Maximize2 className="h-4 w-4 text-accent-orange" />
          <h3 className="text-sm font-semibold text-text-primary">头像大小</h3>
          <span className="ml-auto text-xs text-text-tertiary">{avatarSize}px</span>
        </div>
        <Slider
          value={avatarSize}
          min={20}
          max={64}
          step={2}
          onChange={(v) => void saveAvatarSize(v)}
        />
        <div className="mt-3 flex items-center gap-4">
          <div
            className="flex items-center justify-center overflow-hidden rounded-full border border-border-strong bg-bg-tertiary"
            style={{ width: avatarSize, height: avatarSize }}
          >
            {aiAvatar ? (
              <img src={aiAvatar} alt="AI" className="h-full w-full object-cover" />
            ) : (
              <Bot className="text-text-tertiary" style={{ width: avatarSize * 0.5, height: avatarSize * 0.5 }} />
            )}
          </div>
          <div
            className="flex items-center justify-center overflow-hidden rounded-full border border-border-strong bg-bg-tertiary"
            style={{ width: avatarSize, height: avatarSize }}
          >
            {userAvatar ? (
              <img src={userAvatar} alt="User" className="h-full w-full object-cover" />
            ) : (
              <User className="text-text-tertiary" style={{ width: avatarSize * 0.5, height: avatarSize * 0.5 }} />
            )}
          </div>
          <span className="text-xs text-text-tertiary">预览效果</span>
        </div>
      </section>

      {/* AI 头像 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent-blue" />
          <h3 className="text-sm font-semibold text-text-primary">AI 头像</h3>
          <span className="ml-auto text-xs text-text-tertiary">
            {shareAppearance ? '共享' : currentProject.name}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <AvatarPreview src={aiAvatar} Icon={Bot} />
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void uploadImage('ai_avatar')}
              className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-primary transition-smooth-fast hover:bg-white/5"
            >
              <Upload className="h-3 w-3" />
              上传图片
            </button>
            {aiAvatar && (
              <button
                onClick={() => void clearField('ai_avatar')}
                className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-secondary transition-smooth-fast hover:border-accent-red/40 hover:text-accent-red"
              >
                <Trash2 className="h-3 w-3" />
                清除
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 用户头像 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <User className="h-4 w-4 text-accent-green" />
          <h3 className="text-sm font-semibold text-text-primary">用户头像</h3>
        </div>
        <div className="flex items-center gap-4">
          <AvatarPreview src={userAvatar} Icon={User} />
          <div className="flex flex-col gap-2">
            <button
              onClick={() => void uploadImage('user_avatar')}
              className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-primary transition-smooth-fast hover:bg-white/5"
            >
              <Upload className="h-3 w-3" />
              上传图片
            </button>
            {userAvatar && (
              <button
                onClick={() => void clearField('user_avatar')}
                className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-secondary transition-smooth-fast hover:border-accent-red/40 hover:text-accent-red"
              >
                <Trash2 className="h-3 w-3" />
                清除
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 对话背景 */}
      <section className="surface-3d rounded-md p-4">
        <div className="mb-3 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-accent-purple" />
          <h3 className="text-sm font-semibold text-text-primary">对话区背景</h3>
          <span className="ml-auto text-xs text-text-tertiary">类型: {backgroundType}</span>
        </div>

        {/* 当前背景预览 */}
        <div className="mb-3 flex h-20 items-center justify-center overflow-hidden rounded-md border border-border-default bg-bg-tertiary">
          {backgroundType === 'none' || !background ? (
            <span className="text-xs text-text-tertiary">默认背景</span>
          ) : backgroundType === 'image' ? (
            <img src={background} alt="背景" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full" style={{ backgroundColor: background }} />
          )}
        </div>

        {/* 操作按钮组 */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void uploadImage('background')}
            className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-primary transition-smooth-fast hover:bg-white/5"
          >
            <Upload className="h-3 w-3" />
            图片背景
          </button>

          <button
            onClick={() => colorInputRef.current?.click()}
            className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-primary transition-smooth-fast hover:bg-white/5"
          >
            <Palette className="h-3 w-3" />
            颜色背景
          </button>
          <input
            ref={colorInputRef}
            type="color"
            value={colorValue}
            onChange={(e) => setColorValue(e.target.value)}
            onBlur={() => void applyColorBackground()}
            className="h-0 w-0 opacity-0"
          />

          {backgroundType !== 'none' && (
            <button
              onClick={() => void clearBackground()}
              className="lift-button flex h-8 items-center gap-1.5 rounded-md border border-border-default px-3 text-xs text-text-secondary transition-smooth-fast hover:border-accent-red/40 hover:text-accent-red"
            >
              <Trash2 className="h-3 w-3" />
              恢复默认
            </button>
          )}
        </div>

        {/* 颜色快捷选项 */}
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-text-tertiary">快捷颜色:</span>
          {['#0a0a0a', '#1a1a1a', '#0f1a2e', '#1a0f2e', '#0f2e1a', '#2e1a0f'].map((c) => (
            <button
              key={c}
              onClick={async () => {
                setColorValue(c)
                if (shareAppearance) {
                  await updateSetting('workspace.sharedBackground', c, 'workspace')
                  await updateSetting('workspace.sharedBackgroundType', 'color', 'workspace')
                } else {
                  await ipc.project.update(currentProject.id, { background: c, background_type: 'color' })
                }
                await refreshCurrentProject()
              }}
              className={cn(
                'h-5 w-5 rounded border border-border-default transition-smooth-fast hover:scale-110',
                background === c && 'ring-2 ring-accent-blue',
              )}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

/** 头像预览组件 */
function AvatarPreview({
  src,
  Icon,
}: {
  src: string
  Icon: typeof Bot
}) {
  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-bg-tertiary">
      {src ? (
        <img src={src} alt="头像" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-7 w-7 text-text-tertiary" />
      )}
    </div>
  )
}
