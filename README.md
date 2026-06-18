# AI 视觉对话助手

打开摄像头与麦克风，让 AI 看到您、听到您，并实时语音回应。
演示视频地址：[【AI 视频助手-哔哩哔哩】](https://b23.tv/Klj2PKc)

## 演示视频

[【AI 视频助手-哔哩哔哩】](https://b23.tv/Klj2PKc)

## 特性

- 📷 **实时视觉理解** — AI 能看见摄像头画面中的物体、场景、文字，基于通义千问 Qwen-VL 多模态大模型
- 💬 **聊天覆盖层** — 左上角半透明气泡显示最近 3 轮对话，支持流式逐字输出（SSE）
- 🎤 **语音交互** — 按住说话，松手发送；支持文字输入作为备选；AI 用自然中文语音回答，随时可打断
- 🗣️ **Edge 浏览器推荐** — 中文语音识别在 Edge 下表现最佳（Chrome 的 Web Speech API 中文置信度偏低）
- 💰 **极低运营成本** — 本地 STT/TTS（免费）+ 按需帧捕获 + 图像压缩，预估月费仅 ¥5.4
- 🚀 **国内 API** — 通义千问 Qwen-VL-Plus（¥2/百万 tokens），性价比极高

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JavaScript（无框架依赖） |
| 后端 | Python FastAPI + httpx + Pillow |
| 视觉 AI | 通义千问 Qwen-VL-Plus (DashScope API, OpenAI 兼容) |
| 语音识别 | 浏览器 Web Speech API（免费，本地处理） |
| 语音合成 | 浏览器 SpeechSynthesis API（免费，本地处理） |
| 通信 | SSE (Server-Sent Events) 流式输出 |
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
│   ├── index.html         # 主页面布局（接听界面、文字输入、聊天覆盖层）
│   ├── style.css          # 深色主题 UI 样式
│   └── app.js             # 核心应用逻辑（VisualAssistant 类）
├── docs/
│   └── design-document.md # 架构设计、用户故事、成本策略
└── README.md
```

## 快速开始

### 1. 获取 API Key

在 [阿里云百炼平台](https://bailian.console.aliyun.com) 注册并创建 API Key（通义千问 Qwen-VL-Plus）。

### 2. 配置

复制模板并编辑：

```bash
copy backend\.env.example backend\.env
```

在 `backend/.env` 中填入你的 API Key：

```env
AI_API_KEY=sk-your_qwen_api_key_here
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_MODEL=qwen-vl-plus
```

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

> 推荐使用 **Edge** 浏览器，首次使用时允许摄像头和麦克风权限。

## 使用指南

### 基本操作

1. 点击 **"视频通话"** 进入通话界面
2. **按住 🎤 按钮**（或键盘 **空格键**）说话，松手自动发送
3. AI 的回复会以语音和文字气泡形式呈现
4. 也可在底部文本框输入文字，按 Enter 发送

### 界面说明

- **聊天覆盖层** — 左上角半透明区域显示最近 3 条对话，新内容流式出现
- **画中画** — 右上角显示 AI 头像，语音回复时伴有波纹动画
- **摄像头画面** — 全屏显示，保持原始比例（`object-fit: contain`）

### 进阶功能

- **切换摄像头** — 点击 "📷" 按钮切换前置/后置
- **清空对话** — 点击 "🗑️" 清空历史
- **打断回复** — AI 说话时按住 🎤 即可打断

### 快捷键

| 操作 | 快捷键 |
|------|--------|
| 按住说话 | 空格键（按住） |
| 发送文字 | Enter |

## 对话设计

系统提示词采用朋友聊天的风格，要求 AI：
- 回复简短自然，不啰嗦
- 不问画面就不提画面
- 不主动评价用户外貌穿着
- 结合对话历史，不重复说过的话

## 运营成本

| 项目 | 优化前/月 | 优化后/月 |
|------|----------|----------|
| Qwen-VL API 调用 | ~¥30 | ~¥5.4 |
| 语音识别 (云 STT) | ~¥90 | **¥0** (Web Speech API) |
| 语音合成 (云 TTS) | ~¥60 | **¥0** (SpeechSynthesis API) |
| **总计** | **~¥180** | **~¥5.4** |

> 基于日均 100 次对话、每次 3 轮、每轮 1 张图的估算。

## 设计文档

详见 [docs/design-document.md](docs/design-document.md)。
