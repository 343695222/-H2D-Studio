# 需求文档：AI 知识库增强工作流

## 简介

H2D Studio 当前具备从捕获页面中提取设计规范（色彩、字体、间距、圆角、阴影）和识别组件/布局模式的知识库能力，但用户无法查看和管理知识库内容，页面缺乏层级关系，AI 产品助手未充分利用知识库上下文，且缺少独立的设计知识库（可复用组件模板、交互模式、设计原则）。本需求旨在补齐这些短板，实现从模糊想法到原型的完整 AI 辅助工作流。

## 术语表

- **Knowledge_Base_Service**: 后端知识库核心服务（server/src/services/knowledgeBase.ts），负责从捕获页面提取和聚合设计规范
- **Project_Knowledge_Base**: 项目级知识库，包含从捕获页面自动提取的色彩、字体、间距、圆角、阴影、组件模式、布局模式
- **Design_Knowledge_Base**: 设计知识库，包含可复用 UI 组件模板、交互模式、设计原则，可为项目级或全局级
- **Knowledge_Management_UI**: 知识库管理界面，用户查看、编辑、管理知识库内容的前端页面
- **Page_Hierarchy**: 页面层级结构，捕获页面之间的父子关系树
- **Agent_Panel**: AI 产品助手面板（web/src/components/agent/AgentPanel.tsx），提供从想法到原型的多阶段工作流
- **Product_Agent_Service**: 后端 AI 产品助手服务（server/src/services/productAgent.ts），基于 LangGraph 的多阶段状态机
- **Design_Token**: 设计令牌，从页面中提取的色彩、字体、间距等原子级设计变量
- **Component_Pattern**: 组件模式，从页面中识别的可复用 UI 组件结构（如卡片、表单、表格）
- **Layout_Pattern**: 布局模式，从页面中识别的页面布局结构（如侧边栏+内容、全宽列表）

## 需求

### 需求 1：页面层级管理

**用户故事：** 作为项目管理者，我希望将捕获的页面组织为树形层级结构（父页面/子页面），以便知识库能反映页面之间的从属关系，AI 助手能理解页面上下文。

#### 验收标准

1. WHEN 用户在项目详情页查看页面列表时，THE Page_Hierarchy SHALL 以树形结构展示所有捕获页面，支持展开和折叠子页面
2. WHEN 用户拖拽一个页面到另一个页面上时，THE Page_Hierarchy SHALL 将被拖拽页面设为目标页面的子页面，并更新存储中的层级关系
3. WHEN 用户将一个子页面拖拽到根级别时，THE Page_Hierarchy SHALL 将该页面恢复为顶级页面
4. WHEN 页面层级关系发生变更时，THE Knowledge_Base_Service SHALL 在知识库中记录页面的层级路径信息
5. WHEN 用户删除一个父页面时，THE Page_Hierarchy SHALL 将该父页面的所有子页面提升为顶级页面
6. IF 拖拽操作导致循环层级关系（如 A→B→A），THEN THE Page_Hierarchy SHALL 拒绝该操作并保持原有结构

### 需求 2：知识库管理界面

**用户故事：** 作为设计师或产品经理，我希望在一个专门的界面中查看、编辑和管理项目知识库的全部内容，以便了解项目的设计规范并进行调整。

#### 验收标准

1. THE Knowledge_Management_UI SHALL 以分类标签页展示知识库内容，包含色彩系统、字体规范、间距系统、圆角、阴影、组件模式、布局模式七个分类
2. WHEN 用户查看色彩系统分类时，THE Knowledge_Management_UI SHALL 展示每个颜色的色块预览、色值、用途分类、使用频次和来源页面列表
3. WHEN 用户编辑一个 Design_Token（如修改颜色用途分类）时，THE Knowledge_Management_UI SHALL 将修改持久化到知识库存储，并标记该条目为"用户自定义"
4. WHEN 用户手动添加一个 Design_Token 时，THE Knowledge_Management_UI SHALL 将新条目存入知识库并标记为"用户自定义"
5. WHEN 用户删除一个 Design_Token 时，THE Knowledge_Management_UI SHALL 从知识库中移除该条目
6. WHEN 用户触发"重新扫描"操作时，THE Knowledge_Base_Service SHALL 重新从所有捕获页面提取设计规范，保留用户自定义条目，合并自动提取的条目
7. WHEN 用户查看组件模式分类时，THE Knowledge_Management_UI SHALL 展示每个组件的名称、描述、典型样式、出现频次和来源页面
8. WHEN 用户查看布局模式分类时，THE Knowledge_Management_UI SHALL 展示每个布局的名称、描述、方向、子元素数量和出现频次

### 需求 3：设计知识库

**用户故事：** 作为产品经理，我希望项目拥有一个独立的设计知识库，包含可复用的 UI 组件模板、交互模式和设计原则，以便 AI 助手在生成原型时能参考这些设计资产。

#### 验收标准

1. THE Design_Knowledge_Base SHALL 独立于 Project_Knowledge_Base 存储，包含三个分类：组件模板、交互模式、设计原则
2. WHEN 用户添加一个组件模板时，THE Design_Knowledge_Base SHALL 存储组件名称、描述、适用场景、HTML/CSS 结构模板和预览截图路径
3. WHEN 用户添加一个交互模式时，THE Design_Knowledge_Base SHALL 存储模式名称、描述、触发条件、交互流程和适用组件列表
4. WHEN 用户添加一个设计原则时，THE Design_Knowledge_Base SHALL 存储原则名称、描述和具体规则列表
5. WHEN AI 助手生成原型时，THE Product_Agent_Service SHALL 将 Design_Knowledge_Base 中的组件模板和交互模式作为上下文注入到生成提示中
6. WHEN 用户从捕获页面中提取一个组件时，THE Design_Knowledge_Base SHALL 支持将该组件保存为可复用组件模板
7. THE Design_Knowledge_Base SHALL 提供管理界面，支持对组件模板、交互模式、设计原则的增删改查操作
8. WHEN 用户搜索设计知识库时，THE Design_Knowledge_Base SHALL 支持按名称和描述进行模糊搜索

### 需求 4：AI 产品助手知识库集成

**用户故事：** 作为产品经理，我希望 AI 产品助手在从模糊想法到原型的全流程中自动加载并使用项目知识库和设计知识库，以便生成的需求和原型与现有设计系统保持一致。

#### 验收标准

1. WHEN 用户创建新的 AI 会话时，THE Product_Agent_Service SHALL 自动加载当前项目的 Project_Knowledge_Base 和 Design_Knowledge_Base，并将摘要注入到系统提示中
2. WHEN AI 助手处于需求分析阶段时，THE Product_Agent_Service SHALL 在提示中包含项目已有页面的层级结构和组件模式，以便 AI 理解现有系统
3. WHEN AI 助手处于 PRD 生成阶段时，THE Product_Agent_Service SHALL 在设计约束部分引用 Project_Knowledge_Base 中的具体 Design_Token 值
4. WHEN AI 助手处于设计原则提取阶段时，THE Product_Agent_Service SHALL 结合 Project_Knowledge_Base 的设计规范和 Design_Knowledge_Base 的设计原则生成设计指导
5. WHEN AI 助手处于线框/高保真生成阶段时，THE Product_Agent_Service SHALL 优先使用 Design_Knowledge_Base 中的组件模板构建页面结构
6. WHEN 知识库内容在会话期间被更新时，THE Product_Agent_Service SHALL 在下一次消息处理时使用最新的知识库内容

### 需求 5：AI 产品助手迭代式交互增强

**用户故事：** 作为产品经理，我希望 AI 产品助手支持更灵活的迭代式交互，能够在任意阶段回退和修改，以便从模糊想法逐步细化为完整原型。

#### 验收标准

1. WHEN 用户在任意阶段发送消息时，THE Agent_Panel SHALL 支持用户在当前阶段继续对话而非强制推进到下一阶段
2. WHEN 用户请求回退到前一阶段时，THE Product_Agent_Service SHALL 将会话状态回退到指定阶段，保留之前的对话历史
3. WHEN AI 助手在澄清阶段提问时，THE Agent_Panel SHALL 以结构化的问题卡片形式展示问题，每个问题支持独立回答
4. WHEN 用户在 PRD 阶段请求修改某个功能点时，THE Product_Agent_Service SHALL 仅更新 PRD 中对应的部分，保留其余内容不变
5. THE Agent_Panel SHALL 在界面中展示当前阶段进度指示器，显示所有阶段及当前所处位置
6. WHEN 用户在原型生成阶段对生成结果不满意时，THE Product_Agent_Service SHALL 支持用户描述修改意见并重新生成，保留满意的部分

### 需求 6：AI 编辑端点知识库一致性

**用户故事：** 作为开发者，我希望所有 AI 编辑端点（generate-modified、edit-node、design-workflow）在调用时一致地使用项目知识库上下文，以便 AI 生成的修改与项目设计系统保持一致。

#### 验收标准

1. WHEN 调用 generate-modified 端点时，THE Knowledge_Base_Service SHALL 自动加载当前项目的 Project_Knowledge_Base 并注入到 AI 提示上下文中
2. WHEN 调用 edit-node 端点时，THE Knowledge_Base_Service SHALL 将相关的 Design_Token 和 Component_Pattern 作为样式参考注入到编辑提示中
3. WHEN 调用 design-workflow 端点时，THE Knowledge_Base_Service SHALL 提供完整的知识库上下文，包括色彩系统、字体规范和组件模式
4. IF 项目知识库尚未构建，THEN THE Knowledge_Base_Service SHALL 在首次调用时自动触发知识库构建，然后继续处理请求
5. WHEN 知识库上下文注入到 AI 提示时，THE Knowledge_Base_Service SHALL 使用 toContextString 方法将知识库转换为结构化的文本格式
