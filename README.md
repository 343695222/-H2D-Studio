# H2D Studio

> 网页一键捕获 → 指哪改哪可视化编辑 → 导出原型与代码 → 同步到 Figma 精修

基于 [h2d-capture](https://github.com/nicepkg/h2d-capture) 浏览器扩展改造，搭建的自动化原型/需求工具平台。支持项目制多页面捕获形成知识库，AI 驱动 PRD 生成，可视化编辑器指哪改哪，一键复制到 Figma 精修。

## 功能特性

- **网页后台自动捕获**: 浏览器插件一键抓取页面截图 + DOM 结构 + 样式 + 布局信息
- **项目制知识库**: 连续捕获多个页面形成项目知识库，自动提取组件摘要
- **指哪改哪编辑器**: 截图底图上点选/框选组件，直接修改文案、样式、类型、位置
- **编辑与代码双向同步**: 可视化操作实时同步 JSON 结构，支持代码面板手动编辑
- **AI PRD 生成**: 基于知识库 + 自然语言描述自动生成需求文档，支持 Skill 模板自定义
- **多格式导出**: JSON / HTML / React / Vue 代码 + 标注截图 PNG
- **Figma 复制**: 一键复制编辑后的原型到 Figma，保留图层结构
- **WebSocket 实时同步**: 插件捕获后前端页面实时更新
- **多模型 AI 支持**: OpenAI / Claude / 智谱 / Ollama 可切换
- **Skill 配置系统**: 自定义 AI prompt 模板，支持 zip 批量导入/导出

## 技术栈

| 模块 | 技术 |
|------|------|
| 浏览器插件 | TypeScript + Chrome Extension MV3 + esbuild |
| 后端服务 | Express + TypeScript + WebSocket (ws) |
| 前端应用 | React 18 + TypeScript + Vite + Zustand |
| AI 集成 | 多模型适配 (OpenAI/Claude/智谱/Ollama API) |
| 数据存储 | 本地文件系统 (JSON + PNG) |

## 项目结构

```
d:\h2d-capture-main
├── src/                          # 浏览器插件源码
│   ├── assets/                   # 插件图标资源
│   ├── extension/                # 扩展程序入口
│   │   ├── background.ts         # Service Worker 后台脚本
│   │   ├── toolbar.ts            # 页面工具栏 UI
│   │   ├── injector.ts           # Firefox 注入脚本
│   │   ├── manifest.json         # Chrome Manifest V3
│   │   └── manifest.firefox.json # Firefox Manifest
│   └── lib/                      # 核心捕获库
│       ├── core/                 # DOM 处理核心
│       │   ├── walker.ts         # DOM 遍历器
│       │   ├── snapshot.ts       # 节点快照
│       │   ├── styles.ts         # 样式计算
│       │   ├── layout.ts         # 布局推断
│       │   ├── prepare.ts        # 页面预处理
│       │   ├── css-defaults.ts   # CSS 默认值
│       │   └── declared.ts       # 声明样式处理
│       ├── media/                # 媒体处理
│       ├── react/                # React Fiber 检测
│       ├── transform/            # 数据转换
│       ├── typography/           # 字体处理
│       ├── api.ts                # 库入口
│       ├── pipeline.ts           # 捕获流程
│       ├── encoding.ts           # 编码/剪贴板
│       ├── config.ts             # 配置管理
│       └── types.ts              # 类型定义
│
├── server/                       # 后端服务
│   ├── src/
│   │   ├── routes/               # API 路由
│   │   │   ├── projects.ts       # 项目管理 API
│   │   │   ├── capture.ts        # 捕获接收 API
│   │   │   ├── ai.ts             # AI 服务 API
│   │   │   ├── settings.ts       # 设置 API
│   │   │   ├── skills.ts         # Skill 管理 API
│   │   │   └── export.ts         # 导出 API
│   │   ├── services/             # 业务服务
│   │   │   ├── storage.ts        # 文件存储服务
│   │   │   ├── ai.ts             # AI 调用服务
│   │   │   ├── codegen.ts        # 代码生成服务
│   │   │   ├── skillStorage.ts   # Skill 存储服务
│   │   │   └── websocket.ts      # WebSocket 服务
│   │   ├── index.ts              # 服务入口
│   │   ├── types.ts              # 类型定义
│   │   └── utils.ts              # 工具函数
│   ├── data/                     # 数据存储目录
│   │   ├── projects/             # 项目数据
│   │   └── skills/               # Skill 模板
│   └── .env.example              # 环境变量示例
│
├── web/                          # 前端应用
│   ├── src/
│   │   ├── pages/                # 页面组件
│   │   │   ├── ProjectList.tsx   # 项目列表页
│   │   │   ├── ProjectDetail.tsx # 项目详情页
│   │   │   ├── Editor.tsx        # 可视化编辑器
│   │   │   └── Settings.tsx      # 设置页
│   │   ├── components/           # 公共组件
│   │   │   ├── Layout.tsx        # 布局组件
│   │   │   └── editor/           # 编辑器组件
│   │   │       ├── Canvas.tsx    # 画布组件
│   │   │       ├── EditorToolbar.tsx  # 编辑器工具栏
│   │   │       ├── PropertyPanel.tsx  # 属性面板
│   │   │       ├── LayerPanel.tsx     # 图层面板
│   │   │       ├── CodePanel.tsx      # 代码面板
│   │   │       └── ExportMenu.tsx     # 导出菜单
│   │   ├── stores/               # 状态管理 (Zustand)
│   │   │   ├── projectStore.ts   # 项目状态
│   │   │   └── editorStore.ts    # 编辑器状态
│   │   ├── api/                  # API 客户端
│   │   ├── hooks/                # React Hooks
│   │   ├── types/                # 类型定义
│   │   └── utils/                # 工具函数
│   └── index.html
│
├── dist/                         # 插件构建输出
│   ├── chrome/                   # Chrome 扩展包
│   └── firefox/                  # Firefox 扩展包
├── esbuild.config.mjs            # 构建配置
├── package.json                  # 根项目配置
├── tsconfig.json                 # TypeScript 配置
└── README.md                     # 项目文档
```

## 快速开始

### 环境要求
- Node.js >= 20.19.0
- npm
- Chrome/Firefox 浏览器

### 安装
```bash
npm run studio:install
```

### 配置 AI (可选)
```bash
cp server/.env.example server/.env
# 编辑 server/.env 填入 AI API Key
```

### 启动
```bash
# 启动后端
npm run server:dev

# 启动前端 (另一个终端)
npm run web:dev

# 访问 http://localhost:3201
```

### 安装浏览器插件
```bash
npm run build
# Chrome → chrome://extensions/ → 加载已解压的扩展程序 → 选择 dist/chrome
```

## 使用流程

1. **创建项目**: 在 H2D Studio 中创建新项目
2. **捕获页面**: 使用浏览器插件捕获网页 → 自动保存到项目知识库
3. **AI 生成 PRD**: 输入需求描述，AI 基于知识库生成 PRD 文档
4. **可视化编辑**: 在编辑器中点选组件修改文案、样式、位置
5. **导出成果**: 导出代码 (JSON/HTML/React/Vue) 或复制到 Figma

## API 文档

### 项目管理 API (`/api/projects`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 获取所有项目列表 |
| POST | `/api/projects` | 创建新项目 |
| GET | `/api/projects/:id` | 获取项目详情 |
| PUT | `/api/projects/:id` | 更新项目信息 |
| DELETE | `/api/projects/:id` | 删除项目 |
| GET | `/api/projects/:id/pages` | 获取项目所有页面 |
| GET | `/api/projects/:id/pages/:pageId` | 获取页面详情 |
| PUT | `/api/projects/:id/pages/:pageId` | 更新页面编辑数据 |
| DELETE | `/api/projects/:id/pages/:pageId` | 删除页面 |

### 捕获 API (`/api/capture`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/capture/receive` | 接收浏览器插件捕获的数据 |

### AI 服务 API (`/api/ai`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ai/generate-prd` | 基于项目知识库生成 PRD |
| POST | `/api/ai/analyze-modifications` | 分析 PRD 需要的修改 |
| POST | `/api/ai/generate-modified` | 生成修改后的页面结构 |
| POST | `/api/ai/test-connection` | 测试 AI 连接 |
| POST | `/api/ai/chat` | AI 对话 (通用) |
| POST | `/api/ai/generate-code` | 生成代码 |
| POST | `/api/ai/analyze` | 分析页面设计 |

### 设置 API (`/api/settings`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings` | 获取当前设置 |
| PUT | `/api/settings` | 更新设置 |
| POST | `/api/settings/test-ai` | 测试 AI 连接 |

### Skill 管理 API (`/api/skills`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 获取所有 Skill 列表 |
| GET | `/api/skills/:name` | 获取单个 Skill |
| POST | `/api/skills` | 创建新 Skill |
| PUT | `/api/skills/:name` | 更新 Skill |
| DELETE | `/api/skills/:name` | 删除 Skill |
| POST | `/api/skills/upload` | 上传 Skill ZIP 包 |
| GET | `/api/skills/export` | 导出所有 Skill 为 ZIP |

### 导出 API (`/api/export`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/export/html` | 导出为 HTML |
| POST | `/api/export/json` | 导出为 JSON |
| POST | `/api/export/react` | 导出为 React 组件 |
| POST | `/api/export/vue` | 导出为 Vue 组件 |
| POST | `/api/export/zip` | 导出为 ZIP (待实现) |

### WebSocket 事件

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `page:captured` | Server → Client | 页面捕获完成通知 |
| `page:updated` | Server → Client | 页面更新通知 |
| `page:deleted` | Server → Client | 页面删除通知 |
| `project:created` | Server → Client | 项目创建通知 |
| `project:deleted` | Server → Client | 项目删除通知 |

## Skill 模板

Skill 是 AI PRD 生成的 Prompt 模板，支持自定义生成风格和内容。

### 内置 Skill

- `default-prd`: 默认 PRD 生成模板
- `detailed-spec`: 详细规格文档模板
- `quick-summary`: 快速摘要模板

### 创建 Skill

1. 在 Settings 页面点击 "新建 Skill"
2. 填写名称、标题、描述
3. 编写 Prompt 模板内容
4. 保存

### 上传 Skill ZIP

支持批量导入 Skill:

1. 准备 ZIP 文件，包含 `.md` 文件
2. 可选: 添加 `skill-config.json` 配置文件
3. 在 Settings 页面上传 ZIP

**skill-config.json 格式:**
```json
{
  "skills": [
    {
      "file": "my-skill.md",
      "name": "my-skill",
      "title": "我的模板",
      "description": "描述"
    }
  ]
}
```

### 导出 Skill

在 Settings 页面点击 "导出全部"，将生成包含所有 Skill 的 ZIP 文件。

## 安全设计

- AI 密钥仅存于 `server/.env`
- `.env` 已加入 `.gitignore`
- 本地服务绑定 `127.0.0.1`
- 插件权限最小化 (`activeTab`, `scripting`)
- 数据本地存储，不上传云端

## 开发命令

### 根项目命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建浏览器插件 |
| `npm run build:zip` | 构建并打包 ZIP |
| `npm run build:chrome` | 仅构建 Chrome 版 |
| `npm run build:firefox` | 仅构建 Firefox 版 |
| `npm run watch` | 监听文件变化自动构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行单元测试 |
| `npm run test:e2e` | 运行 E2E 测试 |
| `npm run server:dev` | 启动后端开发服务 |
| `npm run web:dev` | 启动前端开发服务 |
| `npm run studio:install` | 安装所有依赖 |
| `npm run studio:dev` | 同时启动前后端 |

### Server 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 (热重载) |
| `npm run build` | 编译 TypeScript |
| `npm run start` | 生产模式运行 |

### Web 命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产构建 |

## License

MIT
