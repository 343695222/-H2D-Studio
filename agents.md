# H2D Studio — AI Agent 协作开发文档

## 概述

本项目通过 Leader-Agent 多智能体协作模式开发，由 Leader 统一规划任务、分配子任务给专业 Agent，各 Agent 并行独立完成模块开发。

## Agent 协作架构

### Leader (总指挥)
- 负责需求分析、任务拆解、依赖管理、进度跟踪
- 不直接编写代码，通过 TaskCreate/TaskUpdate 管理任务
- 通过 SendMessage 与 Agent 沟通追加需求

### 开发 Agent 列表

| Agent | 角色 | 负责任务 | 涉及目录 |
|-------|------|---------|---------|
| Alex | Researcher | 项目代码调研分析 | 全项目 |
| Jimmy | Backend Dev | Task 1: 项目基础架构搭建 | server/, web/, 根目录 |
| Bill | Frontend Dev | Task 2: 浏览器插件扩展 | src/extension/ |
| James | Backend Dev | Task 3: 后端项目管理服务 | server/ |
| Lee | Frontend Dev | Task 4: 前端项目管理界面 | web/ |
| Taylor | Frontend Dev | Task 5: 可视化编辑器核心 | web/ |
| Felix | Frontend Dev | Task 6: 指哪改哪编辑功能 | web/ |
| Jason | Backend Dev | Task 7: AI PRD + Skill系统 | server/ |
| Jay | General Engineer | Task 8: 导出与Figma复制 | server/, web/ |
| Robin | Backend Dev | Task 9: WebSocket实时通信 | server/, web/ |
| Chris | QA | Task 10: 集成测试验证 | 全项目 |

## 任务依赖图

```
Task 1: 基础架构
    │
    ├──→ Task 2: 浏览器插件扩展 ──┐
    │                             │
    ├──→ Task 3: 后端项目管理 ────┼──→ Task 9: WebSocket ──┐
    │                             │                        │
    └──→ Task 4: 前端项目管理 ────┘                        │
                                                           │
    ═══════════════════════════════════════════════════════│
                         第2轮并行                          │
    ═══════════════════════════════════════════════════════│
                                                           │
Task 5: 编辑器核心 ──┬──→ Task 6: 编辑功能 ──┐              │
                    │                        │              │
Task 7: AI+Skill ───┘                        ├──→ Task 8: 导出/Figma
                    │                        │              │
Task 9: WebSocket ──┘                        │              │
                                             │              │
    ═════════════════════════════════════════│══════════════│
                    第3/4轮并行               │              │
    ═════════════════════════════════════════│══════════════│
                                             │              │
                                            Task 10: 集成测试
```

### 依赖关系说明

```
Task 1 (基础架构)
├── 被依赖: Task 2, Task 3, Task 4
└── 说明: 必须先完成项目初始化、依赖安装、基础配置

Task 2 (浏览器插件)
├── 依赖: Task 1
├── 被依赖: Task 9
└── 说明: 插件捕获数据需要 WebSocket 实时同步

Task 3 (后端服务)
├── 依赖: Task 1
├── 被依赖: Task 4, Task 7, Task 9
└── 说明: 提供项目/页面 API 供前端调用

Task 4 (前端界面)
├── 依赖: Task 1, Task 3
├── 被依赖: Task 5
└── 说明: 项目列表/详情页是编辑器入口

Task 5 (编辑器核心)
├── 依赖: Task 4
├── 被依赖: Task 6
└── 说明: Canvas 画布基础架构

Task 6 (编辑功能)
├── 依赖: Task 5
├── 被依赖: Task 8
└── 说明: 属性编辑、代码同步

Task 7 (AI+Skill)
├── 依赖: Task 3
├── 被依赖: Task 8
└── 说明: PRD 生成、代码生成服务

Task 8 (导出/Figma)
├── 依赖: Task 6, Task 7
├── 被依赖: Task 10
└── 说明: 需要编辑功能和 AI 服务支持

Task 9 (WebSocket)
├── 依赖: Task 2, Task 3
├── 被依赖: Task 10
└── 说明: 插件与前端实时通信

Task 10 (集成测试)
├── 依赖: Task 8, Task 9
└── 说明: 全链路验证
```

## 执行时间线

### 第1轮: 基础架构
- **Task 1 (Jimmy)** — 搭建 server + web 脚手架
  - 初始化 server/ 目录，配置 Express + TypeScript
  - 初始化 web/ 目录，配置 Vite + React + TypeScript
  - 配置根项目 npm scripts
  - 完成时间: 第1轮

### 第2轮: 核心模块 (并行)
- **Task 2 (Bill)** — 浏览器插件扩展
  - 扩展 toolbar.ts 添加项目选择器
  - 添加捕获数据提交到后端功能
  - 完成时间: 第2轮

- **Task 3 (James)** — 后端服务
  - 实现 projects.ts 路由
  - 实现 storage.ts 服务
  - 完成时间: 第2轮

- **Task 4 (Lee)** — 前端项目管理界面
  - 实现 ProjectList.tsx 项目列表页
  - 实现 ProjectDetail.tsx 项目详情页
  - 完成时间: 第2轮

### 第3轮: 进阶功能 (并行)
- **Task 5 (Taylor)** — 可视化编辑器核心
  - 实现 Canvas.tsx 画布组件
  - 实现 EditorToolbar.tsx 工具栏
  - 实现 LayerPanel.tsx 图层面板
  - 完成时间: 第3轮

- **Task 7 (Jason)** — AI服务 + Skill
  - 实现 ai.ts 服务 (多模型适配)
  - 实现 skills.ts 路由
  - 实现 skillStorage.ts 服务
  - 完成时间: 第3轮

- **Task 9 (Robin)** — WebSocket
  - 实现 websocket.ts 服务
  - 前端集成 WebSocket hook
  - 插件实时通知集成
  - 完成时间: 第3轮

### 第4轮: 编辑与导出 (并行)
- **Task 6 (Felix)** — 编辑功能
  - 实现 PropertyPanel.tsx 属性面板
  - 实现 CodePanel.tsx 代码面板
  - 实现编辑与代码双向同步
  - 完成时间: 第4轮

- **Task 8 (Jay)** — 导出/Figma
  - 实现 export.ts 路由
  - 实现 codegen.ts 服务
  - 实现 ExportMenu.tsx 导出菜单
  - 实现 figmaClipboard.ts 工具
  - 完成时间: 第4轮

### 第5轮: 验证
- **Task 10 (Chris)** — 集成验证 + bug修复
  - 全链路功能测试
  - 修复发现的问题
  - 完成时间: 第5轮

## 冲突预防策略

### 模块隔离原则
1. **目录隔离**: 每个 Agent 主要负责特定目录，避免交叉修改
   - Bill: 仅修改 src/extension/
   - James/Jason/Robin: 仅修改 server/src/
   - Lee/Taylor/Felix: 仅修改 web/src/
   - Jay: 修改 server/src/routes/export.ts 和 web/src/components/editor/ExportMenu.tsx

2. **接口先行**: 模块间通过明确的 API 接口通信
   - 后端路由在 Task 3 阶段定义完整
   - 前端 API 客户端在 Task 4 阶段封装完成
   - 后续任务仅调用已有接口

3. **状态管理分离**:
   - projectStore.ts (Lee 负责)
   - editorStore.ts (Taylor 负责)
   - 各自独立，通过 props 传递数据

### 串行化共享区域
1. **package.json 修改**: 由 Jimmy (Task 1) 统一处理，后续仅追加依赖
2. **类型定义**: 
   - server/src/types.ts 由 James 在 Task 3 定义基础类型
   - 后续 Agent 只读或追加新类型
3. **API 路由注册**: 
   - server/src/index.ts 中路由注册由 James 在 Task 3 完成基础
   - 后续 Agent 在各自 routes/*.ts 文件内工作

### 文件锁定机制
- 每个 Task 开始前，Leader 明确指定可修改文件列表
- Agent 遇到需要修改他人负责文件时，通过 SendMessage 申请
- 禁止直接修改其他 Agent 正在开发的核心文件

### 通信规范
```
Agent 完成 Task → SendMessage 通知 Leader
Leader 确认完成 → TaskUpdate 标记完成
需要修改他人文件 → SendMessage 申请 → Leader 协调
发现依赖问题 → SendMessage 反馈 → Leader 调整计划
```

## 动态调整记录

### 需求追加记录

#### 1. Skill 配置系统 (Task 7 追加)
**时间**: 第3轮  
**提出**: Jason 在实现 AI PRD 时提出需要可配置模板  
**内容**: 
- 支持自定义 AI prompt 模板
- 内置 default-prd, detailed-spec, quick-summary 模板
- 支持模板 CRUD 操作

**实现**:
- 新增 server/src/services/skillStorage.ts
- 新增 server/src/routes/skills.ts
- 新增 web/src/pages/Settings.tsx 中 Skill 管理界面

#### 2. Skill ZIP 批量上传 (Task 7 追加)
**时间**: 第3轮后期  
**提出**: Leader 在 review 时提出批量导入需求  
**内容**:
- 支持上传 ZIP 文件批量导入 Skill
- 支持导出所有 Skill 为 ZIP

**实现**:
- 使用 adm-zip 库处理压缩包
- POST /api/skills/upload 接口
- GET /api/skills/export 接口

#### 3. 多模型 AI 支持 (Task 7 追加)
**时间**: 第3轮  
**提出**: Jason 在实现 AI 服务时建议支持多模型  
**内容**:
- 支持 OpenAI / Claude / 智谱 / Ollama
- 统一接口适配不同模型格式

**实现**:
- server/src/services/ai.ts 中实现多模型适配器
- 支持通过 .env 切换模型

#### 4. 代码生成 AI 增强 (Task 8 追加)
**时间**: 第4轮  
**提出**: Jay 在实现导出时发现基础代码生成质量不足  
**内容**:
- React/Vue 导出使用 AI 生成高质量代码
- 当 AI 未配置时回退到基础生成

**实现**:
- export.ts 中检测 AI 配置
- 调用 aiService.chat 生成组件代码

#### 5. WebSocket 实时同步 (Task 9 设计细化)
**时间**: 第3轮  
**提出**: Robin 在设计 WebSocket 时细化需求  
**内容**:
- 插件捕获后实时通知前端
- 页面编辑后实时通知其他客户端
- 项目创建/删除广播

**实现**:
- server/src/services/websocket.ts 实现广播机制
- web/src/hooks/useWebSocket.ts 封装客户端
- 各路由中注入 wsService.broadcast 调用

### 架构调整记录

#### 1. 数据存储方案调整
**原计划**: 使用 SQLite 数据库存储  
**调整后**: 使用本地文件系统 (JSON + PNG)  
**原因**: 
- 简化部署，无需数据库服务
- 数据透明，便于调试和备份
- 符合浏览器扩展本地化的设计理念

**影响文件**:
- server/src/services/storage.ts (完全重写)
- 删除数据库相关依赖

#### 2. 编辑器状态管理方案调整
**原计划**: 使用 React Context  
**调整后**: 使用 Zustand  
**原因**:
- Context 在频繁更新时性能差
- Zustand 更轻量，适合编辑器高频操作

**影响文件**:
- web/src/stores/editorStore.ts (新增)
- web/src/stores/projectStore.ts (新增)

#### 3. 代码生成服务拆分
**原计划**: 代码生成放在前端  
**调整后**: 代码生成放在后端 server/src/services/codegen.ts  
**原因**:
- 统一代码生成逻辑
- 支持 AI 增强生成 (需要 API Key)
- 前端只需调用接口

**影响文件**:
- server/src/services/codegen.ts (新增)
- server/src/routes/export.ts (调用 codegen)

### 问题与解决记录

#### 1. Firefox 兼容性问题
**问题**: Firefox 不支持 Chrome Extension MV3 的某些 API  
**解决**: 
- 创建独立的 manifest.firefox.json
- 创建 injector.ts 处理 Firefox 的 MAIN world 注入
- 构建时分别输出到 dist/chrome 和 dist/firefox

#### 2. 跨域图片获取问题
**问题**: 捕获跨域图片时 canvas 污染  
**解决**:
- background.ts 中实现 CORS bridge
- 通过 Service Worker 代理跨域请求
- 多策略回退: canvas 栅格化 → same-origin fetch → CORS bridge

#### 3. 大文件存储性能问题
**问题**: 大页面截图 base64 存储导致内存占用高  
**解决**:
- 截图保存为独立 PNG 文件
- JSON 中只存储文件路径
- 流式读取避免一次性加载

#### 4. WebSocket 重连问题
**问题**: 后端重启后前端无法自动恢复连接  
**解决**:
- useWebSocket hook 中实现自动重连
- 指数退避策略避免频繁重连
- 重连后重新订阅事件

## Agent 协作总结

### 协作效率统计

| 轮次 | 并行任务数 | 实际完成时间 | 冲突次数 |
|------|-----------|-------------|---------|
| 第1轮 | 1 | 正常 | 0 |
| 第2轮 | 3 | 正常 | 0 |
| 第3轮 | 3 | 正常 | 1 (Skill ZIP 功能边界模糊) |
| 第4轮 | 2 | 正常 | 0 |
| 第5轮 | 1 | 正常 | 0 |

### 最佳实践

1. **接口先行**: Task 3 定义的后端 API 接口稳定，后续开发顺利
2. **目录隔离**: 各 Agent 按目录分工，代码冲突极少
3. **及时通信**: Agent 通过 SendMessage 及时反馈进度和问题
4. **灵活调整**: Leader 根据实际进展动态调整任务分配

### 改进建议

1. **预定义类型**: 建议在 Task 1 阶段就定义好所有共享类型
2. **API 文档**: 建议在 Task 3 完成后立即输出 API 文档
3. **测试策略**: 建议每个 Task 包含基础测试，而非集中到 Task 10
