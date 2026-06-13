# AI 视觉对话助手

打开摄像头与麦克风，让 AI 看到您、听到您，并实时语音回应。

## 特性

- 📷 **实时视觉理解** — AI 能看见摄像头画面中的物体、场景、文字，基于 DeepSeek-VL2 多模态大模型
- 🎤 **语音交互** — 按住说话，松手发送；支持文字输入作为备选
- 🔊 **语音回复** — AI 用自然中文语音回答，按住说话可随时打断
- 💰 **极低运营成本** — 本地 STT/TTS（免费）+ 按需帧捕获 + 图像压缩，预估月费仅 ¥5.4
- 🚀 **国内 API** — DeepSeek-VL2 视觉大模型（¥1/百万 tokens），性价比极高

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JavaScript（无框架依赖） |
| 后端 | Python FastAPI + httpx + Pillow |
| 视觉 AI | DeepSeek-VL2 API (OpenAI 兼容格式) |
| 语音识别 | 浏览器 Web Speech API（免费，本地处理） |
| 语音合成 | 浏览器 SpeechSynthesis API（免费，本地处理） |
| 图像处理 | Pillow（缩放 + JPEG 压缩） |

## 项目结构

```
ai-visual-assistant/
├── backend/
│   ├── main.py            # FastAPI 服务器，/api/chat + /api/health
│   ├── config.py          # 环境变量配置管理
│   ├── requirements.txt   # Python 依赖
│   └── .env.example       # 配置模板
├── frontend/
│   ├── index.html         # 主页面布局
│   ├── style.css          # 深色主题 UI 样式
│   └── app.js             # 核心应用逻辑（VisualAssistant 类）
├── docs/
│   └── design-document.md # 架构设计、用户故事、成本策略
└── README.md
```

## 快速开始

### 1. 获取 API Key

在 [platform.deepseek.com](https://platform.deepseek.com) 注册并创建 API Key。

### 2. 配置

在 `backend/` 目录创建 `.env` 文件：

```env
DEEPSEEK_API_KEY=sk-your_api_key_here
```

或直接复制模板：

```bash
copy backend\.env.example backend\.env
```

然后编辑 `.env` 填入你的 API Key。

### 3. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 4. 启动服务

```bash
cd backend
python main.py
```

### 5. 打开浏览器

访问 **http://localhost:8000**

> 需要 **Chrome/Edge** 浏览器（≥ 版本 80），首次使用时允许摄像头和麦克风权限。

## 使用指南

### 基本操作

1. **开启摄像头** — 点击"开启摄像头"按钮，授权后即可看到自己的画面
2. **按住说话** — 按住 🎤 按钮（或键盘 **空格键**），对着麦克风说话
3. **松开发送** — 松开按钮，语音自动转为文本发送给 AI
4. **AI 回复** — AI 将分析摄像头画面 + 你的问题，用语音回答

### 进阶功能

- **文字输入** — 在底部文本框输入问题，按 Enter 或点击"发送"
- **切换摄像头** — 点击"🔄 切换"按钮，切换前置/后置摄像头
- **拍照快照** — 点击"📸 拍照"手动捕获当前画面
- **清空对话** — 点击"🗑️"按钮清空对话历史
- **打断回复** — AI 正在说话时，按住说话按钮即可打断

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 按住说话 | 空格键（按住） |
| 发送文字 | Enter |
| 开启/关闭摄像头 | 点击按钮 |

## 设计文档

详见 [docs/design-document.md](docs/design-document.md)，包含：

- 完整的技术架构图和核心流程
- 计划与实现的 14 个用户故事对比
- 10 种运营成本控制策略分析与 7 种实施细节
- 关键设计决策（Web Speech API vs 云 API、按需帧捕获等）
- 成本估算（优化后预计节省 96.7%）
- 未来优化方向

## 运营成本

| 项目 | 优化前/月 | 优化后/月 |
|------|----------|----------|
| DeepSeek API 调用 | ~¥30 | ~¥5.4 |
| 语音识别 (云 STT) | ~¥90 | **¥0** (Web Speech API) |
| 语音合成 (云 TTS) | ~¥60 | **¥0** (SpeechSynthesis API) |
| **总计** | **~¥180** | **~¥5.4** |

> 基于日均 100 次对话、每次 3 轮、每轮 1 张图的估算。
