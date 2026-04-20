# 设计文档：AI 知识库增强工作流

## 概述

本设计在 H2D Studio 现有架构（Express + React + Zustand + 文件系统存储）基础上，增强知识库系统和 AI 产品助手工作流。核心变更包括：

1. 为页面引入 `parentId` 字段实现树形层级
2. 重构 DesignSystem 页面为完整的知识库管理界面，支持分类浏览和 CRUD 操作
3. 新增 Design Knowledge Base 服务，管理可复用组件模板、交互模式和设计原则
4. 增强 ProductAgentService，在各阶段自动注入项目知识库和设计知识库上下文
5. 统一所有 AI 编辑端点的知识库上下文注入

## 架构

### 整体架构图

```mermaid
graph TB
    subgraph Frontend ["前端 (web/src/)"]
        KM[KnowledgeManagement 页面]
        DKB_UI[DesignKB 管理界面]
        AP[AgentPanel 增强]
        PD[ProjectDetail 页面层级]
    end

    subgraph Backend ["后端 (server/src/)"]
        subgraph Routes
            KR[knowledge.ts 路由增强]
            DKR[designKnowledge.ts 新路由]
            PR[projects.ts 路由增强]
            AR[agent.ts 路由]
            AIR[ai.ts 路由]
        end

        subgraph Services
            KBS[knowledgeBase.ts 增强]
            DKBS[designKnowledgeBase.ts 新服务]
            SS[storage.ts 增强]
            PAS[productAgent.ts 增强]
        end
    end

    subgraph Storage ["文件存储 (server/data/)"]
        PK[projects/{id}/knowledge.json]
        PH[projects/{id}/hierarchy.json]
        DK[projects/{id}/design-knowledge.json]
        GDK[global/design-knowledge.json]
    end

    KM --> KR
    DKB_UI --> DKR
    PD --> PR
    AP --> AR
    
    KR --> KBS
    DKR --> DKBS
    PR --> SS
    AR --> PAS
    AIR --> KBS
    AIR --> DKBS
    
    PAS --> KBS
    PAS --> DKBS
    
    KBS --> PK
    SS --> PH
    DKBS --> DK
    DKBS --> GDK
```

### 变更范围

| 模块 | 变更类型 | 文件 |
|------|---------|------|
| 页面层级 | 修改 | server/src/services/storage.ts, server/src/routes/projects.ts |
| 页面层级 | 新增 | web/src/components/project/PageTree.tsx |
| 知识库管理 | 重写 | web/src/pages/DesignSystem.tsx |
| 知识库管理 | 修改 | server/src/routes/knowledge.ts, server/src/services/knowledgeBase.ts |
| 设计知识库 | 新增 | server/src/services/designKnowledgeBase.ts, server/src/routes/designKnowledge.ts |
| 设计知识库 | 新增 | web/src/pages/DesignKnowledgeBase.tsx |
| AI 助手增强 | 修改 | server/src/services/productAgent.ts, web/src/components/agent/AgentPanel.tsx |
| AI 编辑一致性 | 修改 | server/src/routes/ai.ts |
| 类型定义 | 修改 | server/src/types.ts |

## 组件与接口

### 1. 页面层级系统

#### 后端接口

```typescript
// server/src/routes/projects.ts — 新增端点

// PUT /api/projects/:id/pages/:pageId/parent — 设置页面父级
// Body: { parentId: string | null }
// Response: { success: true }

// GET /api/projects/:id/page-hierarchy — 获取页面层级树
// Response: { success: true, data: PageHierarchyNode[] }
```

#### 存储层变更

```typescript
// server/src/services/storage.ts — 新增函数

// 层级数据存储在 projects/{id}/hierarchy.json
interface PageHierarchy {
  // pageId -> parentId 映射，null 表示顶级页面
  [pageId: string]: string | null;
}

function getPageHierarchy(projectId: string): PageHierarchy;
function setPageParent(projectId: string, pageId: string, parentId: string | null): boolean;
function getPageHierarchyTree(projectId: string): PageHierarchyNode[];
```

#### 前端组件

```typescript
// web/src/components/project/PageTree.tsx
interface PageHierarchyNode {
  id: string;
  name: string;
  url: string;
  parentId: string | null;
  children: PageHierarchyNode[];
  screenshotPath: string;
  hasEdited: boolean;
}

// 使用 HTML5 Drag & Drop API 实现拖拽排序
// 支持展开/折叠子页面
// 拖拽时检测循环引用并阻止
```

### 2. 知识库管理界面

#### 后端接口增强

```typescript
// server/src/routes/knowledge.ts — 新增端点

// PUT /api/knowledge/:projectId/tokens/:tokenType/:index — 编辑 Design Token
// Body: { value?: string, usage?: string, isCustom?: true }

// POST /api/knowledge/:projectId/tokens/:tokenType — 添加自定义 Design Token
// Body: { value: string, usage: string, ... }

// DELETE /api/knowledge/:projectId/tokens/:tokenType/:index — 删除 Design Token

// tokenType: 'colors' | 'typography' | 'spacing' | 'borderRadius' | 'shadows'
```

#### 知识库服务增强

```typescript
// server/src/services/knowledgeBase.ts — 增强

// 每个 token 新增 isCustom 字段标记用户自定义条目
// 重新扫描时保留 isCustom=true 的条目

interface ColorToken {
  // ... 现有字段
  isCustom?: boolean;  // 新增
}

// 同理 TypographyToken, SpacingToken, BorderRadiusToken, ShadowToken

// 重新扫描逻辑增强
async function rebuildKnowledgeBase(projectId: string): Promise<DesignSystemKnowledge> {
  // 1. 读取现有知识库，提取 isCustom=true 的条目
  // 2. 重新扫描所有页面
  // 3. 合并：保留用户自定义条目 + 新扫描的自动条目
}
```

#### 前端组件

```typescript
// web/src/pages/KnowledgeManagement.tsx（重写 DesignSystem.tsx）

// 七个分类标签页
type KnowledgeTab = 'colors' | 'typography' | 'spacing' | 'borderRadius' | 'shadows' | 'components' | 'layouts';

// 通用 CRUD 操作
// - 查看：分类标签页切换，列表展示
// - 编辑：点击条目弹出编辑表单，修改后标记 isCustom=true
// - 添加：标签页内"添加"按钮，新条目标记 isCustom=true
// - 删除：条目右侧删除按钮，确认后删除

// 色彩系统标签页展示：色块预览 + 色值 + 用途分类 + 使用频次 + 来源页面列表
// 组件模式标签页展示：名称 + 描述 + 典型样式 + 出现频次 + 来源页面
// 布局模式标签页展示：名称 + 描述 + 方向 + 子元素数量 + 出现频次
```

### 3. 设计知识库

#### 数据模型

```typescript
// server/src/types.ts — 新增类型

interface DesignKnowledgeBase {
  projectId: string;           // 项目ID，全局库为 'global'
  componentTemplates: ComponentTemplate[];
  interactionPatterns: InteractionPattern[];
  designPrinciples: DesignPrinciple[];
  updatedAt: string;
}

interface ComponentTemplate {
  id: string;                  // UUID
  name: string;                // 组件名称
  description: string;         // 描述
  applicableScenes: string[];  // 适用场景
  htmlTemplate: string;        // HTML/CSS 结构模板
  previewImagePath?: string;   // 预览截图路径
  createdAt: string;
  updatedAt: string;
}

interface InteractionPattern {
  id: string;
  name: string;                // 模式名称
  description: string;         // 描述
  triggerCondition: string;    // 触发条件
  interactionFlow: string;     // 交互流程描述
  applicableComponents: string[]; // 适用组件列表
  createdAt: string;
  updatedAt: string;
}

interface DesignPrinciple {
  id: string;
  name: string;                // 原则名称
  description: string;         // 描述
  rules: string[];             // 具体规则列表
  createdAt: string;
  updatedAt: string;
}
```

#### 后端服务

```typescript
// server/src/services/designKnowledgeBase.ts — 新增

// 存储路径：
//   项目级：server/data/projects/{projectId}/design-knowledge.json
//   全局级：server/data/global/design-knowledge.json

export function getDesignKnowledgeBase(projectId: string): DesignKnowledgeBase | null;
export function saveDesignKnowledgeBase(projectId: string, data: DesignKnowledgeBase): void;

// 组件模板 CRUD
export function addComponentTemplate(projectId: string, template: Omit<ComponentTemplate, 'id' | 'createdAt' | 'updatedAt'>): ComponentTemplate;
export function updateComponentTemplate(projectId: string, id: string, updates: Partial<ComponentTemplate>): ComponentTemplate | null;
export function deleteComponentTemplate(projectId: string, id: string): boolean;

// 交互模式 CRUD
export function addInteractionPattern(projectId: string, pattern: Omit<InteractionPattern, 'id' | 'createdAt' | 'updatedAt'>): InteractionPattern;
export function updateInteractionPattern(projectId: string, id: string, updates: Partial<InteractionPattern>): InteractionPattern | null;
export function deleteInteractionPattern(projectId: string, id: string): boolean;

// 设计原则 CRUD
export function addDesignPrinciple(projectId: string, principle: Omit<DesignPrinciple, 'id' | 'createdAt' | 'updatedAt'>): DesignPrinciple;
export function updateDesignPrinciple(projectId: string, id: string, updates: Partial<DesignPrinciple>): DesignPrinciple | null;
export function deleteDesignPrinciple(projectId: string, id: string): boolean;

// 搜索
export function searchDesignKnowledge(projectId: string, query: string): {
  componentTemplates: ComponentTemplate[];
  interactionPatterns: InteractionPattern[];
  designPrinciples: DesignPrinciple[];
};

// 从捕获页面提取组件为模板
export function extractComponentAsTemplate(projectId: string, pageId: string, nodeId: string): ComponentTemplate;

// 转为 AI 上下文字符串
export function toDesignKnowledgeContextString(data: DesignKnowledgeBase): string;
```

#### 后端路由

```typescript
// server/src/routes/designKnowledge.ts — 新增

// GET    /api/design-knowledge/:projectId              — 获取设计知识库
// POST   /api/design-knowledge/:projectId/components   — 添加组件模板
// PUT    /api/design-knowledge/:projectId/components/:id — 更新组件模板
// DELETE /api/design-knowledge/:projectId/components/:id — 删除组件模板
// POST   /api/design-knowledge/:projectId/interactions  — 添加交互模式
// PUT    /api/design-knowledge/:projectId/interactions/:id — 更新交互模式
// DELETE /api/design-knowledge/:projectId/interactions/:id — 删除交互模式
// POST   /api/design-knowledge/:projectId/principles    — 添加设计原则
// PUT    /api/design-knowledge/:projectId/principles/:id — 更新设计原则
// DELETE /api/design-knowledge/:projectId/principles/:id — 删除设计原则
// GET    /api/design-knowledge/:projectId/search?q=xxx  — 模糊搜索
// POST   /api/design-knowledge/:projectId/extract       — 从捕获页面提取组件为模板
//   Body: { pageId: string, nodeId: string }
```

#### 前端组件

```typescript
// web/src/pages/DesignKnowledgeBase.tsx — 新增

// 三个分类标签页：组件模板 | 交互模式 | 设计原则
// 顶部搜索栏：按名称和描述模糊搜索
// 每个分类支持：列表展示 + 添加 + 编辑 + 删除
// 组件模板卡片：名称 + 描述 + 适用场景标签 + 预览图
// 交互模式卡片：名称 + 描述 + 触发条件 + 适用组件标签
// 设计原则卡片：名称 + 描述 + 规则列表
```

### 4. AI 产品助手知识库集成

#### ProductAgentService 增强

```typescript
// server/src/services/productAgent.ts — 增强

// AgentStateAnnotation 新增字段
designKnowledgeContext: Annotation<string>({
  reducer: (_prev, next) => next,
  default: () => '',
}),
pageHierarchyContext: Annotation<string>({
  reducer: (_prev, next) => next,
  default: () => '',
}),

// createSession 增强：
// 1. 加载 Project_Knowledge_Base → toContextString()
// 2. 加载 Design_Knowledge_Base → toDesignKnowledgeContextString()
// 3. 加载页面层级树 → 格式化为层级文本
// 4. 将三者注入到初始 state 中

// 各阶段节点增强：
// discoveryNode: 系统提示中包含页面层级结构和组件模式
// clarifyNode: 系统提示中包含项目知识库摘要
// requirementNode: 系统提示中包含页面层级和组件模式
// prdNode: 设计约束部分引用具体 Design_Token 值
// designPrinciplesNode: 结合 Project_Knowledge_Base 和 Design_Knowledge_Base 的设计原则
// wireframeGenerateNode: 优先使用 Design_Knowledge_Base 中的组件模板
// hifiDesignNode: 使用完整的色彩、字体、间距 token

// sendMessage 增强：
// 每次处理消息前，重新加载知识库上下文（确保使用最新内容）
```

#### 上下文注入格式

```
# 项目知识库
## 色彩系统
- 主色: #1a73e8 (使用12次, 来源3个页面)
...
## 组件模式
- card: 卡片组件 (出现8次)
...

# 设计知识库
## 组件模板
- Button: 通用按钮组件，适用场景: 表单提交、操作确认
  HTML: <button class="btn">...</button>
...
## 交互模式
- 下拉选择: 点击触发，展示选项列表
...
## 设计原则
- 一致性: 相同功能使用相同组件
...

# 页面层级
- 首页
  - 产品列表页
    - 产品详情页
  - 用户中心
    - 设置页
```

### 5. AI 产品助手迭代式交互增强

#### 后端增强

```typescript
// server/src/services/productAgent.ts — 增强

// AgentStateAnnotation 新增字段
stageHistory: Annotation<AgentStage[]>({
  reducer: (prev, next) => [...prev, ...next],
  default: () => [],
}),

// 新增方法：回退阶段
async rollbackStage(sessionId: string, targetStage: AgentStage): Promise<{
  response: string;
  stage: AgentStage;
}>;
// 实现：将 stage 设为 targetStage，保留对话历史，添加系统消息说明回退

// sendMessage 增强：
// 当用户在当前阶段发送消息时，不自动推进到下一阶段
// 仅当用户明确请求推进（advance）或 AI 判断当前阶段已完成时才推进

// PRD 局部更新：
async updatePRDSection(sessionId: string, section: string, modification: string): Promise<{
  response: string;
  prd: string;
}>;
```

#### 后端路由增强

```typescript
// server/src/routes/agent.ts — 新增端点

// POST /api/agent/sessions/:id/rollback — 回退到指定阶段
// Body: { targetStage: AgentStage }

// POST /api/agent/sessions/:id/update-prd — 局部更新 PRD
// Body: { section: string, modification: string }
```

#### 前端增强

```typescript
// web/src/components/agent/AgentPanel.tsx — 增强

// 1. 阶段进度指示器
// 顶部横向展示所有阶段：发现 → 澄清 → 需求 → PRD → 设计原则 → 线框 → 高保真 → 代码导出
// 当前阶段高亮，已完成阶段打勾，可点击已完成阶段进行回退

// 2. 结构化问题卡片
// 当 AI 在澄清阶段提问时，解析问题列表为独立卡片
// 每个卡片包含：问题文本 + 输入框，支持独立回答

// 3. 原型修改交互
// 当用户对生成结果不满意时，展示"修改意见"输入区域
// 支持描述修改意见并重新生成，保留满意的部分
```

### 6. AI 编辑端点知识库一致性

#### ai.ts 路由增强

```typescript
// server/src/routes/ai.ts — 增强 getKnowledgeContext 函数

// 现有函数已加载 Project_Knowledge_Base
// 增强：同时加载 Design_Knowledge_Base

async function getFullKnowledgeContext(projectId: string): Promise<string> {
  // 1. 加载 Project_Knowledge_Base
  const projectKB = getKnowledgeBase(projectId);
  const projectContext = projectKB ? toContextString(projectKB) : '';

  // 2. 加载 Design_Knowledge_Base
  const designKB = getDesignKnowledgeBase(projectId);
  const designContext = designKB ? toDesignKnowledgeContextString(designKB) : '';

  // 3. 合并为统一上下文
  return [projectContext, designContext].filter(Boolean).join('\n\n');
}

// 替换所有端点中的 getKnowledgeContext 调用为 getFullKnowledgeContext：
// - POST /api/ai/generate-modified
// - POST /api/ai/edit-node
// - POST /api/ai/design-workflow

// 首次调用自动构建逻辑（已有）：
// 如果 projectKB 为 null，自动调用 buildKnowledgeBase
// 如果 designKB 为 null，返回空字符串（设计知识库需用户手动创建）
```

## 数据模型

### 新增类型定义

```typescript
// server/src/types.ts — 新增

// 页面层级
interface PageHierarchy {
  [pageId: string]: string | null;  // pageId -> parentId
}

interface PageHierarchyNode {
  id: string;
  name: string;
  url: string;
  parentId: string | null;
  children: PageHierarchyNode[];
  screenshotPath: string;
  hasEdited: boolean;
}

// 设计知识库（详见组件与接口第3节）
interface DesignKnowledgeBase { ... }
interface ComponentTemplate { ... }
interface InteractionPattern { ... }
interface DesignPrinciple { ... }

// Design Token 增强
// 所有现有 Token 类型新增 isCustom 字段
interface ColorToken {
  // ... 现有字段
  isCustom?: boolean;
}
// 同理 TypographyToken, SpacingToken, BorderRadiusToken, ShadowToken
```

### 存储结构

```
server/data/
├── projects/
│   └── {projectId}/
│       ├── meta.json              # 项目元数据（已有）
│       ├── pages/                 # 页面数据（已有）
│       ├── knowledge.json         # 项目知识库（已有，增强 isCustom）
│       ├── hierarchy.json         # 页面层级关系（新增）
│       └── design-knowledge.json  # 项目级设计知识库（新增）
└── global/
    └── design-knowledge.json      # 全局设计知识库（新增）
```


## 正确性属性

*正确性属性是一种在系统所有有效执行中都应成立的特征或行为——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范与机器可验证正确性保证之间的桥梁。*

### Property 1: 扁平层级到树形结构转换

*For any* 有效的 PageHierarchy 映射（pageId → parentId），将其转换为 PageHierarchyNode[] 树形结构后，树中所有节点的总数应等于原始映射中的条目数，且每个节点的 parentId 应与原始映射一致。

**Validates: Requirements 1.1**

### Property 2: 设置父级保持有效层级

*For any* 有效的页面层级和任意两个页面 A、B，将 A 设为 B 的子页面后（parentId 设为 B 或 null），读取层级关系应返回更新后的 parentId 值，且层级中不存在循环引用。

**Validates: Requirements 1.2, 1.3**

### Property 3: 删除父页面提升子页面

*For any* 页面层级树中包含子页面的父页面，删除该父页面后，其所有直接子页面的 parentId 应变为 null（顶级页面），且子页面的数据保持不变。

**Validates: Requirements 1.5**

### Property 4: 循环层级检测

*For any* 页面层级和任意拖拽操作，如果该操作会导致循环引用（A→B→...→A），则操作应被拒绝，层级关系保持不变。

**Validates: Requirements 1.6**

### Property 5: Design Token CRUD 往返一致性

*For any* 有效的 Design Token（颜色、字体、间距、圆角、阴影），执行添加操作后读取应返回相同的值且 isCustom=true；执行编辑操作后读取应返回修改后的值且 isCustom=true；执行删除操作后读取应不包含该条目。

**Validates: Requirements 2.3, 2.4, 2.5**

### Property 6: 重新扫描保留用户自定义条目

*For any* 包含 isCustom=true 条目的知识库，执行重新扫描后，所有 isCustom=true 的条目应保留在结果中，且自动提取的条目被刷新。

**Validates: Requirements 2.6**

### Property 7: 设计知识库 CRUD 往返一致性

*For any* 有效的组件模板、交互模式或设计原则，添加到设计知识库后读取应返回包含所有字段的等价对象；更新后读取应返回更新后的值；删除后读取应不包含该条目。

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 8: 设计知识库模糊搜索正确性

*For any* 搜索查询字符串和设计知识库数据，搜索结果中的每个条目的名称或描述应包含查询字符串（不区分大小写），且所有匹配的条目都应出现在结果中。

**Validates: Requirements 3.8**

### Property 9: AI 各阶段注入对应知识库上下文

*For any* 存在项目知识库和设计知识库的项目，创建 AI 会话后，系统提示中应包含项目知识库摘要和设计知识库摘要；在各阶段处理消息时，提示中应包含该阶段所需的特定知识库内容。

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 10: 知识库更新后下次消息使用最新内容

*For any* 活跃的 AI 会话，如果在两次消息之间更新了知识库内容，则第二次消息处理时使用的知识库上下文应反映更新后的内容。

**Validates: Requirements 4.6**

### Property 11: 发送消息保持当前阶段

*For any* AI 会话和当前阶段，用户发送普通消息（非推进指令）后，会话阶段应保持不变。

**Validates: Requirements 5.1**

### Property 12: 阶段回退保留对话历史

*For any* 处于阶段 N 的 AI 会话，回退到阶段 M（M < N）后，会话阶段应为 M，且之前的对话历史消息全部保留。

**Validates: Requirements 5.2**

### Property 13: PRD 局部更新保留其余内容

*For any* 包含多个功能点的 PRD 文档，当用户请求修改某个功能点时，PRD 中未被修改的部分应保持不变。

**Validates: Requirements 5.4**

### Property 14: AI 编辑端点统一注入知识库上下文

*For any* AI 编辑端点调用（generate-modified、edit-node、design-workflow），当项目知识库存在时，AI 提示中应包含 toContextString 格式化的知识库内容。

**Validates: Requirements 6.1, 6.2, 6.3, 6.5**

### Property 15: 首次调用自动构建知识库

*For any* 尚未构建知识库的项目，首次调用 AI 编辑端点时，应自动触发知识库构建，且后续请求正常处理。

**Validates: Requirements 6.4**

## 错误处理

### 页面层级

| 错误场景 | 处理方式 |
|---------|---------|
| 拖拽导致循环引用 | 前端检测并阻止拖拽，后端二次校验并返回 400 错误 |
| 设置不存在的页面为父级 | 返回 404 错误，层级不变 |
| hierarchy.json 文件损坏 | 返回空层级，所有页面视为顶级页面 |

### 知识库管理

| 错误场景 | 处理方式 |
|---------|---------|
| 编辑/删除不存在的 Token | 返回 404 错误 |
| 添加无效 Token（缺少必填字段） | 返回 400 错误，附带字段校验信息 |
| 重新扫描时页面数据损坏 | 跳过损坏页面，记录警告日志，继续处理其余页面 |
| knowledge.json 写入失败 | 返回 500 错误，保留原有数据 |

### 设计知识库

| 错误场景 | 处理方式 |
|---------|---------|
| design-knowledge.json 不存在 | 返回空的设计知识库结构 |
| 搜索查询为空字符串 | 返回所有条目 |
| 从捕获页面提取组件时节点不存在 | 返回 404 错误 |
| 组件模板 HTML 格式无效 | 存储原始内容，不做格式校验（由使用方处理） |

### AI 产品助手

| 错误场景 | 处理方式 |
|---------|---------|
| 知识库加载失败 | 记录警告日志，使用空上下文继续处理 |
| 回退到无效阶段 | 返回 400 错误，附带有效阶段列表 |
| 会话不存在 | 返回 404 错误 |
| LLM 调用超时或失败 | 返回 500 错误，建议用户重试 |

### AI 编辑端点

| 错误场景 | 处理方式 |
|---------|---------|
| 项目知识库不存在 | 自动触发构建，构建失败则使用空上下文 |
| 设计知识库不存在 | 使用空上下文（设计知识库为可选） |
| toContextString 处理异常 | 捕获异常，返回空字符串，记录错误日志 |

## 测试策略

### 测试框架

- 单元测试：Vitest
- 属性测试：fast-check（配合 Vitest）
- 前端组件测试：React Testing Library
- API 测试：supertest

### 属性测试配置

- 每个属性测试最少运行 100 次迭代
- 每个测试用注释标注对应的设计属性编号
- 标注格式：**Feature: ai-knowledge-enhanced-workflow, Property {number}: {property_text}**
- 每个正确性属性由一个独立的属性测试实现

### 单元测试覆盖

单元测试聚焦于具体示例、边界情况和错误条件：

- 页面层级：空层级、单层级、深层嵌套、循环检测边界
- 知识库 CRUD：空知识库操作、无效索引、重复添加
- 设计知识库：空搜索、特殊字符搜索、大量数据搜索性能
- AI 上下文注入：空知识库、部分知识库、完整知识库
- 阶段回退：回退到当前阶段、回退到第一阶段、无效阶段

### 属性测试覆盖

属性测试验证跨所有输入的通用属性：

| 属性 | 测试文件 | 生成器 |
|------|---------|--------|
| Property 1: 树形转换 | server/src/__tests__/hierarchy.property.test.ts | 随机 PageHierarchy 映射 |
| Property 2: 设置父级 | server/src/__tests__/hierarchy.property.test.ts | 随机页面对和 parentId |
| Property 3: 删除父页面 | server/src/__tests__/hierarchy.property.test.ts | 随机含子页面的树 |
| Property 4: 循环检测 | server/src/__tests__/hierarchy.property.test.ts | 随机循环引用尝试 |
| Property 5: Token CRUD | server/src/__tests__/knowledge.property.test.ts | 随机 Design Token |
| Property 6: 重新扫描保留 | server/src/__tests__/knowledge.property.test.ts | 随机含自定义条目的知识库 |
| Property 7: 设计KB CRUD | server/src/__tests__/designKnowledge.property.test.ts | 随机组件模板/交互模式/设计原则 |
| Property 8: 模糊搜索 | server/src/__tests__/designKnowledge.property.test.ts | 随机搜索查询和数据 |
| Property 9-10: AI 上下文 | server/src/__tests__/agentKnowledge.property.test.ts | 随机知识库内容和阶段 |
| Property 11-13: 阶段管理 | server/src/__tests__/agentStage.property.test.ts | 随机阶段和消息 |
| Property 14-15: 端点注入 | server/src/__tests__/aiEndpoints.property.test.ts | 随机项目和知识库状态 |

### 测试优先级

1. 高优先级：Property 4（循环检测）、Property 5-6（Token CRUD + 重新扫描）、Property 7（设计KB CRUD）
2. 中优先级：Property 1-3（层级操作）、Property 8（搜索）、Property 14-15（端点注入）
3. 低优先级：Property 9-13（AI 阶段管理，依赖 LLM mock）
