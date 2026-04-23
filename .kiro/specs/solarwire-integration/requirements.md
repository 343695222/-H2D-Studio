# 需求文档：SolarWire DSL 集成

## 简介

H2D Studio 当前的 AI 产品助手在线框/高保真阶段直接生成 CaptureTree JSON，该格式极其冗长（每页 5000-20000 tokens），AI 生成准确率低且成本高。SolarWire 是一种 Markdown 风格的 UI 线框 DSL，语法极简（每页仅 200-800 tokens），天然适合 AI 生成和修改。本需求旨在将 SolarWire DSL 集成到 H2D Studio 的完整工作流中，实现捕获页面的结构化摘要、AI 高效生成线框/高保真、聊天面板内联 SVG 预览、以及知识库结构模式增强。

## 术语表

- **SolarWire_DSL**: Markdown 风格的 UI 线框描述语言，支持矩形 `["text"]`、圆角矩形 `("text")`、圆形 `(("text"))`、表格 `##`/`#`、连线 `--"label"--` 等语法
- **SolarWire_Parser**: SolarWire 库提供的解析器（基于 Peggy/PEG.js），将 DSL 文本解析为 AST
- **SolarWire_SVG_Renderer**: SolarWire 库提供的 SVG 渲染器，将 AST 渲染为 SVG 字符串
- **CaptureTree**: H2D Studio 的页面快照树形结构，包含 root（ElementSnapshot）、documentTitle、documentRect、viewportRect 等字段
- **ElementSnapshot**: CaptureTree 中的元素节点，包含 nodeType=1、id、tag、attributes、styles（camelCase CSS）、rect（{x,y,width,height}）、childNodes
- **TextSnapshot**: CaptureTree 中的文本节点，包含 nodeType=3、id、text、rect
- **SolarWire_Converter_Service**: 后端转换服务，负责 SolarWire ↔ CaptureTree 双向转换
- **Product_Agent_Service**: 后端 AI 产品助手服务（server/src/services/productAgent.ts），基于 LangGraph 的多阶段状态机
- **Agent_Panel**: AI 产品助手面板（web/src/components/agent/AgentPanel.tsx）
- **Knowledge_Base_Service**: 后端知识库核心服务（server/src/services/knowledgeBase.ts）
- **SolarWire_AST**: SolarWire 解析器输出的抽象语法树中间表示

## 需求

### 需求 1：SolarWire → CaptureTree 转换服务

**用户故事：** 作为编辑器用户，我希望将 SolarWire DSL 文本转换为 CaptureTree 格式，以便在现有编辑器画布中渲染和编辑 AI 生成的线框。

#### 验收标准

1. WHEN 接收到有效的 SolarWire DSL 文本时，THE SolarWire_Converter_Service SHALL 调用 SolarWire_Parser 解析为 SolarWire_AST，然后将 AST 转换为符合 CaptureTree 接口的对象
2. WHEN SolarWire DSL 中包含矩形元素 `["text"]` 时，THE SolarWire_Converter_Service SHALL 将其转换为 tag="div" 的 ElementSnapshot，带有 border 样式和内部 TextSnapshot 子节点
3. WHEN SolarWire DSL 中包含圆角矩形 `("text")` 时，THE SolarWire_Converter_Service SHALL 将其转换为 tag="div" 的 ElementSnapshot，带有 borderRadius 样式
4. WHEN SolarWire DSL 中包含圆形 `(("text"))` 时，THE SolarWire_Converter_Service SHALL 将其转换为 tag="div" 的 ElementSnapshot，带有 borderRadius="50%" 样式且宽高相等
5. WHEN SolarWire DSL 中包含坐标属性 `@(x,y)` 时，THE SolarWire_Converter_Service SHALL 将坐标映射到 ElementSnapshot 的 rect.x 和 rect.y 字段
6. WHEN SolarWire DSL 中包含样式属性（w、h、bg、c、size、bold、r）时，THE SolarWire_Converter_Service SHALL 将其映射到 ElementSnapshot 的 styles 字段（width、height、backgroundColor、color、fontSize、fontWeight、borderRadius）
7. WHEN SolarWire DSL 中包含表格结构（`##` 容器和 `#` 行）时，THE SolarWire_Converter_Service SHALL 将其转换为嵌套的 div 结构，使用 flex 布局模拟表格
8. IF SolarWire DSL 文本解析失败，THEN THE SolarWire_Converter_Service SHALL 返回包含错误位置和描述的错误对象
9. THE SolarWire_Converter_Service SHALL 为每个生成的 ElementSnapshot 分配唯一的 id
10. WHEN 转换完成时，THE SolarWire_Converter_Service SHALL 生成完整的 CaptureTree 对象，包含 root、documentTitle、documentRect、viewportRect 和 devicePixelRatio 字段

### 需求 2：CaptureTree → SolarWire 转换服务

**用户故事：** 作为产品经理，我希望将捕获的页面自动转换为 SolarWire DSL 格式的结构摘要，以便 AI 助手能以紧凑格式理解现有页面结构。

#### 验收标准

1. WHEN 接收到有效的 CaptureTree 对象时，THE SolarWire_Converter_Service SHALL 遍历树结构并生成对应的 SolarWire DSL 文本
2. WHEN CaptureTree 中的 ElementSnapshot 具有 borderRadius="50%" 且宽高相等时，THE SolarWire_Converter_Service SHALL 将其转换为圆形语法 `(("text"))`
3. WHEN CaptureTree 中的 ElementSnapshot 具有非零 borderRadius 时，THE SolarWire_Converter_Service SHALL 将其转换为圆角矩形语法 `("text")`
4. WHEN CaptureTree 中的 ElementSnapshot 具有 border 样式且无 borderRadius 时，THE SolarWire_Converter_Service SHALL 将其转换为矩形语法 `["text"]`
5. WHEN CaptureTree 中的节点具有 rect 坐标时，THE SolarWire_Converter_Service SHALL 生成对应的 `@(x,y)` 坐标属性
6. WHEN CaptureTree 中的节点具有 backgroundColor、color、fontSize 等样式时，THE SolarWire_Converter_Service SHALL 生成对应的 SolarWire 属性（bg、c、size 等）
7. THE SolarWire_Converter_Service SHALL 提供 SolarWire DSL 的格式化输出（Pretty Printer），生成可读的缩进文本
8. FOR ALL 有效的 SolarWire DSL 文本，解析为 AST 后再格式化输出（Pretty Print）后再解析，SHALL 产生等价的 AST（往返一致性）

### 需求 3：AI 产品助手 SolarWire 集成

**用户故事：** 作为产品经理，我希望 AI 产品助手在线框和高保真阶段使用 SolarWire DSL 而非 CaptureTree JSON，以便 AI 生成更快、更准确、成本更低。

#### 验收标准

1. WHEN AI 助手处于线框生成阶段时，THE Product_Agent_Service SHALL 使用包含 SolarWire DSL 语法说明的提示词，指导 AI 输出 SolarWire 格式而非 CaptureTree JSON
2. WHEN AI 助手处于高保真设计阶段时，THE Product_Agent_Service SHALL 使用包含 SolarWire DSL 样式属性说明的提示词，指导 AI 在线框基础上添加颜色、字体等样式属性
3. WHEN AI 返回包含 SolarWire 代码块的响应时，THE Product_Agent_Service SHALL 从响应中提取 SolarWire 代码块内容
4. WHEN 提取到 SolarWire 代码块后，THE Product_Agent_Service SHALL 调用 SolarWire_Converter_Service 将其转换为 CaptureTree，并存储到会话状态的 wireframeTree 或 hifiTree 字段
5. IF AI 返回的 SolarWire 代码块解析失败，THEN THE Product_Agent_Service SHALL 在响应中附加错误提示，建议用户要求 AI 修正语法

### 需求 4：AgentPanel SolarWire SVG 内联预览

**用户故事：** 作为产品经理，我希望在 AI 聊天面板中看到 SolarWire 代码块的 SVG 可视化预览，以便直观评估 AI 生成的线框效果。

#### 验收标准

1. WHEN AI 消息中包含 SolarWire 代码块（以 \`\`\`solarwire 标记）时，THE Agent_Panel SHALL 检测该代码块并渲染为内联 SVG 预览
2. WHEN 渲染 SolarWire SVG 预览时，THE Agent_Panel SHALL 调用 SolarWire_SVG_Renderer 将 DSL 文本转换为 SVG 字符串，并以 inline 方式嵌入消息气泡中
3. WHEN SVG 预览下方，THE Agent_Panel SHALL 展示"导入到编辑器"按钮
4. IF SolarWire 代码块解析或渲染失败，THEN THE Agent_Panel SHALL 以普通代码块形式展示原始 DSL 文本，并显示错误提示
5. WHEN 用户点击 SVG 预览区域时，THE Agent_Panel SHALL 支持展开/折叠原始 SolarWire DSL 源码

### 需求 5：导入到编辑器流程

**用户故事：** 作为产品经理，我希望将 AI 生成的 SolarWire 线框一键导入到编辑器中，以便在画布上进一步编辑和调整。

#### 验收标准

1. WHEN 用户点击"导入到编辑器"按钮时，THE Agent_Panel SHALL 调用后端 API 将 SolarWire DSL 转换为 CaptureTree
2. WHEN 转换成功后，THE Agent_Panel SHALL 将 CaptureTree 加载到编辑器画布中，作为当前页面的编辑树
3. WHEN 导入完成后，THE Agent_Panel SHALL 自动切换到编辑器视图
4. IF 转换失败，THEN THE Agent_Panel SHALL 显示错误提示，说明转换失败原因

### 需求 6：捕获页面自动生成 SolarWire 摘要

**用户故事：** 作为产品经理，我希望每次捕获页面后自动生成 SolarWire 结构摘要并存储为项目知识，以便 AI 助手能以紧凑格式理解现有页面结构。

#### 验收标准

1. WHEN 一个新页面被捕获并保存时，THE SolarWire_Converter_Service SHALL 自动将该页面的 CaptureTree 转换为 SolarWire DSL 文本
2. WHEN SolarWire 摘要生成完成后，THE Knowledge_Base_Service SHALL 将该摘要存储到项目知识库中，关联到对应的页面 ID
3. WHEN AI 助手加载项目知识库上下文时，THE Product_Agent_Service SHALL 包含各页面的 SolarWire 结构摘要，以便 AI 理解现有页面布局
4. IF CaptureTree 转换为 SolarWire 失败（如树结构过于复杂），THEN THE SolarWire_Converter_Service SHALL 记录警告日志并跳过该页面的摘要生成

### 需求 7：知识库 SolarWire 结构模式增强

**用户故事：** 作为产品经理，我希望知识库能存储和管理 SolarWire 结构模式，以便 AI 在生成新页面时能参考现有页面的结构模式。

#### 验收标准

1. WHEN 知识库构建或更新时，THE Knowledge_Base_Service SHALL 从各页面的 SolarWire 摘要中提取常见结构模式（如导航栏、卡片列表、表单布局）
2. WHEN AI 助手处于线框或高保真生成阶段时，THE Product_Agent_Service SHALL 将知识库中的 SolarWire 结构模式作为参考示例注入到提示词中
3. THE Knowledge_Base_Service SHALL 以 SolarWire DSL 片段形式存储结构模式，每个模式包含名称、描述和 DSL 代码

### 需求 8：SolarWire API 端点

**用户故事：** 作为前端开发者，我希望后端提供 SolarWire 相关的 API 端点，以便前端调用解析、渲染和转换功能。

#### 验收标准

1. WHEN 前端发送 SolarWire DSL 文本到解析端点时，THE SolarWire API SHALL 返回解析后的 AST 对象
2. WHEN 前端发送 SolarWire DSL 文本到 SVG 渲染端点时，THE SolarWire API SHALL 返回渲染后的 SVG 字符串
3. WHEN 前端发送 SolarWire DSL 文本到转换端点时，THE SolarWire API SHALL 返回转换后的 CaptureTree 对象
4. WHEN 前端发送 CaptureTree 对象到反向转换端点时，THE SolarWire API SHALL 返回生成的 SolarWire DSL 文本
5. IF 任何端点接收到无效输入，THEN THE SolarWire API SHALL 返回 400 状态码和描述性错误信息
