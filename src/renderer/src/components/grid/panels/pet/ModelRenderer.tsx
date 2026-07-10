import { useCallback, useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import type { VRMLoaderPlugin } from '@pixiv/three-vrm'
import { usePetStore, EMOTION_TO_MOTION_MAP } from '@/stores/petStore'
import { useGridStore } from '@/stores/gridStore'
import { PetCharacter } from './PetCharacter'
import { toAppAssetUrl } from '@/utils/appAsset'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

type GLTFParserLike = ConstructorParameters<typeof VRMLoaderPlugin>[0]

interface GLTFLoaderLike {
  new (): GLTFLoaderLike
  register(plugin: (parser: GLTFParserLike) => unknown): void
  load(
    url: string,
    onLoad: (gltf: { userData: { vrm?: { scene: THREE.Object3D; update: (delta: number) => void } } }) => void,
    onProgress?: (event: unknown) => void,
    onError?: (error: unknown) => void,
  ): void
}

interface ModelLoadErrorProps {
  message: string
  onRetry: () => void
}

function ModelLoadError({ message, onRetry }: ModelLoadErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-sm text-red-400">{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
      >
        重试
      </button>
    </div>
  )
}

// ─── VRM Renderer ───────────────────────────────────────

interface VrmRendererProps {
  modelPath: string | null
  animation: string
  expression: string
  isVisible: boolean
}

function VrmRenderer({ modelPath, animation, expression, isVisible }: VrmRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<unknown>(null)
  const sceneRef = useRef<unknown>(null)
  const cameraRef = useRef<unknown>(null)
  const vrmRef = useRef<unknown>(null)
  const rafRef = useRef<number | null>(null)
  const isVisibleRef = useRef(isVisible)
  const animateRef = useRef<(() => void) | null>(null)
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [retryKey, setRetryKey] = useState(0)

  const handleRetry = useCallback(() => {
    setStatus('loading')
    setRetryKey((k) => k + 1)
  }, [])

  // 同步 isVisible 到 ref，供 animate 循环读取最新值
  useEffect(() => {
    isVisibleRef.current = isVisible
  }, [isVisible])

  // 可见性监听：宠物面板不可见时暂停 rAF 循环，可见时恢复
  useEffect(() => {
    if (status !== 'ready') return
    if (isVisible) {
      // 恢复：仅在 rAF 已停止时重新启动
      if (rafRef.current === null && animateRef.current) {
        animateRef.current()
      }
    } else {
      // 暂停：取消当前 rAF
      if (rafRef.current !== null) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafRef.current)
        } else {
          clearTimeout(rafRef.current)
        }
        rafRef.current = null
      }
    }
  }, [isVisible, status])

  useEffect(() => {
    if (!modelPath) {
      setStatus('error')
      return
    }

    const container = containerRef.current
    if (!container) return

    setStatus('loading')
    let disposed = false

    ;(async () => {
      try {
        const THREE = await import('three')
        // @ts-expect-error @types/three does not expose the addons subpath types
        const { GLTFLoader } = (await import('three/addons/loaders/GLTFLoader')) as { GLTFLoader: GLTFLoaderLike }
        const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm')
        if (disposed) return

        const scene = new THREE.Scene()
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(
          30,
          container.clientWidth / (container.clientHeight || 1),
          0.1,
          1000,
        )
        camera.position.set(0, 1.2, 3.5)
        camera.lookAt(0, 1, 0)
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          powerPreference: 'low-power',
        })
        renderer.setSize(container.clientWidth, container.clientHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer

        const ambient = new THREE.AmbientLight(0xffffff, 0.6)
        scene.add(ambient)
        const directional = new THREE.DirectionalLight(0xffffff, 1)
        directional.position.set(1, 1, 1)
        scene.add(directional)

        const loader = new GLTFLoader()
        loader.register((parser) => new VRMLoaderPlugin(parser))

        const clock = new THREE.Clock()

        loader.load(
          toAppAssetUrl(modelPath),
          (gltf) => {
            if (disposed) return
            const vrm = gltf.userData.vrm
            if (!vrm) {
              setStatus('error')
              return
            }
            const sceneRoot = vrm.scene
            VRMUtils.removeUnnecessaryVertices(sceneRoot)
            VRMUtils.removeUnnecessaryJoints(sceneRoot)
            scene.add(sceneRoot)
            vrmRef.current = vrm
            setStatus('ready')

            const animate = () => {
              if (disposed || !isVisibleRef.current) {
                rafRef.current = null
                return
              }
              const delta = clock.getDelta()
              if (vrmRef.current) {
                const v = vrmRef.current as { update: (d: number) => void; scene: { rotation: { y: number } } }
                v.update(delta)
                v.scene.rotation.y += delta * 0.5
              }
              const cam = cameraRef.current as { aspect: number; updateProjectionMatrix: () => void } | null
              const ren = rendererRef.current as { render: (s: unknown, c: unknown) => void } | null
              if (cam && ren) {
                ren.render(scene, cameraRef.current)
              }
              rafRef.current =
                typeof requestAnimationFrame === 'function'
                  ? requestAnimationFrame(animate)
                  : window.setTimeout(animate, 16)
            }
            animateRef.current = animate
            // 仅在可见时启动渲染循环
            if (isVisibleRef.current) {
              animate()
            }
          },
          undefined,
          () => {
            if (disposed) return
            setStatus('error')
          },
        )

        const observer = new ResizeObserver(() => {
          const cam = cameraRef.current as { aspect: number; updateProjectionMatrix: () => void } | null
          const ren = rendererRef.current as { setSize: (w: number, h: number) => void } | null
          if (!container || !cam || !ren) return
          const width = container.clientWidth
          const height = container.clientHeight
          cam.aspect = width / (height || 1)
          cam.updateProjectionMatrix()
          ren.setSize(width, height)
        })
        observer.observe(container)
      } catch {
        if (disposed) return
        setStatus('error')
      }
    })()

    return () => {
      disposed = true
      if (rafRef.current) {
        if (typeof cancelAnimationFrame === 'function') {
          cancelAnimationFrame(rafRef.current)
        } else {
          clearTimeout(rafRef.current)
        }
      }
      rafRef.current = null
      animateRef.current = null
      const renderer = rendererRef.current as { dispose: () => void; domElement: Node } | null
      const containerEl = containerRef.current
      if (renderer) {
        renderer.dispose()
        if (containerEl && renderer.domElement.parentNode === containerEl) {
          containerEl.removeChild(renderer.domElement)
        }
      }
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      vrmRef.current = null
    }
  }, [modelPath, retryKey])

  // 应用 AI 驱动的动作与表情到 VRM BlendShape
  useEffect(() => {
    if (status !== 'ready') return
    const vrm = vrmRef.current as {
      expressionManager?: {
        setValue?: (name: string, value: number) => void
        update?: () => void
      }
    } | null
    if (!vrm?.expressionManager) return

    const manager = vrm.expressionManager
    if (typeof manager.setValue === 'function') {
      // 重置常见表情
      ;['neutral', 'happy', 'angry', 'surprised', 'sleepy'].forEach((expr) => {
        manager.setValue!(expr, 0)
      })
      // 设置目标表情
      manager.setValue(expression, 1)
      if (typeof manager.update === 'function') {
        manager.update()
      }
    }
  }, [status, expression])

  useEffect(() => {
    if (status !== 'ready') return
    const vrm = vrmRef.current as {
      scene?: { rotation: { y: number }; position: { y: number } }
    } | null
    if (!vrm?.scene) return

    // 简单动画映射：通过模型旋转/位移表现 wave/jump/angry
    if (animation === 'wave') {
      vrm.scene.rotation.y += 0.2
    } else if (animation === 'jump') {
      vrm.scene.position.y = 0.1
      setTimeout(() => {
        if (vrm.scene) vrm.scene.position.y = 0
      }, 300)
    } else if (animation === 'angry') {
      vrm.scene.rotation.y += 0.05
    }
  }, [status, animation])

  if (status === 'error') {
    return (
      <div
        ref={containerRef}
        data-testid="vrm-renderer"
        className="relative flex h-full w-full items-center justify-center"
      >
        <ModelLoadError
          message={modelPath ? '模型加载失败，请检查文件路径或格式。' : '未选择 VRM 模型文件。'}
          onRetry={handleRetry}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="vrm-renderer"
      className="relative h-full w-full"
      aria-busy={status === 'loading'}
    >
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-white/60">加载 VRM 模型中...</span>
        </div>
      )}
    </div>
  )
}

// ─── Live2D Renderer ────────────────────────────────────

interface Live2dRendererProps {
  modelPath: string | null
  animation: string
  expression: string
  isVisible: boolean
}

/**
 * fense.model3.json 中所有动作均位于空字符串分组 "" 下（按声明顺序排列），
 * 因此无法通过 model.motion('kaixin') 这类「命名分组」方式触发。
 * 这里将动作名映射到其在空分组中的索引，调用 model.motion('', index) 触发。
 */
const LIVE2D_MOTION_INDICES: Record<string, number> = {
  jingya: 0,
  kaixin: 1,
  shengqi: 2,
  shuijiao: 3,
  wink: 4,
  yaotou: 5,
}

/** 模型实际定义的表情名（model3.json FileReferences.Expressions.Name） */
const LIVE2D_MODEL_EXPRESSIONS = ['axy', 'heilian', 'kuku', 'lianhong', 'shengqi']

export interface Live2DModelLike {
  width?: number
  height?: number
  anchor: { set: (x: number, y: number) => void }
  scale: { set: (x: number, y: number) => void }
  x: number
  y: number
  motion?: (group: string, index?: number, priority?: number) => void
  expression?: (name: string | number) => void
  focus?: (x: number, y: number) => void
  internalModel?: {
    originalWidth?: number
    originalHeight?: number
    motionManager?: {
      definitions?: Record<string, Array<{ File?: string }>>
    }
    expressionManager?: {
      definitions?: Array<{ Name: string }>
    }
  }
}

function resolveLive2dSettingsUrl(modelPath: string): string {
  if (/\.(json|model3\.json|model\.json)$/i.test(modelPath)) {
    return modelPath
  }
  return modelPath.replace(/\/?$/, '/model3.json')
}

/**
 * 将 pendingExpression（可能是通用情绪名或模型表情名）解析为模型实际可用的表情名。
 * 优先查询模型 expressionManager.definitions 获取实际可用表情名；
 * 无 definitions 时回退到硬编码 fense 表情列表。
 * 无效值 fallback 到 null（不触发表情，等价于 idle）。
 */
export function resolveLive2dExpression(model: Live2DModelLike, expression: string): string | null {
  const mapped = EMOTION_TO_MOTION_MAP[expression]
  const targetName = mapped ? mapped.expression : expression
  if (!targetName || targetName === 'none') return null

  const definitions = model.internalModel?.expressionManager?.definitions
  if (definitions && definitions.length > 0) {
    // 1. 尝试映射后的表情名
    const exact = definitions.find((d) => d.Name === targetName)
    if (exact) return exact.Name
    // 2. 尝试原始 expression 名（映射名与原始名不同时）
    if (expression !== targetName) {
      const orig = definitions.find((d) => d.Name === expression)
      if (orig) return orig.Name
    }
    // 3. 模型有 definitions 但无匹配项 → 不触发随机表情
    return null
  }

  // 4. 回退：硬编码 fense 表情列表
  if (LIVE2D_MODEL_EXPRESSIONS.includes(targetName)) return targetName
  if (LIVE2D_MODEL_EXPRESSIONS.includes(expression)) return expression
  return null
}

/**
 * 触发 Live2D 动作。优先查询模型 motionManager.definitions 获取实际可用动作分组：
 * 1. 动作名作为分组名直接匹配
 * 2. 动作名匹配某分组下 motion File 的基名
 * 无 definitions 时回退到硬编码 fense 索引。
 * 'idle' 不触发动作。无效值忽略。
 */
export function triggerLive2dMotion(model: Live2DModelLike, animation: string): void {
  if (!animation || animation === 'idle') return
  if (typeof model.motion !== 'function') return

  const definitions = model.internalModel?.motionManager?.definitions
  if (definitions) {
    // 1. 动作名作为分组名
    if (definitions[animation] && definitions[animation].length > 0) {
      try {
        model.motion(animation, 0)
        return
      } catch {
        // 模型可能不包含该动作，忽略
      }
    }
    // 2. 搜索所有分组，匹配 motion File 基名（如 "motions/kaixin.motion3.json" → "kaixin"）
    for (const [group, motions] of Object.entries(definitions)) {
      const idx = motions.findIndex(
        (m) => typeof m.File === 'string' && m.File.includes(`/${animation}.`),
      )
      if (idx >= 0) {
        try {
          model.motion(group, idx)
          return
        } catch {
          // 忽略
        }
      }
    }
    // 3. definitions 中找不到 → 不触发随机动作
    return
  }

  // 4. 回退：硬编码 fense 索引（动作在空分组下，按声明顺序排列）
  const index = LIVE2D_MOTION_INDICES[animation]
  try {
    if (index !== undefined) {
      model.motion('', index)
    } else {
      // 最后回退：尝试将动作名作为分组名直接触发
      model.motion(animation)
    }
  } catch {
    // 模型可能不包含该动作，忽略
  }
}

function Live2dRenderer({ modelPath, animation, expression, isVisible }: Live2dRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const appRef = useRef<unknown>(null)
  const modelRef = useRef<Live2DModelLike | null>(null)
  const modelOffsetX = usePetStore((s) => s.modelOffsetX)
  const modelOffsetY = usePetStore((s) => s.modelOffsetY)
  const modelScale = usePetStore((s) => s.modelScale)
  const setModelOffsetX = usePetStore((s) => s.setModelOffsetX)
  const setModelOffsetY = usePetStore((s) => s.setModelOffsetY)
  const setModelScale = usePetStore((s) => s.setModelScale)
  // 用 ref 保存最新的偏移量和缩放，供 layoutModel 闭包读取，避免将其纳入 load effect 依赖
  const modelOffsetXRef = useRef(modelOffsetX)
  const modelOffsetYRef = useRef(modelOffsetY)
  const modelScaleRef = useRef(modelScale)
  useEffect(() => {
    modelOffsetXRef.current = modelOffsetX
  }, [modelOffsetX])
  useEffect(() => {
    modelOffsetYRef.current = modelOffsetY
  }, [modelOffsetY])
  useEffect(() => {
    modelScaleRef.current = modelScale
  }, [modelScale])
  const [status, setStatus] = useState<LoadStatus>('idle')
  const [retryKey, setRetryKey] = useState(0)

  const handleRetry = useCallback(() => {
    setStatus('loading')
    setRetryKey((k) => k + 1)
  }, [])

  /**
   * 重新计算模型缩放与位置。
   * 使用 internalModel.originalWidth/Height 获取模型原始尺寸（不受 scale 影响），
   * 避免 model.width/height 的反馈循环。
   * 通过 ref 读取偏移量和缩放，使本回调不依赖 modelOffsetX/Y/Scale，
   * 从而避免拖动时 layoutModel 重建触发 load effect 重跑。
   */
  const layoutModel = useCallback(() => {
    const app = appRef.current as { screen?: { width: number; height: number } } | null
    const model = modelRef.current
    const container = containerRef.current
    if (!app?.screen || !model || !container) return

    // app.screen 可能为 0（容器未布局时），回退到容器尺寸
    const width = app.screen.width || container.clientWidth || 1
    const height = app.screen.height || container.clientHeight || 1
    // 使用 internalModel.originalWidth/Height 获取模型真实尺寸（不受 scale 影响）
    const modelWidth = model.internalModel?.originalWidth ?? model.width ?? 1
    const modelHeight = model.internalModel?.originalHeight ?? model.height ?? 1

    // 等比缩放：取宽高比中较小值，确保模型完整可见不变形
    const fitScale = Math.min(width / modelWidth, height / modelHeight) * 0.9
    // 用户可通过滚轮在 0.3~3.0 范围内额外放大/缩小
    model.scale.set(fitScale * modelScaleRef.current, fitScale * modelScaleRef.current)
    model.anchor.set(0.5, 0.5)
    // 水平位置由 modelOffsetX 控制（-1 ~ 1 → 屏幕宽度的 ±40%）
    model.x = width / 2 + modelOffsetXRef.current * width * 0.4
    // 垂直位置由 modelOffsetY 控制（-1 ~ 1 → 屏幕高度的 ±40%）
    // 正值下移 → 模型底部可被下方格子遮挡（如窗前人影）
    model.y = height / 2 + modelOffsetYRef.current * height * 0.4
  }, [])

  // modelOffsetX/Y/Scale 变化时重新布局（不重载模型）
  // isVisible 也作为依赖：进入九宫格模式时容器可能经历了尺寸变化，
  // 需要重新计算缩放与位置，防止模型因初始 0x0 尺寸而不可见
  useEffect(() => {
    if (status !== 'ready') return
    layoutModel()
  }, [status, modelOffsetX, modelOffsetY, modelScale, layoutModel, isVisible])

  // 可见性监听：宠物面板不可见时暂停 Pixi ticker，可见时恢复
  useEffect(() => {
    if (status !== 'ready') return
    const app = appRef.current as {
      ticker?: { stop: () => void; start: () => void }
      renderer?: { resize: (w: number, h: number) => void }
      render?: () => void
    } | null
    if (!app?.ticker) return
    if (isVisible) {
      // 重新可见时手动 resize 画布以匹配容器当前尺寸。
      // resizeTo 的 ResizeObserver 在 ticker 停止期间无法处理尺寸变更，
      // 导致画布尺寸停留在停止前的旧值，模型会被错误缩放和定位。
      const container = containerRef.current
      if (container && app.renderer) {
        // 防止容器在过渡动画中尺寸为 0 时 resize 到 0x0，
        // 否则 WebGL 画布尺寸归零、模型不可见（Bug 4：退出九宫格→设置→返回后模型消失）
        const w = container.clientWidth
        const h = container.clientHeight
        if (w > 0 && h > 0) {
          app.renderer.resize(w, h)
        }
      }
      app.ticker.start()
      // 手动渲染一帧，确保可见性恢复后模型立即显示。
      // ticker.stop() 期间画布可能被 resize / 上下文操作清空，
      // ticker.start() 后下一帧 render 才执行，中间存在空白窗口导致模型「消失」。
      if (typeof app.render === 'function') {
        try {
          app.render()
        } catch {
          // 渲染失败忽略，ticker 会继续渲染后续帧
        }
      }
    } else {
      app.ticker.stop()
    }
  }, [isVisible, status])

  useEffect(() => {
    if (!modelPath) {
      setStatus('error')
      return
    }

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    setStatus('loading')
    let disposed = false

    ;(async () => {
      try {
        const pixi = await import('pixi.js')
        // 必须从 cubism4 子路径导入，以包含 Live2D Cubism 4 Core 运行时
        const live2d = await import('pixi-live2d-display/cubism4')
        if (disposed) return

        // 注册 PIXI Ticker 到 Live2DModel，使 autoUpdate 能使用 Ticker.shared
        // 驱动模型内部动画（呼吸、眨眼、视线跟随等）。
        // 不注册则 tickerRef 为空，autoUpdate 始终为 false，模型会完全卡住。
        live2d.Live2DModel.registerTicker(pixi.Ticker)

        const app = new pixi.Application({
          view: canvas,
          resizeTo: container,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio, 2),
          autoDensity: true,
          // ticker 停止后 WebGL 默认会清空绘图缓冲区，导致画布透明。
          // 设置为 true 保留最后一帧，即使 ticker 暂停模型仍然可见。
          preserveDrawingBuffer: true,
        })
        appRef.current = app

        // 监听渲染器 resize，重新布局模型（修复容器初始 0x0 的问题）
        app.renderer.on('resize', () => {
          if (!disposed) layoutModel()
        })

        const Live2DModel = live2d.Live2DModel
        const settingsUrl = resolveLive2dSettingsUrl(modelPath)
        // 路径含中文与特殊字符，需转换为 app-asset:// URL 并 encodeURI
        const fileUrl = toAppAssetUrl(settingsUrl)
        const model = (await Live2DModel.from(fileUrl)) as Live2DModelLike
        if (disposed) return

        app.stage.addChild(model as unknown as typeof app.stage.children[number])
        modelRef.current = model
        // 立即布局一次（此时容器可能已布局完成）
        layoutModel()
        // physics3.json 由 pixi-live2d-display 根据 model3.json 的 FileReferences.Physics 自动加载
        setStatus('ready')
      } catch {
        if (disposed) return
        setStatus('error')
      }
    })()

    return () => {
      disposed = true
      const app = appRef.current as { destroy: (removeView: boolean, options: Record<string, boolean>) => void } | null
      if (app) {
        // 不让 Pixi 移除 React 管理的 canvas（removeView=false），
        // 避免 "removeChild: The node to be removed is not a child of this node" 错误。
        // canvas 的生命周期由 React 通过 ref 管理，卸载时 React 会自行移除。
        app.destroy(false, { children: true, texture: true, baseTexture: true })
      }
      appRef.current = null
      modelRef.current = null
    }
    // layoutModel 通过 ref 读取 modelOffsetX，本身稳定，无需作为依赖
  }, [modelPath, retryKey, layoutModel])

  // 用户拖动模型水平 + 垂直移动
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const startOffsetX = modelOffsetX
    const startOffsetY = modelOffsetY
    const container = containerRef.current
    const containerWidth = container?.clientWidth || 1
    const containerHeight = container?.clientHeight || 1

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      // 像素偏移转换为 -1 ~ 1 范围（与 layoutModel 中的 0.4 系数对应）
      setModelOffsetX(startOffsetX + dx / (containerWidth * 0.4))
      setModelOffsetY(startOffsetY + dy / (containerHeight * 0.4))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [modelOffsetX, modelOffsetY, setModelOffsetX, setModelOffsetY])

  // 鼠标滚轮缩放模型
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    // deltaY > 0 向下滚 → 缩小；deltaY < 0 向上滚 → 放大
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setModelScale(modelScaleRef.current + delta)
  }, [setModelScale])

  // 视线跟随鼠标（仅非拖动时）
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const model = modelRef.current
    if (!model || typeof model.focus !== 'function') return
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    // 将鼠标坐标转换为模型舞台坐标
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    model.focus(x, y)
  }, [])

  // 应用 AI 驱动的表情与动作到 Live2D 模型
  useEffect(() => {
    if (status !== 'ready') return
    const model = modelRef.current
    if (!model) return

    // 表情：先查 EMOTION_TO_MOTION_MAP 转换为模型表情名，无效值 fallback 到 idle（不触发）
    const expressionName = resolveLive2dExpression(model, expression)
    if (expressionName && typeof model.expression === 'function') {
      try {
        model.expression(expressionName)
      } catch {
        // 模型可能不包含该表情，忽略
      }
    }

    // 动作：fense 模型动作在空分组下，按索引触发；idle 不触发动作
    triggerLive2dMotion(model, animation)
  }, [status, expression, animation])

  if (status === 'error') {
    return (
      <div
        ref={containerRef}
        data-testid="live2d-renderer"
        className="relative flex h-full w-full items-center justify-center"
      >
        <ModelLoadError
          message={modelPath ? 'Live2D 模型加载失败，请检查模型文件路径。' : '未选择 Live2D 模型文件。'}
          onRetry={handleRetry}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="live2d-renderer"
      className="relative h-full w-full"
      aria-busy={status === 'loading'}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onWheel={handleWheel}
        className="block h-full w-full cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      />
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-white/60">加载 Live2D 模型中...</span>
        </div>
      )}
    </div>
  )
}

// ─── Public Renderer ────────────────────────────────────

interface ModelRendererProps {
  /** 是否可见；未传时默认跟随九宫格模式。设置页预览传 true 以始终渲染。 */
  isVisible?: boolean
}

export function ModelRenderer({ isVisible }: ModelRendererProps = {}) {
  const character = usePetStore((s) => s.character)
  const pendingAnimation = usePetStore((s) => s.pendingAnimation)
  const pendingExpression = usePetStore((s) => s.pendingExpression)
  // 九宫格关闭时宠物面板不可见，暂停模型渲染循环以节省 GPU/CPU；
  // 设置页预览通过 isVisible={true} 强制始终可见
  const gridVisible = useGridStore((s) => s.isGridMode)
  const visible = isVisible ?? gridVisible

  switch (character.avatarType) {
    case 'vrm':
      return (
        <VrmRenderer
          modelPath={character.modelPath}
          animation={pendingAnimation}
          expression={pendingExpression}
          isVisible={visible}
        />
      )
    case 'live2d':
      return (
        <Live2dRenderer
          modelPath={character.modelPath}
          animation={pendingAnimation}
          expression={pendingExpression}
          isVisible={visible}
        />
      )
    case 'svg':
    default:
      return <PetCharacter />
  }
}
