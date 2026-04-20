# Implementation Plan: AI 知识库增强工作流

## Overview

基于已有的 H2D Studio 架构（Express + React + Zustand + 文件系统存储），按模块递增实现知识库增强工作流。先完成后端数据层和服务层，再实现前端界面，最后集成 AI 助手增强。测试框架使用 Vitest + fast-check。

## Tasks

- [x] 1. 类型定义与基础设施
  - [x] 1.1 扩展 server/src/types.ts，新增 PageHierarchy、PageHierarchyNode、DesignKnowledgeBase、ComponentTemplate、InteractionPattern、DesignPrinciple 类型定义；为现有 ColorToken、TypographyToken、SpacingToken、BorderRadiusToken、ShadowToken 添加 isCustom 可选字段
    - _Requirements: 1.1, 1.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

- [x] 2. 页面层级管理（后端）
  - [x] 2.1 在 server/src/services/storage.ts 中实现页面层级存储函数：getPageHierarchy、setPageParent、getPageHierarchyTree、deletePageFromHierarchy；层级数据存储在 projects/{id}/hierarchy.json；getPageHierarchyTree 将扁平映射转换为树形结构；setPageParent 包含循环引用检测逻辑
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [ ]* 2.2 编写页面层级属性测试 server/src/__tests__/hierarchy.property.test.ts
    - **Property 1: 扁平层级到树形结构转换** — 树中所有节点总数等于原始映射条目数，每个节点 parentId 与原始映射一致
    - **Property 2: 设置父级保持有效层级** — 设置 parentId 后读取返回更新值，且无循环引用
    - **Property 3: 删除父页面提升子页面** — 删除父页面后子页面 parentId 变为 null
    - **Property 4: 循环层级检测** — 导致循环引用的操作被拒绝，层级不变
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**

  - [x] 2.3 在 server/src/routes/projects.ts 中新增页面层级端点：PUT /api/projects/:id/pages/:pageId/parent（设置页面父级）、GET /api/projects/:id/page-hierarchy（获取层级树）；删除页面时调用 deletePageFromHierarchy 提升子页面
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 3. 页面层级管理（前端）
  - [x] 3.1 新建 web/src/components/project/PageTree.tsx 组件，使用 HTML5 Drag & Drop API 实现页面树形展示、拖拽排序、展开/折叠子页面；拖拽时前端检测循环引用并阻止；调用后端 PUT /api/projects/:id/pages/:pageId/parent 更新层级
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 3.2 在 web/src/pages/ProjectDetail.tsx 中集成 PageTree 组件替换现有的扁平页面列表，支持树形展示和拖拽操作
    - _Requirements: 1.1, 1.2_

- [x] 4. Checkpoint — 页面层级功能验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 知识库管理（后端增强）
  - [x] 5.1 增强 server/src/services/knowledgeBase.ts：为所有 Token 类型添加 isCustom 字段支持；实现 rebuildKnowledgeBase 函数增强逻辑（保留 isCustom=true 条目，合并自动提取条目）
    - _Requirements: 2.3, 2.4, 2.6_

  - [x] 5.2 在 server/src/routes/knowledge.ts 中新增 CRUD 端点：PUT /api/knowledge/:projectId/tokens/:tokenType/:index（编辑 Token）、POST /api/knowledge/:projectId/tokens/:tokenType（添加 Token）、DELETE /api/knowledge/:projectId/tokens/:tokenType/:index（删除 Token）；POST /api/knowledge/:projectId/rescan（重新扫描）
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [ ]* 5.3 编写知识库属性测试 server/src/__tests__/knowledge.property.test.ts
    - **Property 5: Design Token CRUD 往返一致性** — 添加后读取返回相同值且 isCustom=true；编辑后读取返回修改值；删除后不包含该条目
    - **Property 6: 重新扫描保留用户自定义条目** — 重新扫描后 isCustom=true 条目保留，自动条目被刷新
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6**

- [x] 6. 知识库管理（前端）
  - [x] 6.1 重写 web/src/pages/DesignSystem.tsx 为 KnowledgeManagement 页面，实现七个分类标签页（色彩系统、字体规范、间距系统、圆角、阴影、组件模式、布局模式）；色彩标签页展示色块预览、色值、用途分类、使用频次、来源页面列表；组件模式标签页展示名称、描述、典型样式、出现频次、来源页面；布局模式标签页展示名称、描述、方向、子元素数量、出现频次
    - _Requirements: 2.1, 2.2, 2.7, 2.8_

  - [x] 6.2 在 KnowledgeManagement 页面中实现 CRUD 操作：点击条目弹出编辑表单、标签页内"添加"按钮、条目右侧删除按钮（确认后删除）、"重新扫描"按钮触发后端重新扫描；编辑和添加操作标记 isCustom=true
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [x] 7. Checkpoint — 知识库管理功能验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 设计知识库（后端）
  - [x] 8.1 新建 server/src/services/designKnowledgeBase.ts，实现设计知识库核心服务：getDesignKnowledgeBase、saveDesignKnowledgeBase；组件模板 CRUD（addComponentTemplate、updateComponentTemplate、deleteComponentTemplate）；交互模式 CRUD（addInteractionPattern、updateInteractionPattern、deleteInteractionPattern）；设计原则 CRUD（addDesignPrinciple、updateDesignPrinciple、deleteDesignPrinciple）；searchDesignKnowledge 模糊搜索；extractComponentAsTemplate 从捕获页面提取组件；toDesignKnowledgeContextString 转为 AI 上下文字符串
    - 存储路径：项目级 projects/{id}/design-knowledge.json，全局级 global/design-knowledge.json
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8_

  - [ ]* 8.2 编写设计知识库属性测试 server/src/__tests__/designKnowledge.property.test.ts
    - **Property 7: 设计知识库 CRUD 往返一致性** — 添加后读取返回包含所有字段的等价对象；更新后返回更新值；删除后不包含该条目
    - **Property 8: 设计知识库模糊搜索正确性** — 搜索结果中每个条目的名称或描述包含查询字符串（不区分大小写），且所有匹配条目都出现在结果中
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.8**

  - [x] 8.3 新建 server/src/routes/designKnowledge.ts，注册所有设计知识库 REST 端点：GET 获取、POST/PUT/DELETE 组件模板、交互模式、设计原则的 CRUD、GET 搜索、POST 从捕获页面提取组件；在 server/src/index.ts 中注册路由
    - _Requirements: 3.2, 3.3, 3.4, 3.6, 3.7, 3.8_

- [x] 9. 设计知识库（前端）
  - [x] 9.1 新建 web/src/pages/DesignKnowledgeBase.tsx 页面，实现三个分类标签页（组件模板、交互模式、设计原则）；顶部搜索栏按名称和描述模糊搜索；每个分类支持列表展示、添加、编辑、删除；组件模板卡片展示名称、描述、适用场景标签、预览图；交互模式卡片展示名称、描述、触发条件、适用组件标签；设计原则卡片展示名称、描述、规则列表
    - _Requirements: 3.7, 3.8_

  - [x] 9.2 在 web/src/App.tsx 中添加 DesignKnowledgeBase 页面路由，在 Layout 导航中添加入口链接
    - _Requirements: 3.7_

- [x] 10. Checkpoint — 设计知识库功能验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. AI 产品助手知识库集成（后端）
  - [x] 11.1 增强 server/src/services/productAgent.ts：在 AgentStateAnnotation 中新增 designKnowledgeContext 和 pageHierarchyContext 字段；createSession 时自动加载 Project_Knowledge_Base（toContextString）、Design_Knowledge_Base（toDesignKnowledgeContextString）和页面层级树，注入到初始 state
    - _Requirements: 4.1_

  - [x] 11.2 增强 productAgent.ts 各阶段节点的系统提示：discoveryNode 包含页面层级和组件模式；clarifyNode 包含项目知识库摘要；requirementNode 包含页面层级和组件模式；prdNode 引用具体 Design_Token 值；designPrinciplesNode 结合两个知识库的设计原则；wireframeGenerateNode 优先使用组件模板；hifiDesignNode 使用完整 token
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

  - [x] 11.3 增强 productAgent.ts 的 sendMessage 方法：每次处理消息前重新加载知识库上下文，确保使用最新内容
    - _Requirements: 4.6_

  - [ ]* 11.4 编写 AI 知识库集成属性测试 server/src/__tests__/agentKnowledge.property.test.ts
    - **Property 9: AI 各阶段注入对应知识库上下文** — 创建会话后系统提示包含项目知识库和设计知识库摘要
    - **Property 10: 知识库更新后下次消息使用最新内容** — 两次消息间更新知识库，第二次使用更新后内容
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

- [x] 12. AI 产品助手迭代式交互增强（后端）
  - [x] 12.1 增强 productAgent.ts：在 AgentStateAnnotation 新增 stageHistory 字段；实现 rollbackStage 方法（将 stage 设为 targetStage，保留对话历史，添加系统消息说明回退）；增强 sendMessage 使用户普通消息不自动推进阶段；实现 updatePRDSection 方法（局部更新 PRD 指定部分，保留其余内容）
    - _Requirements: 5.1, 5.2, 5.4, 5.6_

  - [x] 12.2 在 server/src/routes/agent.ts 中新增端点：POST /api/agent/sessions/:id/rollback（回退到指定阶段）、POST /api/agent/sessions/:id/update-prd（局部更新 PRD）
    - _Requirements: 5.2, 5.4_

  - [ ]* 12.3 编写阶段管理属性测试 server/src/__tests__/agentStage.property.test.ts
    - **Property 11: 发送消息保持当前阶段** — 用户发送普通消息后会话阶段不变
    - **Property 12: 阶段回退保留对话历史** — 回退到阶段 M 后，阶段为 M 且对话历史全部保留
    - **Property 13: PRD 局部更新保留其余内容** — 修改某功能点后，未修改部分保持不变
    - **Validates: Requirements 5.1, 5.2, 5.4**

- [x] 13. AI 产品助手迭代式交互增强（前端）
  - [x] 13.1 增强 web/src/components/agent/AgentPanel.tsx：顶部添加阶段进度指示器（发现→澄清→需求→PRD→设计原则→线框→高保真→代码导出），当前阶段高亮，已完成阶段打勾，可点击已完成阶段进行回退
    - _Requirements: 5.5_

  - [x] 13.2 增强 AgentPanel.tsx：澄清阶段 AI 提问时解析问题列表为结构化问题卡片，每个卡片包含问题文本和输入框，支持独立回答
    - _Requirements: 5.3_

  - [x] 13.3 增强 AgentPanel.tsx：原型生成阶段添加"修改意见"输入区域，支持描述修改意见并重新生成，保留满意的部分
    - _Requirements: 5.6_

- [x] 14. Checkpoint — AI 助手增强功能验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. AI 编辑端点知识库一致性
  - [x] 15.1 在 server/src/routes/ai.ts 中实现 getFullKnowledgeContext 函数：加载 Project_Knowledge_Base（toContextString）和 Design_Knowledge_Base（toDesignKnowledgeContextString），合并为统一上下文；替换 generate-modified、edit-node、design-workflow 端点中的 getKnowledgeContext 调用为 getFullKnowledgeContext；项目知识库不存在时自动触发 buildKnowledgeBase
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 15.2 编写 AI 端点属性测试 server/src/__tests__/aiEndpoints.property.test.ts
    - **Property 14: AI 编辑端点统一注入知识库上下文** — 当项目知识库存在时，AI 提示包含 toContextString 格式化的内容
    - **Property 15: 首次调用自动构建知识库** — 未构建知识库的项目首次调用时自动触发构建
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

- [x] 16. Final Checkpoint — 全功能集成验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major module
- Property tests validate universal correctness properties (fast-check, min 100 iterations)
- Unit tests validate specific examples and edge cases
- 后端服务先行，前端界面后接，确保每步可独立验证
