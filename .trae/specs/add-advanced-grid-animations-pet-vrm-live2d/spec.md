# 高级九宫格交互界面升级 Spec

## Why
当前九宫格已实现基础 3×3 布局、三个核心面板（对话 / 实时 AI 视图 / 宠物）和简单的拖拽换位的骨架。为了匹配用户参考图所展示的全屏沉浸式工作区体验，需要将九宫格升级为具备高级过渡动画、类 Trae Work 实时跟随、支持 VRM/Live2D 模型的宠物交互、任务感知情绪反馈以及完整自定义能力的生产级交互界面。

## What Changes
- **BREAKING** 宠物存储结构扩展：新增角色卡、模型路径、自定义背景、字幕开关等字段；旧 `petStore` 中的 `character` 与 `background` 仍保持向后兼容读取，新增配置通过 `migratePetConfig` 自动合并。
- 增强左侧边栏「九宫格」入口的切换动画，使网格以全屏覆盖层形式进入/退出，并伴随缩放、模糊、错位网格展开（stagger）动画。
- 中下方 `ChatPanel` 增加「原界面缩小预览」切换、消息引用（quote）与回退（rollback）能力，保持与主对话 Store 的实时同步。
- 中间右侧 `AIViewPanel` 增加类 Trae Work 的实时跟随：高亮当前执行工具、实时渲染文件/命令结果、自动滚动与进度摘要。
- 正中间 `PetPanel` 升级：
  - 支持纯色/渐变/图片自定义背景，默认跟随应用主题色。
  - 允许导入本地 VRM 或 Live2D 模型并在面板内渲染。
  - 内置独立对话框，消息以字幕形式叠加在宠物上方。
  - 宠物 AI 实时获取中下方 ChatPanel 正在执行的任务名称与状态。
  - 任务执行期间若用户与宠物对话，宠物切换为 `annoyed` 情绪并提示「别烦我了，我正在执行 [具体任务名称] 任务」。
  - 接入 LLM 以根据对话内容实时驱动宠物动作（animation）与表情（expression）。
- 设置页新增「宠物与九宫格」设置区：角色卡编辑、人物形象（头像/模型）、自定义背景、字幕样式、布局重置。
- 完善九宫格拖拽布局自定义：增加占位面板选择菜单、面板最小化/恢复、布局预设持久化。
- 预留 6 个空槽位扩展接口：统一的 `GridPanelPlaceholder` 注册机制，使未来新面板只需实现组件并注册到 `gridStore`。

## Impact
- Affected specs: 对话系统、设置系统、主题系统、宠物系统、九宫格布局系统。
- Affected code:
  - `src/renderer/src/components/layout/AppLayout.tsx`
  - `src/renderer/src/components/layout/LeftSidebar.tsx`
  - `src/renderer/src/components/grid/GridLayout.tsx`
  - `src/renderer/src/components/grid/GridSlot.tsx`
  - `src/renderer/src/components/grid/GridPanelPlaceholder.tsx`
  - `src/renderer/src/components/grid/panels/ChatPanel.tsx`
  - `src/renderer/src/components/grid/panels/AIViewPanel.tsx`
  - `src/renderer/src/components/grid/panels/PetPanel.tsx`
  - `src/renderer/src/components/grid/panels/pet/PetDisplay.tsx`
  - `src/renderer/src/components/grid/panels/pet/PetChat.tsx`
  - `src/renderer/src/components/grid/panels/pet/PetCharacter.tsx`
  - 新增 `src/renderer/src/components/grid/panels/pet/PetSubtitles.tsx`
  - 新增 `src/renderer/src/components/grid/panels/pet/ModelRenderer.tsx`
  - 新增 `src/renderer/src/components/settings/PetSettings.tsx`
  - `src/renderer/src/stores/gridStore.ts`
  - `src/renderer/src/stores/petStore.ts`
  - `src/renderer/src/stores/chatStore.ts`
  - `src/shared/types/settings.ts`
  - `src/shared/types/ipc.ts`（如需要文件选择通道）

## ADDED Requirements

### Requirement 1: 全屏九宫格过渡动画
左侧边栏的「九宫格」按钮点击后，当前界面应平滑切换为覆盖整个应用主区域的全屏九宫格布局；再次点击或按 Esc 返回普通布局。

#### Scenario: 进入九宫格
- **WHEN** 用户点击左侧边栏「九宫格」按钮
- **THEN** 普通内容区域以 `scale: 1 → 0.96`、`opacity: 1 → 0`、`blur: 0 → 4px` 退出
- **AND** 九宫格以 `scale: 1.04 → 1`、`opacity: 0 → 1`、`blur: 4px → 0` 进入
- **AND** 9 个格子以 stagger（每个延迟 30ms）从 `scale: 0.9 / opacity: 0 / y: 10px` 展开到正常状态
- **AND** 过渡时长 450ms，缓动 `[0.16, 1, 0.3, 1]`

#### Scenario: 退出九宫格
- **WHEN** 用户再次点击「九宫格」按钮或按 Esc
- **THEN** 九宫格以进入动画的反向退出
- **AND** 普通界面恢复

### Requirement 2: 中下方对话面板增强
中下方格子固定为对话面板，需呈现主对话界面的缩小版本，并保留引用与回退能力。

#### Scenario: 缩小预览
- **WHEN** 用户进入九宫格
- **THEN** 中下方格子渲染缩小版对话流，字号缩小为正常对话的 75%，保留 Markdown、代码块、工具调用折叠的展示
- **AND** 用户仍可在此面板发送消息并触发主 Agent 流程

#### Scenario: 消息引用
- **WHEN** 用户在九宫格对话面板右键或 hover 点击某条消息的「引用」按钮
- **THEN** 该消息内容被引用到输入框，格式为 `> 引用内容\n`
- **AND** 主对话输入框同步显示该引用

#### Scenario: 回退到指定消息
- **WHEN** 用户点击某条消息的「回退到此处」菜单项
- **THEN** 从该消息之后的所有消息被删除
- **AND** ChatStore 的 `messages` 与数据库持久化状态同步回退

### Requirement 3: 中间右侧实时 AI 视图
中间右侧格子固定为实时查看窗口，实时反映 AI 当前操作与结果，类似 Trae Work 的实时跟随。

#### Scenario: 实时跟随 AI 操作
- **WHEN** Agent 调用工具时
- **THEN** 实时视图立即新增一条工作流条目，显示工具图标、名称、目标文件/命令
- **AND** 条目状态为 `running` 时显示脉冲动画与加载指示
- **AND** 工具返回后条目状态变为 `completed` 或 `error`，并显示结果摘要

#### Scenario: 实时渲染结果
- **WHEN** 工具返回图片、HTML 片段或文件差异时
- **THEN** 实时视图在对应条目下方展开结果预览区
- **AND** 图片以缩略图展示，代码差异以 MiniDiff 形式展示，文本以可折叠代码块展示

#### Scenario: 进度摘要
- **WHEN** 多个工具顺序或并行执行时
- **THEN** 面板顶部显示当前阶段标签（思考中 / 执行中 / 回复中）与已完成/总数计数

### Requirement 4: 正中间宠物窗口 — 自定义背景
正中间格子固定为宠物交互窗口，背景可自定义。

#### Scenario: 默认背景
- **WHEN** 用户未设置宠物背景
- **THEN** 背景使用应用当前主题的 `bg-gradient` 或主题色，跟随主题切换自动变化

#### Scenario: 自定义背景
- **WHEN** 用户在宠物设置中选择「自定义背景」
- **THEN** 可选择纯色、渐变或上传本地图片
- **AND** 背景实时生效，不阻塞渲染

### Requirement 5: 正中间宠物窗口 — VRM / Live2D 模型导入
宠物窗口支持导入并渲染本地 VRM 或 Live2D 模型。

#### Scenario: 导入 VRM 模型
- **WHEN** 用户在宠物设置中点击「导入 VRM 模型」并选择 `.vrm` 文件
- **THEN** 面板使用 `@pixiv/three-vrm` 或等效库加载并在宠物显示区渲染
- **AND** 加载失败时显示友好错误提示与重新选择入口

#### Scenario: 导入 Live2D 模型
- **WHEN** 用户在宠物设置中点击「导入 Live2D 模型」并选择包含 `model3.json` 的文件夹
- **THEN** 面板使用 `pixi-live2d-display` 或等效库加载并渲染
- **AND** 加载失败时显示友好错误提示

#### Scenario: 未导入模型
- **WHEN** 用户未导入任何模型
- **THEN** 使用现有 SVG 宠物角色（PetCharacter）作为 fallback

### Requirement 6: 正中间宠物窗口 — 独立对话与字幕
宠物拥有独立对话系统，消息以字幕形式显示在宠物上方。

#### Scenario: 开启字幕
- **WHEN** 用户与宠物对话或宠物主动说话时
- **THEN** 字幕以单行或多行形式显示在宠物头部上方，最多显示 2 行，超出滚动
- **AND** 字幕伴随淡入淡出与轻微弹跳动画

#### Scenario: 关闭字幕
- **WHEN** 用户在设置中关闭字幕
- **THEN** 仅保留折叠式聊天面板，不在宠物显示区叠加字幕

### Requirement 7: 正中间宠物窗口 — 任务感知
宠物 AI 需实时获取中下方九宫格正在执行的任务内容。

#### Scenario: 任务开始
- **WHEN** 中下方 ChatPanel 开始一次新的 Agent 回复或工具执行
- **THEN** 宠物 Store 的 `currentTaskName` 更新为当前任务描述（优先取最后一条 tool_call 的工具名映射，否则取「对话」）
- **AND** 宠物情绪切换为 `working`

#### Scenario: 任务结束
- **WHEN** Agent 回复结束且无运行中工具
- **THEN** `currentTaskName` 清空，宠物情绪在短暂 `happy` 后回到 `idle`

### Requirement 8: 正中间宠物窗口 — 任务期间不耐烦情绪
当用户在任务执行期间与宠物对话时，宠物表现出不耐烦。

#### Scenario: 任务期间被打扰
- **GIVEN** 当前 `currentTaskName` 不为空且宠物处于 `working` 或 `annoyed` 状态
- **WHEN** 用户向宠物发送消息
- **THEN** 宠物回复优先从 `annoyedMessages` 中选择，且必须包含当前任务名称，例如「别烦我了，我正在执行 [具体任务名称] 任务」
- **AND** 情绪切换为 `annoyed`，表情与动作同步变为烦躁（皱眉、抖动、蒸汽粒子）

### Requirement 9: 正中间宠物窗口 — AI 驱动动作与表情
接入 LLM，使宠物根据对话内容实时控制动作与表情。

#### Scenario: AI 控制动作
- **WHEN** 宠物回复用户消息时
- **THEN** 调用轻量 LLM（使用当前已配置的对话模型）生成一个 `animation` 与 `expression` 字段
- **AND** 字段值映射到宠物当前渲染器（SVG/VRM/Live2D）的可用动作/表情
- **AND** 如果生成值不在可用集合中，fallback 到 `idle`

#### Scenario: 表情映射
- **WHEN** 宠物情绪为 `happy / annoyed / working / sleeping / talking / idle` 之一
- **THEN** SVG 渲染器展示对应嘴型、眉毛、眼镜、粒子效果
- **AND** VRM/Live2D 渲染器在可用时触发对应 BlendShape / Expression

### Requirement 10: 设置页宠物与九宫格设置
在设置页新增「宠物与九宫格」分类，用于配置角色卡、人物形象、背景与布局。

#### Scenario: 角色卡编辑
- **WHEN** 用户进入设置 → 宠物与九宫格
- **THEN** 可编辑角色名、头像、性格描述、问候语、各类情绪语句池
- **AND** 修改后即时保存到 `petStore` 并持久化到 localStorage（通过 zustand persist）

#### Scenario: 人物形象设置
- **WHEN** 用户在人物形象区选择「默认 SVG / VRM / Live2D」
- **THEN** 对应导入入口出现，选择后实时生效

#### Scenario: 自定义背景设置
- **WHEN** 用户在背景设置中选择「跟随主题 / 纯色 / 渐变 / 图片」
- **THEN** 实时预览并保存

#### Scenario: 字幕与布局设置
- **WHEN** 用户开启/关闭字幕或选择字幕样式
- **THEN** 设置即时生效
- **AND** 提供「重置九宫格布局」按钮，恢复默认布局预设

### Requirement 11: 九宫格布局自定义
用户可调整各模块在九宫格中的位置。

#### Scenario: 拖拽换位
- **WHEN** 用户拖拽某个面板的标题栏到另一格子
- **THEN** 两个格子的面板互换
- **AND** 交换过程播放 200ms 弹性位移动画

#### Scenario: 占位面板选择
- **WHEN** 用户点击空槽位的「添加面板」按钮
- **THEN** 弹出可选面板菜单：对话、实时 AI 视图、宠物窗口
- **AND** 选择后该面板放置到空槽位（若该面板已存在，则原位置变空）

#### Scenario: 面板最小化
- **WHEN** 用户点击面板标题栏的「×」按钮
- **THEN** 该面板从当前格子移除，格子变为空槽位
- **AND** 被移除的核心面板可通过占位菜单重新放置

### Requirement 12: 性能与交互质量
确保复杂动画、实时渲染与模型加载不导致界面卡顿。

#### Scenario: 动画性能
- **WHEN** 进入/退出九宫格或拖拽换位时
- **THEN** 使用 `transform` 与 `opacity` 动画，避免触发 layout/paint
- **AND** 动画帧率目标 ≥ 55fps

#### Scenario: 模型渲染性能
- **WHEN** VRM/Live2D 模型运行时
- **THEN** 仅在宠物面板可见时渲染，隐藏时暂停渲染循环
- **AND** 模型加载在 Worker 或异步线程中进行，不阻塞主线程

#### Scenario: 即时交互
- **WHEN** 用户点击、拖拽、发送消息时
- **THEN** UI 在 100ms 内给出视觉反馈

## MODIFIED Requirements

### Requirement: 现有九宫格布局系统
现有 `GridLayout`、`GridSlot`、`GridPanelPlaceholder`、`gridStore` 需要扩展以支持：
- 空槽位面板选择菜单
- 面板最小化后恢复
- 更多布局预设与持久化
- 核心面板唯一性约束（`chat`、`aiView`、`pet` 全局各最多一个实例）

### Requirement: 现有宠物 Store
现有 `petStore` 需要扩展 `PetCharacter` 与配置字段，新增：
- `roleCard: string`（角色卡文本，用于 LLM system prompt）
- `avatarType: 'svg' | 'vrm' | 'live2d'`
- `modelPath: string | null`
- `subtitleEnabled: boolean`
- `subtitleStyle: 'bubble' | 'line'`
- `currentTaskName: string | null`
- `animations: string[]`（可用动作列表）
- `expressions: string[]`（可用表情列表）

## REMOVED Requirements
无。
