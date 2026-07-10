# Tasks

- [x] **Task 1: 扩展 petStore 与 gridStore 数据模型**
  - [x] SubTask 1.1: 在 `petStore.ts` 扩展 `PetCharacter` 类型，新增 `roleCard`、`avatarType`、`modelPath`、`subtitleEnabled`、`subtitleStyle`、`animations`、`expressions` 字段。
  - [x] SubTask 1.2: 在 `petStore.ts` 新增 `currentTaskName` 状态与 `setCurrentTaskName` 方法。
  - [x] SubTask 1.3: 为 `petStore.ts` 添加 `migratePetConfig` 函数，自动合并旧配置到新的完整配置。
  - [x] SubTask 1.4: 在 `gridStore.ts` 新增 `removeSlot`、`setSlot`、`getPanelIndex`、`ensureUniquePanel` 方法，保证核心面板全局唯一。
  - [x] SubTask 1.5: 为 `gridStore.ts` 新增 2-3 个额外布局预设（`focus-pet`、`classic`）。
  - [x] SubTask 1.6: 编写 `petStore.test.ts` 与 `gridStore.test.ts`，验证新增字段与唯一性约束。

- [x] **Task 2: 实现全屏九宫格进入/退出过渡动画**
  - [x] SubTask 2.1: 修改 `AppLayout.tsx`，使九宫格容器使用固定定位或全屏 flex 覆盖整个主区域，保留标题栏/状态栏/底栏。
  - [x] SubTask 2.2: 在 `GridLayout.tsx` 中为 9 个格子添加 stagger 入场动画，每个格子延迟 30ms。
  - [x] SubTask 2.3: 在 `AppLayout.tsx` 为普通界面与九宫格界面增加 `scale`/`opacity`/`blur` 双向过渡，时长 450ms。
  - [x] SubTask 2.4: 为左侧边栏「九宫格」按钮添加 active 状态高亮与 micro-interaction。
  - [x] SubTask 2.5: 编写测试验证动画状态切换（使用 `@testing-library/react` + `vitest`）。

- [x] **Task 3: 增强 ChatPanel — 缩小预览、引用、回退**
  - [x] SubTask 3.1: 在 `ChatPanel.tsx` 使用 CSS transform `scale(0.75)` 与 `transform-origin` 实现缩小预览，保证输入框可读。
  - [x] SubTask 3.2: 为 `MessageItem.tsx` 添加可选的 `onQuote` 与 `onRollback` 回调 props（不破坏现有用法）。
  - [x] SubTask 3.3: 在 `ChatPanel.tsx` 的消息列表上绑定引用与回退，引用内容写入本地输入框状态并同步到主 `chatStore` 的 `pendingQuote`。
  - [x] SubTask 3.4: 在 `chatStore.ts` 新增 `rollbackToMessage(messageId)` 方法，删除该消息之后的所有消息并同步数据库。
  - [x] SubTask 3.5: 编写测试验证引用格式与回退后消息数量。

- [x] **Task 4: 增强 AIViewPanel — 实时跟随、结果渲染、进度摘要**
  - [x] SubTask 4.1: 在 `AIViewPanel.tsx` 顶部新增阶段摘要条，显示 `AIStatus` 与 `completed / total` 计数。
  - [x] SubTask 4.2: 扩展 `WorkItem` 组件，支持运行中工具的脉冲指示与实时返回内容预览。
  - [x] SubTask 4.3: 实现 `MiniDiff` 组件，用于渲染 `edit`/`write_file` 工具的文本差异。
  - [x] SubTask 4.4: 实现 `ResultPreview` 组件，支持图片缩略图、可折叠代码块、HTML 片段预览。
  - [x] SubTask 4.5: 增加自动滚动到底部的智能判断（仅在底部 80px 内或新条目时滚动）。
  - [x] SubTask 4.6: 编写测试验证阶段标签与工具条目渲染。

- [x] **Task 5: 实现宠物自定义背景与主题跟随**
  - [x] SubTask 5.1: 在 `petStore.ts` 新增 `backgroundType: 'theme' | 'solid' | 'gradient' | 'image'` 与 `backgroundValue: string`。
  - [x] SubTask 5.2: 在 `PetDisplay.tsx` 中根据 `backgroundType` 渲染对应背景；`theme` 类型读取 CSS 变量或 `theme.ts` 的当前主题渐变。
  - [x] SubTask 5.3: 监听主题变化，当 `backgroundType === 'theme'` 时自动更新背景。
  - [x] SubTask 5.4: 编写测试验证背景类型切换。

- [x] **Task 6: 实现宠物字幕系统 PetSubtitles**
  - [x] SubTask 6.1: 新增 `PetSubtitles.tsx` 组件，接收 `text`、`visible`、`style` props，最多显示 2 行。
  - [x] SubTask 6.2: 将 `PetSubtitles` 嵌入 `PetDisplay.tsx` 宠物头部上方，并替换原有情绪气泡。
  - [x] SubTask 6.3: 在 `petStore.ts` 中让 `showBubble` 同时驱动字幕（若 `subtitleEnabled` 为 true）。
  - [x] SubTask 6.4: 编写测试验证字幕显示/隐藏与最大行数。

- [x] **Task 7: 实现宠物任务感知与不耐烦情绪**
  - [x] SubTask 7.1: 在 `chatStore.ts` 中新增 `currentTaskName` 计算属性/派生状态，当 `isStreaming` 或存在运行中工具时返回任务名。
  - [x] SubTask 7.2: 在 `PetPanel.tsx` 通过 `useEffect` 将主对话的任务名同步到 `petStore.currentTaskName`。
  - [x] SubTask 7.3: 修改 `petStore.sendPetMessage`：若 `currentTaskName` 非空且情绪为 `working/annoyed`，回复优先使用 `annoyedMessages` 并插入任务名。
  - [x] SubTask 7.4: 在 `PetCharacter.tsx` 中增强 `annoyed` 状态的眉毛、抖动、蒸汽粒子。
  - [x] SubTask 7.5: 编写测试验证任务期间被打扰的回复包含任务名。

- [x] **Task 8: 实现 VRM / Live2D 模型渲染器与导入**
  - [x] SubTask 8.1: 调研并安装依赖：`@pixiv/three-vrm` + `three`（VRM）或 `pixi-live2d-display` + `pixi.js`（Live2D），二选一优先实现 VRM。
  - [x] SubTask 8.2: 新增 `ModelRenderer.tsx`，根据 `avatarType` 渲染 SVG fallback、Three.js VRM 或 Pixi Live2D。
  - [x] SubTask 8.3: 在 `PetDisplay.tsx` 用 `ModelRenderer` 替换 `PetCharacter` 的硬编码使用。
  - [x] SubTask 8.4: 在 IPC 层新增 `file:selectFile` / `file:selectFolder` 通道（如不存在）。
  - [x] SubTask 8.5: 实现模型加载错误边界与重试入口。
  - [x] SubTask 8.6: 编写测试验证 `ModelRenderer` 根据 `avatarType` 渲染正确 DOM。

- [x] **Task 9: 实现 AI 驱动宠物动作与表情**
  - [x] SubTask 9.1: 在 `petStore.ts` 新增 `pendingAnimation` 与 `pendingExpression` 状态。
  - [x] SubTask 9.2: 实现 `generatePetAnimation` 服务函数，使用当前对话模型 LLM 根据用户消息与宠物回复生成动作/表情 JSON。
  - [x] SubTask 9.3: 在 `sendPetMessage` 的延迟回复流程中调用 `generatePetAnimation` 并更新状态。
  - [x] SubTask 9.4: 在 `PetCharacter.tsx` 与 `ModelRenderer.tsx` 中根据 `pendingAnimation/Expression` 触发对应动画/表情，无效值 fallback 到 `idle`。
  - [x] SubTask 9.5: 编写测试验证 AI 返回有效/无效值时的状态映射。

- [x] **Task 10: 新增设置页 PetSettings**
  - [x] SubTask 10.1: 新增 `PetSettings.tsx`，包含角色卡表单、人物形象选择、背景设置、字幕开关/样式、布局重置按钮。
  - [x] SubTask 10.2: 在 `SettingsPage.tsx` 路由/标签中注册「宠物与九宫格」分类。
  - [x] SubTask 10.3: 人物形象选择触发 IPC 文件选择器并将路径保存到 `petStore`。
  - [x] SubTask 10.4: 提供实时预览区，显示当前宠物形象与背景。
  - [x] SubTask 10.5: 编写测试验证设置表单提交后 `petStore` 状态更新。

- [x] **Task 11: 完善九宫格布局自定义**
  - [x] SubTask 11.1: 实现 `GridPanelPlaceholder` 的点击菜单，弹出可选面板列表。
  - [x] SubTask 11.2: 在 `GridSlot.tsx` 实现「×」按钮的最小化功能，调用 `removeSlot`。
  - [x] SubTask 11.3: 确保选择已存在的核心面板时，原位置变空，新位置放置面板。
  - [x] SubTask 11.4: 优化拖拽换位动画，使用 framer-motion `layout` prop 实现 200ms 弹性过渡。
  - [x] SubTask 11.5: 编写测试验证添加、移除、换位后的布局状态。

- [x] **Task 12: 性能优化与端到端验证**
  - [x] SubTask 12.1: 为所有 grid 动画添加 `will-change: transform, opacity` 与 `transform: translateZ(0)`。
  - [x] SubTask 12.2: 在 `ModelRenderer.tsx` 中实现可见性监听，宠物面板不可见时暂停渲染循环。
  - [x] SubTask 12.3: 运行 `npm run build` 与 `npm test`，修复所有 TypeScript/ESLint/Vitest 错误。
  - [x] SubTask 12.4: 执行端到端手动验证清单：进入退出动画、引用回退、实时视图、宠物对话与字幕、模型导入、设置保存。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
- Task 4 depends on Task 1
- Task 5 depends on Task 1
- Task 6 depends on Task 5
- Task 7 depends on Task 1, Task 6
- Task 8 depends on Task 5
- Task 9 depends on Task 7, Task 8
- Task 10 depends on Task 5, Task 8
- Task 11 depends on Task 1
- Task 12 depends on Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10, Task 11
