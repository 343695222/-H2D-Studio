# Implementation Plan: SolarWire DSL 集成

## Overview

将 SolarWire DSL 集成到 H2D Studio，分为 6 个阶段：安装依赖与类型定义 → 核心转换服务 → API 路由 → AI 助手集成 → 前端预览与导入 → 知识库增强。每个阶段增量构建，确保前一阶段可验证后再进入下一阶段。

## Tasks

- [x] 1. 安装 SolarWire 依赖并新增类型定义
  - [x] 1.1 安装 SolarWire npm 包并配置 TypeScript 类型
    - 在 server/ 目录执行 `npm install github:SolarWire/SolarWire`
    - 如果 SolarWire 库无自带类型声明，在 server/src/ 下创建 `solarwire.d.ts` 声明模块类型（parse、render）
    - _Requirements: 1.1_
  - [x] 1.2 在 server/src/types.ts 中新增 SolarWire 相关类型
    - 新增 `SolarWireSummary` 接口（pageId, dsl, generatedAt）
    - 新增 `SolarWireStructurePattern` 接口（name, description, dslSnippet, frequency, sourcePages）
    - 在 `DesignSystemKnowledge` 接口中新增可选字段 `solarwireSummaries` 和 `solarwirePatterns`
    - _Requirements: 6.1, 6.2, 7.3_

- [x] 2. 实现 SolarWire ↔ CaptureTree 核心转换服务
  - [x] 2.1 创建 server/src/services/solarwireConverter.ts 并实现 solarwireToCaptureTree 函数
    - 调用 SolarWire parse() 解析 DSL 为 AST
    - 遍历 AST 节点，按映射规则转换为 ElementSnapshot / TextSnapshot
    - 矩形 `["text"]` → div + border 样式；圆角矩形 `("text")` → div + borderRadius；圆形 `(("text"))` → div + borderRadius="50%" + 宽高相等
    - 映射属性：w→width, h→height, bg→backgroundColor, c→color, size→fontSize, bold→fontWeight, r→borderRadius, @(x,y)→rect
    - 表格 `##`/`#` → 嵌套 flex div；连线 `--"label"--` → borderBottom div
    - 为每个节点分配唯一 id（uuid 或递增计数器）
    - 组装完整 CaptureTree（root, documentTitle, documentRect, viewportRect, devicePixelRatio）
    - 解析失败时返回 ConvertError（success:false, error 含 message/line/column）
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_
  - [x] 2.2 实现 captureTreeToSolarWire 函数
    - 遍历 CaptureTree，按优先级判断节点类型：borderRadius="50%"+宽高相等→圆形, borderRadius→圆角矩形, border→矩形
    - 映射 styles 到 SolarWire 属性（backgroundColor→bg, color→c, fontSize→size 等）
    - 映射 rect 坐标到 @(x,y)
    - 最大递归深度 4 层，超过折叠为 `[?]`
    - 忽略不可见元素（display:none, visibility:hidden, opacity:0）和尺寸过小元素（<5px）
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
  - [x] 2.3 实现 formatSolarWire（Pretty Printer）和 solarwireToSVG 函数
    - formatSolarWire: parse → AST → 重新生成格式化缩进文本
    - solarwireToSVG: 调用 SolarWire 库 render() 生成 SVG 字符串
    - _Requirements: 2.7, 2.8_
  - [x] 2.4 实现 extractSolarWireCodeBlocks 辅助函数
    - 从 Markdown 文本中提取所有 \`\`\`solarwire 代码块内容
    - 返回 DSL 字符串数组
    - _Requirements: 3.3, 4.1_
  - [ ]* 2.5 编写 solarwireToCaptureTree 属性测试
    - **Property 1: SolarWire → CaptureTree 转换产生有效结构**
    - **Validates: Requirements 1.1, 1.10**
  - [ ]* 2.6 编写元素类型映射属性测试
    - **Property 2: 元素类型映射正确性**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  - [ ]* 2.7 编写属性和样式保留属性测试
    - **Property 3: 属性和样式保留**
    - **Validates: Requirements 1.5, 1.6**
  - [ ]* 2.8 编写节点 ID 唯一性属性测试
    - **Property 4: 节点 ID 唯一性**
    - **Validates: Requirements 1.9**
  - [ ]* 2.9 编写无效 DSL 错误处理属性测试
    - **Property 5: 无效 DSL 错误处理**
    - **Validates: Requirements 1.8**
  - [ ]* 2.10 编写反向元素类型映射属性测试
    - **Property 6: 反向元素类型映射**
    - **Validates: Requirements 2.2, 2.3, 2.4**
  - [ ]* 2.11 编写反向属性保留属性测试
    - **Property 7: 反向属性保留**
    - **Validates: Requirements 2.5, 2.6**
  - [ ]* 2.12 编写解析-格式化往返一致性属性测试
    - **Property 8: SolarWire 解析-格式化往返一致性**
    - **Validates: Requirements 2.7, 2.8**
  - [ ]* 2.13 编写代码块提取属性测试
    - **Property 9: SolarWire 代码块提取**
    - **Validates: Requirements 3.3, 4.1**
  - [ ]* 2.14 编写转换服务单元测试
    - 测试文件: server/src/__tests__/solarwireConverter.test.ts
    - 覆盖：空 DSL、单元素、嵌套元素、表格结构、连线、深层嵌套截断、不可见元素过滤
    - _Requirements: 1.1-1.10, 2.1-2.8_

- [x] 3. Checkpoint — 确保转换服务所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 4. 实现 SolarWire API 路由
  - [x] 4.1 创建 server/src/routes/solarwire.ts 路由文件
    - POST /api/solarwire/parse — 接收 dsl 字符串，返回 AST
    - POST /api/solarwire/render-svg — 接收 dsl 字符串，返回 SVG 字符串
    - POST /api/solarwire/to-capture-tree — 接收 dsl + 可选 title/width/height，返回 CaptureTree
    - POST /api/solarwire/from-capture-tree — 接收 captureTree 对象，返回 DSL 字符串
    - 所有端点对无效输入返回 400 + 描述性错误信息
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_
  - [x] 4.2 在 server/src/index.ts 中注册 solarwire 路由
    - 导入并挂载 solarwireRouter 到 /api/solarwire 路径
    - _Requirements: 8.1_
  - [ ]* 4.3 编写 API 无效输入属性测试
    - **Property 12: API 端点无效输入返回 400**
    - **Validates: Requirements 8.5**
  - [ ]* 4.4 编写 API 端点单元测试
    - 使用 supertest 测试各端点的成功和失败路径
    - _Requirements: 8.1-8.5_

- [x] 5. 集成 AI 产品助手 SolarWire 提示词
  - [x] 5.1 修改 server/src/services/productAgent.ts 中的提示词和状态
    - 在 AgentStateAnnotation 中新增 wireframeDsl 和 hifiDsl 字段
    - 替换 WIREFRAME_PROMPT 为 WIREFRAME_PROMPT_SOLARWIRE（包含 SolarWire 语法速查）
    - 替换 HIFI_PROMPT 为 HIFI_PROMPT_SOLARWIRE（包含样式属性说明和线框 DSL 注入）
    - _Requirements: 3.1, 3.2_
  - [x] 5.2 修改 wireframeGenerateNode 和 hifiDesignNode 逻辑
    - wireframeGenerateNode: 从 AI 回复中提取 \`\`\`solarwire 代码块，调用 solarwireToCaptureTree 转换，保存 wireframeDsl 到 state
    - hifiDesignNode: 将 wireframeDsl 注入提示词，提取 \`\`\`solarwire 代码块，调用 solarwireToCaptureTree 转换，保存 hifiDsl 到 state
    - 解析失败时在响应中附加错误提示
    - _Requirements: 3.3, 3.4, 3.5_
  - [ ]* 5.3 编写 AI 集成单元测试
    - 验证 WIREFRAME_PROMPT_SOLARWIRE 包含语法说明
    - 验证代码块提取和转换流程
    - _Requirements: 3.1-3.5_

- [x] 6. Checkpoint — 确保后端服务和 AI 集成测试通过
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 7. 实现前端 SolarWire SVG 预览与导入
  - [x] 7.1 创建 web/src/components/agent/SolarWirePreview.tsx 组件
    - 接收 props: dsl, projectId, onImportToEditor
    - 调用 POST /api/solarwire/render-svg 获取 SVG 并渲染（使用 DOMPurify 清理后 dangerouslySetInnerHTML）
    - 底部展示"导入到编辑器"按钮和"查看源码"折叠按钮
    - 解析/渲染失败时回退为普通代码块 + 错误提示
    - _Requirements: 4.2, 4.3, 4.4, 4.5_
  - [x] 7.2 修改 web/src/components/agent/AgentPanel.tsx 检测 SolarWire 代码块
    - 在消息渲染中，用正则分割消息为 [文本段, solarwire代码块, 文本段, ...]
    - 文本段用现有 renderMarkdown，solarwire 代码块用 SolarWirePreview 组件
    - _Requirements: 4.1_
  - [x] 7.3 实现"导入到编辑器"流程
    - SolarWirePreview 点击按钮 → 调用 POST /api/solarwire/to-capture-tree → 获取 CaptureTree
    - 通过 editorStore 或 props 回调将 CaptureTree 设为当前页面的 editedTree
    - 自动切换到编辑器视图
    - 转换失败时显示错误 toast
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [ ]* 7.4 编写 SolarWirePreview 组件测试
    - 使用 React Testing Library 测试渲染、折叠/展开、错误回退
    - _Requirements: 4.1-4.5_

- [x] 8. 实现知识库 SolarWire 摘要与结构模式增强
  - [x] 8.1 在 server/src/services/knowledgeBase.ts 中新增 SolarWire 摘要函数
    - 实现 generateSolarWireSummary(projectId, pageId, captureTree): 调用 captureTreeToSolarWire 生成摘要
    - 实现 extractSolarWirePatterns(summaries): 从摘要中提取常见结构模式
    - 实现 toSolarWireContextString(summaries, patterns): 生成 AI 上下文字符串
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3_
  - [x] 8.2 修改 server/src/services/storage.ts 的 savePage 函数
    - 在页面保存完成后，调用 captureTreeToSolarWire 生成 SolarWire 摘要
    - 将摘要保存到 projects/{id}/pages/{pageId}/solarwire.txt
    - 调用 generateSolarWireSummary 更新知识库摘要记录
    - 转换失败时记录警告日志，不影响页面保存
    - _Requirements: 6.1, 6.2, 6.4_
  - [x] 8.3 增强 productAgent.ts 上下文注入
    - 在 createSession 或线框/高保真节点中，加载 SolarWire 结构模式
    - 将 toSolarWireContextString 输出注入到提示词的 {structurePatterns} 和 {knowledgeContext} 占位符
    - _Requirements: 6.3, 7.2_
  - [ ]* 8.4 编写知识库摘要生成与存储属性测试
    - **Property 10: 捕获页面生成并存储 SolarWire 摘要**
    - **Validates: Requirements 6.1, 6.2**
  - [ ]* 8.5 编写知识库上下文包含摘要属性测试
    - **Property 11: 知识库上下文包含 SolarWire 摘要**
    - **Validates: Requirements 6.3**
  - [ ]* 8.6 编写知识库单元测试
    - 测试空摘要列表、单页面摘要、多页面摘要聚合、模式提取
    - _Requirements: 6.1-6.4, 7.1-7.3_

- [x] 9. Final Checkpoint — 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## Notes

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP
- 属性测试使用 fast-check 库配合 Vitest，每个测试最少 100 次迭代
- 每个属性测试需注释标注：**Feature: solarwire-integration, Property {N}: {title}**
- SolarWire 库通过 `npm install github:SolarWire/SolarWire` 安装，提供 parse() 和 render() API
- 后端文件修改集中在 server/src/，前端修改集中在 web/src/components/agent/，符合项目目录隔离原则
