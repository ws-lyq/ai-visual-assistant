# AI 视觉对话助手

打开摄像头与麦克风，让 AI 看到您、听到您，并实时语音回应。

## 特性

- 📷 **实时视觉理解** — AI 能看见摄像头画面中的物体、场景、文字
- 🎤 **语音交互** — 用自然语言对话，AI 语音回复
- 💰 **极低运营成本** — 结合本地 STT/TTS + 帧采样 + 图像压缩策略
- 🚀 **国内 API** — 基于 DeepSeek-VL2 视觉大模型（¥1/百万 tokens）

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端 | 原生 HTML/CSS/JavaScript |
| 后端 | Python FastAPI |
| 视觉AI | DeepSeek API (VL2 视觉模型) |
| 语音识别 | 浏览器 Web Speech API (免费) |
| 语音合成 | 浏览器 SpeechSynthesis API (免费) |

## 快速开始

### 1. 配置 API Key

在 `backend/` 目录创建 `.env` 文件：

```env
DEEPSEEK_API_KEY=your_api_key_here
```

### 2. 安装依赖

```bash
cd backend
pip install -r requirements.txt
```

### 3. 启动服务

```bash
cd backend
python main.py
```

### 4. 打开浏览器

访问 `http://localhost:8000`

> 需要 Chrome/Edge 浏览器，并授予摄像头和麦克风权限。
