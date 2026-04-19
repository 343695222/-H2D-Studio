<p align="center">
  <img src="https://img.shields.io/badge/version-1.6.0-blue" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D20.19.0-339933" alt="node">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6" alt="typescript">
</p>

# H2D Studio

> **网页一键捕获 → 指哪改哪可视化编辑 → 导出原型与代码 → 同步到 Figma 精修**

H2D Studio 是一个基于浏览器扩展的自动化原型/需求工具平台。通过 Chrome/Firefox 插件一键抓取网页截图 + DOM 结构 + 样式 + 布局信息，支持项目制多页面捕获形成知识库，AI 驱动 PRD 生成，可视化编辑器指哪改哪，一键复制到 Figma 精修。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [浏览器插件构建与安装](#浏览器插件构建与安装)
- [配置说明](#配置说明)
- [使用流程](#使用流程)
- [API 文档](#api-文档)
- [Skill 模板系统](#skill-模板系统)
- [开发命令](#开发命令)
- [安全设计](#安全设计)
- [License](#license)

---

## 功能特性

| 功能 | 说明 |
|------|------|
| 🕷️ **网页自动捕获** | 浏览器插件一键抓取页面截图 + DOM 结构 + 样式 + 布局信息 |
| 📚 **项目制知识库** | 连续捕获多个页面形成项目知识库，自动提取组件摘要 |
| 🎯 **指哪改哪编辑器** | 截图底图上点选/框选组件，直接修改文案、样式、类型、位置 |
| 🔄 **编辑与代码双向同步** | 可视化操作实时同步 JSON 结构，支持代码面板手动编辑 |
| 🤖 **AI PRD 生成** | 基于知识库 + 自然语言描述自动生成需求文档，支持 Skill 模板 |
| 📦 **多格式导出** | JSON / HTML / React / Vue 代码 + 标注截图 PNG |
| 🎨 **Figma 复制** | 一键复制编辑后的原型到 Figma，保留图层结构 |
| ⚡ **WebSocket 实时同步** | 插件捕获后前端页面实时更新 |
| 🧠 **多模型 AI 支持** | OpenAI / Claude / 智谱 / Ollama 可切换 |
| 📝 **Skill 配置系统** | 自定义 AI prompt 模板，支持 ZIP 批量导入/导出 |

---

## 技术栈

| 模块 | 技术 | 说明 |
|------|------|------|
| 浏览器插件 | TypeScript + Chrome Extension MV3 + esbuild | 支持 Chrome & Firefox 双平台 |
| 后端服务 | Express + TypeScript + WebSocket (ws) | 轻量级 Node.js 服务 |
| 前端应用 | React 18 + TypeScript + Vite + Zustand | 现代化 SPA 架构 |
| AI 集成 | 多模型适配 (OpenAI/Claude/智谱/Ollama) | 统一接口，灵活切换 |
| 数据存储 | 本地文件系统 (JSON + PNG) | 零依赖，数据透明 |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        H2D Studio 系统架构                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     WebSocket      ┌──────────────────────────┐  │
│  │              │ ◄───────────────►  │                          │  │
│  │   浏览器插件   │                    │      后端服务 (Express)    │  │
│  │  (Chrome/FF) │  POST /api/capture │      Port: 3200          │  │
│  │              │ ─────────────────► │                          │  │
│  └──────────────┘                    │  ┌────────────────────┐  │  │
│       │                              │  │   路由层 (Routes)    │  │  │
│       │ 捕获 DOM/样式/截图            │  │                    │  │  │
│       │                              │  │  • projects.ts      │  │  │
│       ▼                              │  │  • capture.ts       │  │  │
│  ┌──────────────┐   HTTP API         │  │  • ai.ts            │  │  │
│  │              │ ◄──────────────►  │  │  • export.ts        │  │  │
│  │   前端应用     │                    │  │  • skills.ts        │  │  │
│  │   (React)    │  Proxy /api        │  │  • settings.ts      │  │  │
│  │  Port: 3201  │ ─────────────────► │  │  • agent.ts         │  │  │
│  │              │                    │  └────────┬───────────┘  │  │
│  └──────────────┘                    │           │              │  │
│       │                              │  ┌────────▼───────────┐  │  │
│       │                              │  │   服务层 (Services)  │  │  │
│  ┌────┴─────┐                        │  │                    │  │  │
│  │ 页面组件  │                        │  │  • storage.ts      │  │  │
│  │          │                        │  │  • ai.ts           │  │  │
│  │ • 项目列表│                        │  │  • codegen.ts      │  │  │
│  │ • 项目详情│                        │  │  • skillStorage.ts │  │  │
│  │ • 编辑器  │                        │  │  • websocket.ts    │  │  │
│  │ • 设置    │                        │  │  • designAgent.ts  │  │  │
│  └──────────┘                        │  │  • productAgent.ts │  │  │
│                                      │  └────────┬───────────┘  │  │
│                                      │           │              │  │
│                                      │  ┌────────▼───────────┐  │  │
│                                      │  │   数据存储 (本地)     │  │  │
│                                      │  │                    │  │  │
│                                      │  │  server/data/      │  │  │
│                                      │  │  ├── projects/     │  │  │
│                                      │  │  │   ├── {id}/      │  │  │
│                                      │  │  │   │   ├── meta.json│ │
│                                      │  │  │   │   └── pages/ │  │  │
│                                      │  │  │   │       ├── capture.json│
│                                      │  │  │   │       ├── screenshot.png│
│                                      │  │  │   │       ├── summary.json│
│                                      │  │  │   │       └── edited.json│
│                                      │  │  └── skills/       │  │  │
│                                      │  │      ├── default-prd.md│
│                                      │  │      ├── detailed-spec.md│
│                                      │  │      └── quick-summary.md│
│                                      │  └────────────────────┘  │  │
│                                      └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 数据流

```
浏览器页面 ──(插件捕获)──► DOM + 样式 + 截图
                              │
                              ▼
                     POST /api/capture/receive
                              │
                              ▼
                     server/data/projects/{id}/pages/{pageId}/
                       ├── capture.json      (DOM 结构 + 样式数据)
                       ├── screenshot.png    (页面截图)
                       ├── summary.json      (组件摘要)
                       └── edited.json       (编辑后的数据)
                              │
                  ┌───────────┼───────────┐
                  ▼           ▼           ▼
              AI PRD      可视化编辑    导出代码
              生成文档     指哪改哪     React/Vue/HTML
```

---

## 项目结构

```
h2d-capture-main/
├── src/                              # 浏览器插件源码
│   ├── assets/                       # 插件图标资源 (16/48/128px)
│   ├── extension/                    # 扩展程序入口
│   │   ├── background.ts             # Service Worker 后台脚本
│   │   ├── toolbar.ts                # 页面工具栏 UI + 项目选择器
│   │   ├── injector.ts               # Firefox MAIN world 注入脚本
│   │   ├── manifest.json             # Chrome Manifest V3 配置
│   │   ├── manifest.firefox.json     # Firefox Manifest 配置
│   │   └── browser.d.ts             # 浏览器 API 类型声明
│   └── lib/                          # 核心捕获库
│       ├── core/                     # DOM 处理核心
│       │   ├── walker.ts             # DOM 树遍历器
│       │   ├── snapshot.ts           # 节点快照序列化
│       │   ├── styles.ts             # 计算样式提取
│       │   ├── layout.ts             # 布局推断引擎
│       │   ├── prepare.ts            # 页面预处理
│       │   ├── css-defaults.ts       # CSS 默认值表
│       │   └── declared.ts           # 声明样式处理
│       ├── media/                    # 媒体资源处理
│       │   ├── resolver.ts           # 图片 URL 解析
│       │   └── svg.ts                # SVG 内联处理
│       ├── react/                    # React 生态支持
│       │   ├── fiber.ts              # React Fiber 检测
│       │   └── tree.ts               # 组件树提取
│       ├── transform/                # 数据变换
│       │   └── matrix.ts             # 矩阵变换计算
│       ├── typography/               # 排版处理
│       │   └── probe.ts              # 字体探测
│       ├── api.ts                    # 库入口 (captureToClipboard)
│       ├── pipeline.ts               # 捕获流程编排
│       ├── encoding.ts               # 编码与剪贴板操作
│       ├── config.ts                 # 捕获配置管理
│       └── types.ts                  # 库类型定义
│
├── server/                           # 后端服务
│   ├── src/
│   │   ├── routes/                   # API 路由层
│   │   │   ├── projects.ts           # 项目 CRUD + 页面管理
│   │   │   ├── capture.ts            # 捕获数据接收
│   │   │   ├── ai.ts                 # AI 服务接口
│   │   │   ├── settings.ts           # 全局设置
│   │   │   ├── skills.ts             # Skill 模板管理
│   │   │   ├── export.ts             # 代码导出
│   │   │   └── agent.ts              # Agent 对话路由
│   │   ├── services/                 # 业务服务层
│   │   │   ├── storage.ts            # 文件系统存储服务
│   │   │   ├── ai.ts                 # 多模型 AI 适配器
│   │   │   ├── codegen.ts            # 代码生成引擎
│   │   │   ├── skillStorage.ts       # Skill 模板存储
│   │   │   ├── websocket.ts          # WebSocket 广播服务
│   │   │   ├── designAgent.ts        # 设计 Agent 服务
│   │   │   └── productAgent.ts       # 产品 Agent 服务
│   │   ├── index.ts                  # 服务入口 (Express + WebSocket)
│   │   ├── types.ts                  # 共享类型定义
│   │   └── utils.ts                  # 工具函数
│   ├── data/                         # 数据存储目录 (gitignored)
│   │   ├── projects/                 # 项目数据
│   │   └── skills/                   # Skill 模板文件
│   ├── .env.example                  # 环境变量模板
│   ├── package.json
│   └── tsconfig.json
│
├── web/                              # 前端应用
│   ├── src/
│   │   ├── pages/                    # 页面组件
│   │   │   ├── ProjectList.tsx       # 项目列表页
│   │   │   ├── ProjectDetail.tsx     # 项目详情页
│   │   │   ├── Editor.tsx            # 可视化编辑器页
│   │   │   └── Settings.tsx          # 设置页 (AI + Skill)
│   │   ├── components/               # 组件库
│   │   │   ├── Layout.tsx            # 全局布局
│   │   │   ├── Loading.tsx           # 加载组件
│   │   │   ├── agent/                # Agent 组件
│   │   │   │   └── AgentPanel.tsx    # Agent 对话面板
│   │   │   └── editor/               # 编辑器组件
│   │   │       ├── Canvas.tsx        # 画布 (截图底图 + 组件渲染)
│   │   │       ├── EditorToolbar.tsx # 编辑器工具栏
│   │   │       ├── PropertyPanel.tsx # 属性编辑面板
│   │   │       ├── LayerPanel.tsx    # 图层面板
│   │   │       ├── CodePanel.tsx     # 代码面板 (JSON 编辑)
│   │   │       ├── ExportMenu.tsx    # 导出菜单
│   │   │       ├── AIPanel.tsx       # AI 面板
│   │   │       ├── AIEditPopover.tsx # AI 编辑弹窗
│   │   │       └── index.ts         # 组件导出
│   │   ├── stores/                   # Zustand 状态管理
│   │   │   ├── projectStore.ts       # 项目状态
│   │   │   └── editorStore.ts        # 编辑器状态
│   │   ├── api/                      # API 客户端
│   │   │   ├── client.ts             # HTTP 请求封装
│   │   │   └── types.ts              # API 类型定义
│   │   ├── hooks/                    # React Hooks
│   │   │   └── useWebSocket.ts       # WebSocket 连接 Hook
│   │   ├── types/                    # 前端类型
│   │   │   └── capture.ts            # 捕获数据类型
│   │   ├── utils/                    # 工具函数
│   │   │   └── figmaClipboard.ts     # Figma 剪贴板工具
│   │   ├── App.tsx                   # 应用入口
│   │   ├── App.css
│   │   ├── main.tsx                  # React 挂载点
│   │   ├── index.css                 # 全局样式
│   │   └── vite-env.d.ts            # Vite 类型声明
│   ├── index.html                    # HTML 入口
│   ├── vite.config.ts                # Vite 配置 (Port 3201 + Proxy)
│   ├── package.json
│   └── tsconfig.json
│
├── esbuild.config.mjs                # 插件构建配置 (esbuild)
├── package.json                      # 根项目配置
├── tsconfig.json                     # TypeScript 配置
├── agents.md                         # AI Agent 协作开发文档
├── LICENSE                           # MIT 许可证
├── PRIVACY.md                        # 隐私政策
└── README.md                         # 项目文档
```

---

## 快速开始

### 环境要求

- **Node.js** >= 20.19.0
- **npm** (随 Node.js 安装)
- **Chrome** 或 **Firefox** 浏览器

### 1. 克隆项目

```bash
git clone https://github.com/343695222/-H2D-Studio.git
cd -H2D-Studio
```

### 2. 安装依赖

```bash
# 一键安装所有模块依赖 (根项目 + server + web)
npm run studio:install

# 或手动安装
npm install
cd server && npm install && cd ..
cd web && npm install && cd ..
```

### 3. 配置 AI (可选)

AI 功能需要配置 API Key，不配置时 AI 相关功能不可用，其他功能正常使用。

```bash
cp server/.env.example server/.env
```

编辑 `server/.env`：

```env
# AI 配置 — 支持 OpenAI / Claude / 智谱 / Ollama
AI_PROVIDER=openai          # openai | claude | zhipu | ollama
AI_API_KEY=sk-your-key      # API Key
AI_BASE_URL=https://api.openai.com/v1  # API Base URL
AI_MODEL=gpt-4o             # 模型名称

# 服务配置
PORT=3200                   # 后端端口
HOST=127.0.0.1              # 绑定地址
```

### 4. 启动服务

```bash
# 方式一：同时启动前后端 (推荐)
npm run studio:dev

# 方式二：分别启动
npm run server:dev          # 后端 → http://127.0.0.1:3200
npm run web:dev             # 前端 → http://localhost:3201
```

启动后访问 **http://localhost:3201** 即可使用 H2D Studio。

### 5. 构建并安装浏览器插件

详见下方 [浏览器插件构建与安装](#浏览器插件构建与安装) 章节。

---

## 浏览器插件构建与安装

### 构建插件

```bash
# 构建所有平台 (Chrome + Firefox)
npm run build

# 仅构建 Chrome 版本
npm run build:chrome

# 仅构建 Firefox 版本
npm run build:firefox

# 构建并打包为 ZIP
npm run build:zip

# 开发模式 — 监听文件变化自动重新构建
npm run watch
```

构建产物输出到 `dist/` 目录：

```
dist/
├── chrome/          # Chrome 扩展包
│   ├── manifest.json
│   ├── background.js
│   ├── toolbar.js
│   ├── capture.js
│   └── assets/      # 图标资源
└── firefox/         # Firefox 扩展包
    ├── manifest.json
    ├── background.js
    ├── toolbar.js
    ├── capture.js
    ├── injector.js   # Firefox 专用注入脚本
    └── assets/
```

### 安装 Chrome 扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目中的 `dist/chrome` 目录
5. 扩展图标出现在浏览器工具栏

### 安装 Firefox 扩展

1. 打开 Firefox，访问 `about:debugging#/runtime/this-firefox`
2. 点击 **临时载入附加组件**
3. 选择 `dist/firefox` 目录中的 `manifest.json`
4. 扩展图标出现在浏览器工具栏

### 使用插件捕获

1. 确保后端服务已启动 (`npm run server:dev`)
2. 在浏览器中打开目标网页
3. 点击工具栏的 H2D Capture 图标
4. 在弹出的工具栏中选择目标项目
5. 点击 **捕获** 按钮
6. 捕获完成后数据自动提交到后端，前端页面实时更新

---

## 配置说明

### 端口配置

| 服务 | 默认端口 | 配置位置 |
|------|---------|---------|
| 后端 API | `3200` | `server/.env` → `PORT` |
| 前端应用 | `3201` | `web/vite.config.ts` → `server.port` |
| WebSocket | `3200` | 与后端共享端口 |

前端通过 Vite Proxy 将 `/api` 和 `/data` 请求代理到后端，开发时无需处理跨域。

### AI 模型配置

| Provider | AI_PROVIDER | AI_BASE_URL | 支持的模型 |
|----------|-------------|-------------|-----------|
| OpenAI | `openai` | `https://api.openai.com/v1` | gpt-4o, gpt-4, gpt-3.5-turbo |
| Claude | `claude` | `https://api.anthropic.com` | claude-3-opus, claude-3-sonnet |
| 智谱 | `zhipu` | `https://open.bigmodel.cn/api/paas` | glm-4, glm-3-turbo |
| Ollama | `ollama` | `http://localhost:11434` | 本地模型 |

---

## 使用流程

```
1. 创建项目          2. 捕获页面           3. AI 生成 PRD
   在 Web 界面          浏览器插件一键         输入需求描述
   创建新项目           抓取网页数据          AI 基于知识库生成
      │                    │                     │
      ▼                    ▼                     ▼
   项目列表页          自动保存截图+DOM       生成需求文档
   项目详情页          +样式+布局信息         支持多种 Skill 模板

4. 可视化编辑          5. 导出成果
   点选组件修改          导出代码
   文案/样式/位置        JSON/HTML/React/Vue
      │                    │
      ▼                    ▼
   编辑与代码             复制到 Figma
   双向同步               保留图层结构
```

### 详细步骤

1. **创建项目**: 在 H2D Studio Web 界面点击 "新建项目"，输入项目名称和描述
2. **捕获页面**: 使用浏览器插件访问目标网页，点击捕获按钮，数据自动提交到项目
3. **查看知识库**: 在项目详情页查看所有已捕获的页面，包含截图、组件摘要
4. **AI 生成 PRD**: 选择 Skill 模板，输入需求描述，AI 基于知识库生成 PRD 文档
5. **可视化编辑**: 进入编辑器，在截图底图上点选组件，修改文案、样式、位置
6. **代码同步**: 编辑操作实时同步到 JSON 代码面板，也可直接编辑代码
7. **导出成果**: 导出为 JSON / HTML / React / Vue 代码，或一键复制到 Figma

---

## API 文档

后端服务基础路径: `http://127.0.0.1:3200`

### 项目管理 `/api/projects`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/projects` | 获取所有项目列表 |
| `POST` | `/api/projects` | 创建新项目 |
| `GET` | `/api/projects/:id` | 获取项目详情 (含页面列表) |
| `PUT` | `/api/projects/:id` | 更新项目信息 |
| `DELETE` | `/api/projects/:id` | 删除项目及其所有页面 |
| `GET` | `/api/projects/:id/pages` | 获取项目所有页面 |
| `GET` | `/api/projects/:id/pages/:pageId` | 获取页面详情 |
| `PUT` | `/api/projects/:id/pages/:pageId` | 更新页面编辑数据 |
| `DELETE` | `/api/projects/:id/pages/:pageId` | 删除页面 |

### 捕获接收 `/api/capture`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/capture/receive` | 接收浏览器插件捕获的数据 (截图 + DOM + 样式) |

### AI 服务 `/api/ai`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/ai/generate-prd` | 基于项目知识库生成 PRD |
| `POST` | `/api/ai/analyze-modifications` | 分析 PRD 需要的修改 |
| `POST` | `/api/ai/generate-modified` | 生成修改后的页面结构 |
| `POST` | `/api/ai/test-connection` | 测试 AI 连接 |
| `POST` | `/api/ai/chat` | AI 对话 (通用) |
| `POST` | `/api/ai/generate-code` | 生成代码 |
| `POST` | `/api/ai/analyze` | 分析页面设计 |

### 设置 `/api/settings`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/settings` | 获取当前设置 |
| `PUT` | `/api/settings` | 更新设置 |
| `POST` | `/api/settings/test-ai` | 测试 AI 连接 |

### Skill 管理 `/api/skills`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/skills` | 获取所有 Skill 列表 |
| `GET` | `/api/skills/:name` | 获取单个 Skill 详情 |
| `POST` | `/api/skills` | 创建新 Skill |
| `PUT` | `/api/skills/:name` | 更新 Skill |
| `DELETE` | `/api/skills/:name` | 删除 Skill |
| `POST` | `/api/skills/upload` | 上传 Skill ZIP 包批量导入 |
| `GET` | `/api/skills/export` | 导出所有 Skill 为 ZIP |

### 导出 `/api/export`

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/export/html` | 导出为 HTML |
| `POST` | `/api/export/json` | 导出为 JSON |
| `POST` | `/api/export/react` | 导出为 React 组件 |
| `POST` | `/api/export/vue` | 导出为 Vue 组件 |

### WebSocket 事件

连接地址: `ws://127.0.0.1:3200`

| 事件名 | 方向 | 说明 |
|--------|------|------|
| `page:captured` | Server → Client | 页面捕获完成通知 |
| `page:updated` | Server → Client | 页面编辑更新通知 |
| `page:deleted` | Server → Client | 页面删除通知 |
| `project:created` | Server → Client | 项目创建通知 |
| `project:deleted` | Server → Client | 项目删除通知 |

---

## Skill 模板系统

Skill 是 AI PRD 生成的 Prompt 模板，支持自定义生成风格和内容。

### 内置 Skill

| 名称 | 文件 | 说明 |
|------|------|------|
| `default-prd` | `default-prd.md` | 默认 PRD 生成模板 |
| `detailed-spec` | `detailed-spec.md` | 详细规格文档模板 |
| `quick-summary` | `quick-summary.md` | 快速摘要模板 |

### 创建自定义 Skill

1. 在 Settings 页面点击 **新建 Skill**
2. 填写名称、标题、描述
3. 编写 Prompt 模板内容 (支持 Markdown)
4. 保存即可在 AI PRD 生成时选择使用

### 批量导入 Skill (ZIP)

准备 ZIP 文件，包含 `.md` 文件和可选的 `skill-config.json`：

```json
{
  "skills": [
    {
      "file": "my-skill.md",
      "name": "my-skill",
      "title": "我的模板",
      "description": "自定义 PRD 生成模板"
    }
  ]
}
```

在 Settings 页面上传 ZIP 即可批量导入。

---

## 开发命令

### 根项目命令

| 命令 | 说明 |
|------|------|
| `npm run build` | 构建浏览器插件 (Chrome + Firefox) |
| `npm run build:chrome` | 仅构建 Chrome 版 |
| `npm run build:firefox` | 仅构建 Firefox 版 |
| `npm run build:zip` | 构建并打包为发布 ZIP |
| `npm run watch` | 监听文件变化自动构建插件 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run studio:install` | 安装所有模块依赖 |
| `npm run studio:dev` | 同时启动前后端开发服务 |
| `npm run server:dev` | 仅启动后端服务 |
| `npm run web:dev` | 仅启动前端服务 |

### Server 命令

| 命令 | 说明 |
|------|------|
| `cd server && npm run dev` | 开发模式 (tsx watch 热重载) |
| `cd server && npm run build` | 编译 TypeScript 到 dist/ |
| `cd server && npm run start` | 生产模式运行编译后的代码 |

### Web 命令

| 命令 | 说明 |
|------|------|
| `cd web && npm run dev` | 启动 Vite 开发服务器 (port 3201) |
| `cd web && npm run build` | 构建生产版本 |
| `cd web && npm run preview` | 预览生产构建 |

---

## 安全设计

- 🔐 AI 密钥仅存于 `server/.env`，已加入 `.gitignore`
- 🏠 本地服务绑定 `127.0.0.1`，不暴露到公网
- 🔌 插件权限最小化 (`activeTab`, `scripting`)
- 💾 数据本地存储，不上传云端
- 🛡️ 前端通过 Vite Proxy 代理 API 请求

---

## License

[MIT](LICENSE)
