import { useMemo } from 'react'
import { Cat, Image as ImageIcon, Palette, MessageSquare, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import { usePetStore, type BackgroundType } from '@/stores/petStore'
import { useGridStore } from '@/stores/gridStore'
import { ipc } from '@/services/ipc'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { cn } from '@/utils/cn'
import { PetCharacter } from '@/components/grid/panels/pet/PetCharacter'
import { ModelRenderer } from '@/components/grid/panels/pet/ModelRenderer'

// ─── Options ────────────────────────────────────────────

const AVATAR_OPTIONS: { value: BackgroundType | 'svg' | 'vrm' | 'live2d'; label: string }[] = [
  { value: 'svg', label: '默认 SVG' },
  { value: 'vrm', label: 'VRM 模型' },
  { value: 'live2d', label: 'Live2D 模型' },
]

const BACKGROUND_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: 'theme', label: '跟随主题' },
  { value: 'solid', label: '纯色' },
  { value: 'gradient', label: '渐变' },
  { value: 'image', label: '图片' },
]

function getThemeGradient(): string {
  if (typeof document === 'undefined') {
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  }
  const style = getComputedStyle(document.documentElement)
  const primary = style.getPropertyValue('--bg-primary').trim() || '#0a0a0a'
  const secondary = style.getPropertyValue('--bg-secondary').trim() || '#1c1c1e'
  return `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
}

// ─── Sub-components ─────────────────────────────────────

interface RadioCardProps {
  label: string
  checked: boolean
  onClick: () => void
}

function RadioCard({ label, checked, onClick }: RadioCardProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-smooth',
        checked
          ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
          : 'border-border-default bg-bg-tertiary/60 text-text-secondary hover:border-border-strong hover:bg-hover-surface',
      )}
    >
      <span
        className={cn(
          'mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-full border',
          checked ? 'border-accent-blue' : 'border-text-tertiary',
        )}
      >
        {checked && <span className="h-1.5 w-1.5 rounded-full bg-accent-blue" />}
      </span>
      {label}
    </motion.button>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: typeof Cat; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 text-accent-blue" />
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
    </div>
  )
}

function Field({
  label,
  children,
  htmlFor,
}: {
  label: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-text-secondary">
        {label}
      </label>
      {children}
    </div>
  )
}

// ─── Preview ────────────────────────────────────────────

function PetPreview() {
  const backgroundType = usePetStore((s) => s.backgroundType)
  const backgroundValue = usePetStore((s) => s.backgroundValue)
  const avatarType = usePetStore((s) => s.character.avatarType)

  const style = useMemo(() => {
    switch (backgroundType) {
      case 'solid':
      case 'gradient':
        return { background: backgroundValue }
      case 'image':
        return {
          backgroundImage: `url("${backgroundValue}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }
      case 'theme':
      default:
        return { background: getThemeGradient() }
    }
  }, [backgroundType, backgroundValue])

  return (
    <section className="surface-3d rounded-xl p-4">
      <SectionHeader icon={Cat} title="实时预览" />
      <div
        data-testid="pet-settings-preview"
        className="relative flex h-48 items-center justify-center overflow-hidden rounded-lg border border-border-default"
        style={style}
      >
        <div className="relative h-32 w-32">
          {avatarType === 'live2d' || avatarType === 'vrm' ? (
            // 设置页预览强制始终可见，不受九宫格模式影响
            <ModelRenderer isVisible={true} />
          ) : (
            <PetCharacter />
          )}
        </div>
      </div>
    </section>
  )
}

// ─── Main Component ─────────────────────────────────────

export function PetSettings() {
  const character = usePetStore((s) => s.character)
  const backgroundType = usePetStore((s) => s.backgroundType)
  const backgroundValue = usePetStore((s) => s.backgroundValue)
  const updateCharacter = usePetStore((s) => s.updateCharacter)
  const setBackgroundType = usePetStore((s) => s.setBackgroundType)
  const setBackgroundValue = usePetStore((s) => s.setBackgroundValue)
  const resetLayout = useGridStore((s) => s.resetLayout)

  const updateStringField = (key: keyof typeof character, value: string) => {
    updateCharacter({ [key]: value } as Partial<typeof character>)
  }

  const handleImportModel = async (type: 'vrm' | 'live2d') => {
    try {
      const path =
        type === 'vrm'
          ? await ipc.file.selectFile({ filters: [{ name: 'VRM 模型', extensions: ['vrm'] }] })
          : await ipc.file.selectFile({ filters: [{ name: 'Live2D 模型 (.model3.json)', extensions: ['model3.json', 'json'] }] })
      if (path) {
        updateCharacter({ avatarType: type, modelPath: path })
      }
    } catch (e) {
      // 文件选择取消或失败时不更新状态
    }
  }

  const handleSelectBackgroundImage = async () => {
    try {
      const path = await ipc.file.selectFile({
        filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (path) {
        setBackgroundType('image')
        setBackgroundValue(path)
      }
    } catch (e) {
      // 取消选择
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* 角色卡 */}
        <section className="surface-3d rounded-xl p-4">
          <SectionHeader icon={Cat} title="角色卡" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="角色名" htmlFor="pet-name">
              <Input
                id="pet-name"
                value={character.name}
                onChange={(e) => updateStringField('name', e.target.value)}
                placeholder="给小宠物起个名字"
              />
            </Field>
            <Field label="头像" htmlFor="pet-avatar">
              <Input
                id="pet-avatar"
                value={character.avatar}
                onChange={(e) => updateStringField('avatar', e.target.value)}
                placeholder="例如：🐱"
              />
            </Field>
            <Field label="性格描述" htmlFor="pet-personality">
              <Input
                id="pet-personality"
                value={character.personality}
                onChange={(e) => updateStringField('personality', e.target.value)}
                placeholder="描述宠物的性格"
              />
            </Field>
            <Field label="问候语" htmlFor="pet-greeting">
              <Input
                id="pet-greeting"
                value={character.greeting}
                onChange={(e) => updateStringField('greeting', e.target.value)}
                placeholder="首次见面时的问候"
              />
            </Field>
          </div>

          <div className="mt-4 space-y-1.5">
            <label className="block text-xs font-medium text-text-secondary" htmlFor="pet-role-card">
              角色卡（LLM 人设）
            </label>
            <textarea
              id="pet-role-card"
              value={character.roleCard}
              onChange={(e) => updateCharacter({ roleCard: e.target.value })}
              placeholder="描述角色的设定、性格、说话风格..."
              rows={4}
              className="settings-textarea w-full resize-y rounded-lg border border-border-default bg-bg-tertiary/60 px-3 py-2 text-sm text-text-primary shadow-inset placeholder:text-text-tertiary transition-smooth-fast focus-visible:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/30 no-drag"
            />
          </div>
        </section>

        {/* 人物形象 */}
        <section className="surface-3d rounded-xl p-4">
          <SectionHeader icon={Cat} title="人物形象" />
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_OPTIONS.map((option) => (
              <RadioCard
                key={option.value}
                label={option.label}
                checked={character.avatarType === option.value}
                onClick={() => updateCharacter({ avatarType: option.value as typeof character.avatarType })}
              />
            ))}
          </div>

          {character.avatarType === 'vrm' && (
            <div className="mt-3">
              <Button size="sm" onClick={() => void handleImportModel('vrm')}>
                导入 VRM 模型
              </Button>
              {character.modelPath && (
                <p className="mt-2 break-all text-[10px] text-text-tertiary">{character.modelPath}</p>
              )}
            </div>
          )}

          {character.avatarType === 'live2d' && (
            <div className="mt-3">
              <Button size="sm" onClick={() => void handleImportModel('live2d')}>
                导入 Live2D 模型文件
              </Button>
              {character.modelPath && (
                <p className="mt-2 break-all text-[10px] text-text-tertiary">{character.modelPath}</p>
              )}
            </div>
          )}
        </section>

        {/* 背景设置 */}
        <section className="surface-3d rounded-xl p-4">
          <SectionHeader icon={Palette} title="宠物背景" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKGROUND_OPTIONS.map((option) => (
              <RadioCard
                key={option.value}
                label={option.label}
                checked={backgroundType === option.value}
                onClick={() => setBackgroundType(option.value)}
              />
            ))}
          </div>

          {(backgroundType === 'solid' || backgroundType === 'gradient') && (
            <div className="mt-3">
              <Field label="背景值" htmlFor="pet-bg-value">
                <Input
                  id="pet-bg-value"
                  value={backgroundValue}
                  onChange={(e) => setBackgroundValue(e.target.value)}
                  placeholder={backgroundType === 'solid' ? '#667eea' : 'linear-gradient(...)'}
                />
              </Field>
            </div>
          )}

          {backgroundType === 'image' && (
            <div className="mt-3">
              <Button size="sm" onClick={() => void handleSelectBackgroundImage()}>
                <ImageIcon className="h-3.5 w-3.5" />
                选择背景图片
              </Button>
              {backgroundValue && (
                <p className="mt-2 break-all text-[10px] text-text-tertiary">{backgroundValue}</p>
              )}
            </div>
          )}
        </section>

        {/* 字幕与布局 */}
        <section className="surface-3d rounded-xl p-4">
          <SectionHeader icon={MessageSquare} title="字幕与布局" />
          <div className="mb-4 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <span>开启字幕</span>
              <Toggle
                checked={character.subtitleEnabled}
                onChange={(checked) => updateCharacter({ subtitleEnabled: checked })}
              />
            </label>
          </div>

          <div className="mb-4">
            <Field label="字幕样式" htmlFor="pet-subtitle-style">
              <Select
                id="pet-subtitle-style"
                value={character.subtitleStyle}
                onChange={(e) =>
                  updateCharacter({ subtitleStyle: e.target.value as typeof character.subtitleStyle })
                }
              >
                <option value="bubble">气泡</option>
                <option value="line">单行</option>
              </Select>
            </Field>
          </div>

          <div className="flex items-center gap-3 border-t border-border-subtle pt-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-text-primary">重置九宫格布局</p>
              <p className="text-xs text-text-tertiary">恢复为默认九宫格面板布局</p>
            </div>
            <Button variant="outline" size="sm" onClick={resetLayout}>
              <RotateCcw className="h-3.5 w-3.5" />
              重置布局
            </Button>
          </div>
        </section>
      </div>

      <div className="lg:col-span-1">
        <PetPreview />
      </div>
    </div>
  )
}
