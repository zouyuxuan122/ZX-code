import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import type { PetCharacter } from '@/stores/petStore'
import userEvent from '@testing-library/user-event'

// ─── Mocks ──────────────────────────────────────────────

vi.mock('@/components/grid/panels/pet/PetCharacter', () => ({
  PetCharacter: () => <div data-testid="pet-character">Pet</div>,
}))

vi.mock('three', () => ({
  WebGLRenderer: vi.fn(function () {
    return {
      domElement: document.createElement('canvas'),
      setSize: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      setPixelRatio: vi.fn(),
    }
  }),
  Scene: vi.fn(function () {
    return { add: vi.fn(), remove: vi.fn() }
  }),
  PerspectiveCamera: vi.fn(function () {
    return {
      position: { set: vi.fn() },
      lookAt: vi.fn(),
      aspect: 1,
      updateProjectionMatrix: vi.fn(),
    }
  }),
  AmbientLight: vi.fn(function () {
    return {}
  }),
  DirectionalLight: vi.fn(function () {
    return { position: { set: vi.fn() } }
  }),
  Clock: vi.fn(function () {
    return { getDelta: vi.fn(() => 0.016) }
  }),
  Color: vi.fn(function () {
    return {}
  }),
}))

vi.mock('three/addons/loaders/GLTFLoader', () => ({
  GLTFLoader: vi.fn(function () {
    return {
      register: vi.fn(),
      load: vi.fn(),
    }
  }),
}))

vi.mock('@pixiv/three-vrm', () => ({
  VRMLoaderPlugin: vi.fn(),
  VRMUtils: {
    removeUnnecessaryVertices: vi.fn(),
    removeUnnecessaryJoints: vi.fn(),
  },
}))

// 共享的 ticker spy，用于断言 start/stop 调用
const tickerSpies = {
  start: vi.fn(),
  stop: vi.fn(),
}

// 共享的 renderer spy，用于断言 resize 调用
const rendererSpies = {
  resize: vi.fn(),
  on: vi.fn(),
}

// 共享的 app render spy，用于断言手动渲染（ticker 启动后立即渲染一帧）
const appRenderSpy = vi.fn()

// vi.hoisted 确保 TickerClass 在 vi.mock 提升后仍可访问
const { TickerClass } = vi.hoisted(() => ({
  // pixi.Ticker 类标记，用于断言 registerTicker 调用参数
  TickerClass: class Ticker {},
}))

vi.mock('pixi.js', () => ({
  Application: vi.fn(function () {
    return {
      view: document.createElement('canvas'),
      screen: { width: 300, height: 300 },
      stage: { addChild: vi.fn(), removeChild: vi.fn() },
      renderer: rendererSpies,
      ticker: tickerSpies,
      render: appRenderSpy,
      destroy: vi.fn(),
    }
  }),
  Ticker: TickerClass,
}))

// 共享的模型 spy，供行为测试断言调用情况
const modelSpies = {
  focus: vi.fn(),
  motion: vi.fn(),
  expression: vi.fn(),
  anchorSet: vi.fn(),
  scaleSet: vi.fn(),
}

// 共享的 registerTicker spy，用于断言 Ticker 注册
const registerTickerSpy = vi.fn()

vi.mock('pixi-live2d-display', () => ({
  Live2DModel: {
    registerTicker: registerTickerSpy,
    from: vi.fn(() =>
      Promise.resolve({
        anchor: { set: modelSpies.anchorSet },
        scale: { set: modelSpies.scaleSet },
        on: vi.fn(),
        autoUpdate: true,
        width: 2048,
        height: 2048,
        x: 0,
        y: 0,
        focus: modelSpies.focus,
        motion: modelSpies.motion,
        expression: modelSpies.expression,
        internalModel: { originalWidth: 2048, originalHeight: 2048 },
      }),
    ),
  },
}))

// 代码从 cubism4 子路径导入，需单独 mock
vi.mock('pixi-live2d-display/cubism4', () => ({
  Live2DModel: {
    registerTicker: registerTickerSpy,
    from: vi.fn(() =>
      Promise.resolve({
        anchor: { set: modelSpies.anchorSet },
        scale: { set: modelSpies.scaleSet },
        on: vi.fn(),
        autoUpdate: true,
        width: 2048,
        height: 2048,
        x: 0,
        y: 0,
        focus: modelSpies.focus,
        motion: modelSpies.motion,
        expression: modelSpies.expression,
        internalModel: { originalWidth: 2048, originalHeight: 2048 },
      }),
    ),
  },
}))

// ─── Store mock ─────────────────────────────────────────

interface MockPetState {
  character: PetCharacter
  pendingAnimation: string
  pendingExpression: string
  modelOffsetX: number
  modelOffsetY: number
  modelScale: number
  setModelOffsetX: ReturnType<typeof vi.fn>
  setModelOffsetY: ReturnType<typeof vi.fn>
  setModelScale: ReturnType<typeof vi.fn>
}

let mockState: MockPetState

vi.mock('@/stores/petStore', () => ({
  usePetStore: vi.fn((selector: (s: MockPetState) => unknown) => selector(mockState)),
  EMOTION_TO_MOTION_MAP: {
    happy: { motion: 'kaixin', expression: 'lianhong' },
    annoyed: { motion: 'shengqi', expression: 'shengqi' },
    working: { motion: 'jingya', expression: 'axy' },
    sleeping: { motion: 'shuijiao', expression: 'kuku' },
    talking: { motion: 'yaotou', expression: 'lianhong' },
    idle: { motion: 'idle', expression: 'none' },
  } as Record<string, { motion: string; expression: string }>,
}))

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader'
import { Application as PixiApplication } from 'pixi.js'
import {
  ModelRenderer,
  triggerLive2dMotion,
  resolveLive2dExpression,
  type Live2DModelLike,
} from '@/components/grid/panels/pet/ModelRenderer'
import { useGridStore } from '@/stores/gridStore'
import { fireEvent } from '@testing-library/react'

const baseCharacter: PetCharacter = {
  name: '小喵',
  avatar: '🐱',
  personality: '傲娇的小猫咪',
  greeting: '喵~',
  idleMessages: [],
  workingMessages: [],
  annoyedMessages: [],
  roleCard: '',
  avatarType: 'svg',
  modelPath: null,
  subtitleEnabled: true,
  subtitleStyle: 'bubble',
  animations: [],
  expressions: [],
}

describe('ModelRenderer avatarType switching', () => {
  beforeEach(() => {
    mockState = {
      character: { ...baseCharacter },
      pendingAnimation: 'idle',
      pendingExpression: 'neutral',
      modelOffsetX: 0,
      modelOffsetY: 0,
      modelScale: 1,
      setModelOffsetX: vi.fn(),
      setModelOffsetY: vi.fn(),
      setModelScale: vi.fn(),
    }
    global.ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      }
    }) as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders PetCharacter fallback when avatarType is svg', () => {
    render(<ModelRenderer />)
    expect(screen.getByTestId('pet-character')).toBeInTheDocument()
  })

  it('renders VRM renderer when avatarType is vrm and modelPath exists', async () => {
    mockState.character.avatarType = 'vrm'
    mockState.character.modelPath = 'app-asset:///models/test.vrm'

    render(<ModelRenderer />)
    expect(screen.getByTestId('vrm-renderer')).toBeInTheDocument()

    await waitFor(() => {
      expect(GLTFLoader).toHaveBeenCalled()
    })
  })

  it('renders Live2D renderer when avatarType is live2d and modelPath exists', async () => {
    mockState.character.avatarType = 'live2d'
    mockState.character.modelPath = 'app-asset:///models/live2d'

    render(<ModelRenderer />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('live2d-renderer')).toBeInTheDocument()
  })

  it('shows error prompt and retry button when VRM loading fails', async () => {
    mockState.character.avatarType = 'vrm'
    mockState.character.modelPath = 'app-asset:///models/broken.vrm'

    render(<ModelRenderer />)

    await waitFor(() => {
      expect(GLTFLoader).toHaveBeenCalled()
    })

    const loader = (GLTFLoader as unknown as ReturnType<typeof vi.fn>).mock.results[0]
      .value as { load: ReturnType<typeof vi.fn> }

    const loadCall = loader.load.mock.calls[0]
    const onError = loadCall[3] as (err: Error) => void

    await act(async () => {
      onError(new Error('failed to load vrm'))
    })

    expect(screen.getByText(/模型加载失败/i)).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /重新选择|重试/i })
    expect(retryBtn).toBeInTheDocument()

    await userEvent.click(retryBtn)
    await waitFor(() => {
      expect(GLTFLoader).toHaveBeenCalledTimes(2)
    })
  })
})

describe('Live2dRenderer 行为：动作、表情与视线跟随', () => {
  beforeEach(() => {
    mockState = {
      character: {
        ...baseCharacter,
        avatarType: 'live2d',
        modelPath: 'app-asset:///models/live2d/test',
        animations: ['jingya', 'kaixin', 'shengqi', 'shuijiao', 'wink', 'yaotou', 'idle'],
        expressions: ['axy', 'heilian', 'kuku', 'lianhong', 'shengqi', 'happy', 'neutral'],
      },
      pendingAnimation: 'idle',
      pendingExpression: 'neutral',
      modelOffsetX: 0,
      modelOffsetY: 0,
      modelScale: 1,
      setModelOffsetX: vi.fn(),
      setModelOffsetY: vi.fn(),
      setModelScale: vi.fn(),
    }
    useGridStore.setState({ isGridMode: true })
    global.ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      }
    }) as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  /** 等待 Live2D 模型加载完成（status === 'ready'） */
  async function waitForModelReady() {
    await act(async () => {
      // 刷新所有微任务（mock import 立即 resolve，但需多轮微任务传递）
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }

  it('鼠标在 canvas 上移动时应调用 model.focus 实现视线跟随', async () => {
    render(<ModelRenderer />)
    await waitForModelReady()

    const canvas = document.querySelector(
      '[data-testid="live2d-renderer"] canvas',
    ) as HTMLElement
    expect(canvas).toBeTruthy()

    modelSpies.focus.mockClear()
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 150 })

    expect(modelSpies.focus).toHaveBeenCalledTimes(1)
    // focus 参数为相对容器的坐标；jsdom getBoundingClientRect 返回 0，故等于 clientX/Y
    expect(modelSpies.focus).toHaveBeenCalledWith(200, 150)
  })

  it('pendingAnimation 变为 kaixin 时应触发 model.motion("", 1)', async () => {
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    // 初始 idle 不触发动作
    expect(modelSpies.motion).not.toHaveBeenCalled()

    // 切换到 kaixin 动作
    mockState.pendingAnimation = 'kaixin'
    rerender(<ModelRenderer />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(modelSpies.motion).toHaveBeenCalledWith('', 1)
  })

  it('pendingExpression 变为 happy 时应映射为 lianhong 调用 model.expression', async () => {
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    // 初始 neutral 不触发表情
    expect(modelSpies.expression).not.toHaveBeenCalled()

    // 切换到 happy 表情（映射为模型的 lianhong）
    mockState.pendingExpression = 'happy'
    rerender(<ModelRenderer />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(modelSpies.expression).toHaveBeenCalledWith('lianhong')
  })
})

// ─── 模型无关的动作/表情触发（查询模型实际 definitions） ───

describe('triggerLive2dMotion 模型无关触发', () => {
  function makeModel(overrides: Partial<Live2DModelLike> = {}): Live2DModelLike {
    return {
      anchor: { set: vi.fn() },
      scale: { set: vi.fn() },
      x: 0,
      y: 0,
      motion: vi.fn(),
      expression: vi.fn(),
      focus: vi.fn(),
      ...overrides,
    }
  }

  it('模型 definitions 含命名分组时应以分组名触发动作', () => {
    const model = makeModel({
      internalModel: {
        motionManager: {
          definitions: {
            tap_body: [{ File: 'motions/tap_body.motion3.json' }],
            kaixin: [{ File: 'motions/kaixin.motion3.json' }],
          },
        },
      },
    })
    triggerLive2dMotion(model, 'kaixin')
    expect(model.motion).toHaveBeenCalledWith('kaixin', 0)
  })

  it('动作名匹配 motion File 基名时应以正确的分组和索引触发', () => {
    const model = makeModel({
      internalModel: {
        motionManager: {
          definitions: {
            idle_group: [
              { File: 'motions/jingya.motion3.json' },
              { File: 'motions/kaixin.motion3.json' },
            ],
          },
        },
      },
    })
    // kaixin 不是分组名，但其 File 基名匹配
    triggerLive2dMotion(model, 'kaixin')
    expect(model.motion).toHaveBeenCalledWith('idle_group', 1)
  })

  it('无 definitions 时回退到硬编码 fense 索引', () => {
    const model = makeModel({
      internalModel: { originalWidth: 2048, originalHeight: 2048 },
    })
    triggerLive2dMotion(model, 'kaixin')
    expect(model.motion).toHaveBeenCalledWith('', 1)
  })

  it('idle 动作不触发 motion', () => {
    const model = makeModel({
      internalModel: {
        motionManager: { definitions: { tap_body: [{}] } },
      },
    })
    triggerLive2dMotion(model, 'idle')
    expect(model.motion).not.toHaveBeenCalled()
  })

  it('动作名在 definitions 中找不到时不触发 motion', () => {
    const model = makeModel({
      internalModel: {
        motionManager: {
          definitions: { tap_body: [{ File: 'motions/tap.motion3.json' }] },
        },
      },
    })
    triggerLive2dMotion(model, 'nonexistent')
    expect(model.motion).not.toHaveBeenCalled()
  })
})

describe('resolveLive2dExpression 模型无关解析', () => {
  function makeModel(overrides: Partial<Live2DModelLike> = {}): Live2DModelLike {
    return {
      anchor: { set: vi.fn() },
      scale: { set: vi.fn() },
      x: 0,
      y: 0,
      ...overrides,
    }
  }

  it('模型 definitions 无匹配表情名时返回 null（不触发随机表情）', () => {
    const model = makeModel({
      internalModel: {
        expressionManager: {
          definitions: [
            { Name: 'happy_expr' },
            { Name: 'angry_expr' },
          ],
        },
      },
    })
    // expression='happy' 经 EMOTION_TO_MOTION_MAP 映射为 'lianhong'，
    // 但模型没有 lianhong，回退查 'happy' 本身也不在 definitions 中。
    // 由于模型有 definitions 但无匹配项，应返回 null（不触发随机表情）
    const result = resolveLive2dExpression(model, 'happy')
    expect(result).toBeNull()
  })

  it('模型 definitions 含与映射名匹配的表情时返回该名称', () => {
    const model = makeModel({
      internalModel: {
        expressionManager: {
          definitions: [
            { Name: 'lianhong' },
            { Name: 'kuku' },
          ],
        },
      },
    })
    // expression='happy' → 映射为 'lianhong' → 模型有此表情
    const result = resolveLive2dExpression(model, 'happy')
    expect(result).toBe('lianhong')
  })

  it('无 definitions 时回退到硬编码 fense 表情列表', () => {
    const model = makeModel({
      internalModel: { originalWidth: 2048, originalHeight: 2048 },
    })
    // expression='happy' → 映射为 'lianhong' → 硬编码列表包含 'lianhong'
    const result = resolveLive2dExpression(model, 'happy')
    expect(result).toBe('lianhong')
  })

  it('expression 为 neutral 时返回 null', () => {
    const model = makeModel({
      internalModel: {
        expressionManager: { definitions: [{ Name: 'some_expr' }] },
      },
    })
    const result = resolveLive2dExpression(model, 'neutral')
    expect(result).toBeNull()
  })
})

// ─── 可见性切换：ticker 启停、布局重算、preserveDrawingBuffer ───

describe('Live2dRenderer 可见性切换', () => {
  beforeEach(() => {
    mockState = {
      character: {
        ...baseCharacter,
        avatarType: 'live2d',
        modelPath: 'app-asset:///models/live2d/test',
        animations: ['jingya', 'kaixin', 'shengqi', 'shuijiao', 'wink', 'yaotou', 'idle'],
        expressions: ['axy', 'heilian', 'kuku', 'lianhong', 'shengqi', 'happy', 'neutral'],
      },
      pendingAnimation: 'idle',
      pendingExpression: 'neutral',
      modelOffsetX: 0,
      modelOffsetY: 0,
      modelScale: 1,
      setModelOffsetX: vi.fn(),
      setModelOffsetY: vi.fn(),
      setModelScale: vi.fn(),
    }
    // 默认不可见（模拟应用启动时的状态）
    useGridStore.setState({ isGridMode: false })
    global.ResizeObserver = vi.fn(function () {
      return {
        observe: vi.fn(),
        disconnect: vi.fn(),
        unobserve: vi.fn(),
      }
    }) as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // 恢复默认状态
    useGridStore.setState({ isGridMode: false })
  })

  /** 等待 Live2D 模型加载完成（status === 'ready'） */
  async function waitForModelReady() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }

  it('PIXI Application 应以 preserveDrawingBuffer:true 创建，防止 ticker 停止后画布被清空', async () => {
    render(<ModelRenderer />)
    await waitForModelReady()

    const calls = (PixiApplication as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(0)
    const options = calls[calls.length - 1][0] as Record<string, unknown>
    expect(options.preserveDrawingBuffer).toBe(true)
  })

  it('模型加载完成时 isVisible=false 应调用 ticker.stop()', async () => {
    render(<ModelRenderer />)
    await waitForModelReady()

    expect(tickerSpies.stop).toHaveBeenCalled()
  })

  it('isVisible 从 false 变为 true 时应调用 ticker.start() 恢复渲染', async () => {
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    // 加载完成时 ticker 被停止
    expect(tickerSpies.stop).toHaveBeenCalled()
    tickerSpies.start.mockClear()
    tickerSpies.stop.mockClear()

    // 进入九宫格模式
    await act(async () => {
      useGridStore.setState({ isGridMode: true })
      rerender(<ModelRenderer />)
      await Promise.resolve()
    })

    expect(tickerSpies.start).toHaveBeenCalled()
  })

  it('isVisible 从 false 变为 true 时应重新布局模型（调用 scale.set）', async () => {
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    // 清除加载过程中的 scale.set 调用
    modelSpies.scaleSet.mockClear()

    // 进入九宫格模式
    await act(async () => {
      useGridStore.setState({ isGridMode: true })
      rerender(<ModelRenderer />)
      await Promise.resolve()
    })

    // 可见性变化时应重新调用 scale.set 进行布局
    expect(modelSpies.scaleSet).toHaveBeenCalled()
  })

  it('isVisible 从 false 变为 true 时应手动 resize 画布以匹配容器尺寸', async () => {
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    // 清除加载过程中的 resize 调用
    rendererSpies.resize.mockClear()

    // 模拟容器有有效尺寸（jsdom 默认 clientWidth/Height 为 0）
    const container = document.querySelector('[data-testid="live2d-renderer"]') as HTMLElement
    expect(container).toBeTruthy()
    const originalW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(container, 'clientWidth', { configurable: true, get: () => 300 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, get: () => 300 })

    // 进入九宫格模式
    await act(async () => {
      useGridStore.setState({ isGridMode: true })
      rerender(<ModelRenderer />)
      await Promise.resolve()
    })

    // 可见性恢复时应手动 resize，确保画布尺寸与容器匹配
    // （resizeTo 的 ResizeObserver 在 ticker 停止期间无法处理尺寸变更）
    expect(rendererSpies.resize).toHaveBeenCalledWith(300, 300)

    // 恢复
    if (originalW) Object.defineProperty(container, 'clientWidth', originalW)
    if (originalH) Object.defineProperty(container, 'clientHeight', originalH)
  })

  it('加载 Live2D 模型前应调用 Live2DModel.registerTicker(PIXI.Ticker) 注册共享 ticker', async () => {
    // autoUpdate 依赖 tickerRef，来源为 window.PIXI.Ticker 或 registerTicker(Ticker)。
    // 不注册则 autoUpdate 始终为 false，模型内部动画（呼吸、眨眼、视线）完全不运行。
    render(<ModelRenderer />)
    await waitForModelReady()

    expect(registerTickerSpy).toHaveBeenCalled()
    expect(registerTickerSpy).toHaveBeenCalledWith(TickerClass)
  })

  it('isVisible 恢复为 true 时应手动调用 app.render() 立即渲染一帧（防止 ticker 启动延迟期间画布空白）', async () => {
    // Bug 4 根因：退出九宫格→打开设置→离开设置→重新进入九宫格
    // ticker.stop() 期间画布可能被 resize/上下文操作清空，
    // ticker.start() 后下一帧 render 才执行，中间存在空白窗口。
    // 修复：ticker.start() 后手动调用 app.render() 立即渲染一帧。
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    appRenderSpy.mockClear()

    await act(async () => {
      useGridStore.setState({ isGridMode: true })
      rerender(<ModelRenderer />)
      await Promise.resolve()
    })

    expect(tickerSpies.start).toHaveBeenCalled()
    // 手动渲染一帧，确保可见性恢复后模型立即显示
    expect(appRenderSpy).toHaveBeenCalled()
  })

  it('isVisible 恢复时若容器尺寸为 0 不应 resize 到 0x0（避免画布被清空导致模型不可见）', async () => {
    // Bug 4 根因：重新进入九宫格时容器正在过渡动画中，clientWidth/Height 可能为 0。
    // 此时 resize(0, 0) 会导致 WebGL 画布尺寸归零，模型不可见。
    // 修复：resize 前检查尺寸 > 0，为 0 时跳过（由 ResizeObserver 后续处理）。
    const { rerender } = render(<ModelRenderer />)
    await waitForModelReady()

    rendererSpies.resize.mockClear()

    // 模拟容器在过渡动画中尺寸为 0
    const container = document.querySelector('[data-testid="live2d-renderer"]') as HTMLElement
    expect(container).toBeTruthy()
    const originalW = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    const originalH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(container, 'clientWidth', { configurable: true, get: () => 0 })
    Object.defineProperty(container, 'clientHeight', { configurable: true, get: () => 0 })

    await act(async () => {
      useGridStore.setState({ isGridMode: true })
      rerender(<ModelRenderer />)
      await Promise.resolve()
    })

    // 不应调用 resize(0, 0)
    const resizeCalls = rendererSpies.resize.mock.calls
    const zeroResizeCall = resizeCalls.find(
      (call: unknown[]) => call[0] === 0 && call[1] === 0,
    )
    expect(zeroResizeCall).toBeUndefined()

    // 恢复
    if (originalW) Object.defineProperty(container, 'clientWidth', originalW)
    if (originalH) Object.defineProperty(container, 'clientHeight', originalH)
  })
})
