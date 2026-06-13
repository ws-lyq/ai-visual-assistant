class VisualAssistant {
    constructor() {
        this.stream = null;
        this.isCameraOn = false;
        this.isListening = false;
        this.isProcessing = false;
        this.recognition = null;
        this.recognizedText = '';
        this.isSpeaking = false;
        this.conversationHistory = [];
        this.facingMode = 'user';
        this.lastFrameCapture = 0;

        this.isVoiceActive = false;
        this.accumulatedText = '';
        this.silenceTimer = null;
        this.silenceTimeout = 1500;

        this.elements = {
            video: document.getElementById('camera-preview'),
            canvas: document.getElementById('frame-canvas'),
            placeholder: document.getElementById('camera-placeholder'),
            statusBadge: document.getElementById('status-badge'),
            btnCamera: document.getElementById('btn-toggle-camera'),
            cameraIcon: document.getElementById('camera-icon'),
            cameraText: document.getElementById('camera-text'),
            btnSwitch: document.getElementById('btn-switch-camera'),
            btnSnapshot: document.getElementById('btn-snapshot'),
            btnPtt: document.getElementById('btn-ptt'),
            pttIcon: document.getElementById('ptt-icon'),
            pttText: document.getElementById('ptt-text'),
            textInput: document.getElementById('text-input'),
            btnSend: document.getElementById('btn-send'),
            btnClear: document.getElementById('btn-clear'),
            audioLevel: document.getElementById('audio-level'),
            audioBar: document.getElementById('audio-bar'),
            chatMessages: document.getElementById('chat-messages'),
            debugFps: document.getElementById('debug-fps'),
            debugApi: document.getElementById('debug-api'),
            debugStt: document.getElementById('debug-stt'),
        };

        this.setupEventListeners();
        this.initSpeechRecognition();
        this.initTTS();
        this.checkApiHealth();
    }

    initTTS() {
        if (!window.speechSynthesis) return;
        const voices = speechSynthesis.getVoices();
        if (voices.length === 0) {
            speechSynthesis.addEventListener('voiceschanged', () => {
                speechSynthesis.getVoices();
            }, { once: true });
        }
        speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.addSystemMessage('您的浏览器不支持语音识别，请使用 Chrome/Edge');
            this.elements.btnPtt.disabled = true;
            return;
        }
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onresult = (event) => {
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                }
            }
            if (final) {
                this.accumulatedText += final;
                if (this.isSpeaking) {
                    window.speechSynthesis.cancel();
                    this.isSpeaking = false;
                    this.setDebug('stt', '聆听中...');
                }
            }
            this.resetSilenceTimer();
        };

        this.recognition.onerror = (event) => {
            this.setDebug('stt', `错误: ${event.error}`);
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            this.addSystemMessage(`语音识别错误: ${event.error}`);
            if (this.isVoiceActive) {
                this.stopVoice();
            }
        };

        this.recognition.onend = () => {
            this.setDebug('stt', '空闲');
            if (this.isVoiceActive) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // ignore restart errors
                }
            }
        };
    }

    setupEventListeners() {
        this.elements.btnCamera.addEventListener('click', () => this.toggleCamera());
        this.elements.btnSwitch.addEventListener('click', () => this.switchCamera());
        this.elements.btnSnapshot.addEventListener('click', () => this.captureSnapshot());

        this.elements.btnPtt.addEventListener('click', () => this.toggleVoice());

        this.elements.btnSend.addEventListener('click', () => this.sendTextMessage());
        this.elements.btnClear.addEventListener('click', () => this.clearConversation());
        this.elements.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendTextMessage();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && e.target === document.body && this.isCameraOn) {
                e.preventDefault();
                this.toggleVoice();
            }
        });
    }

    toggleVoice() {
        if (this.isProcessing) return;
        if (this.isVoiceActive) {
            this.stopVoice();
        } else {
            this.startVoice();
        }
    }

    startVoice() {
        if (!this.recognition) {
            this.addSystemMessage('浏览器不支持语音识别');
            return;
        }
        if (!this.isCameraOn) {
            this.addSystemMessage('请先开启摄像头');
            return;
        }
        if (this.isSpeaking) {
            window.speechSynthesis.cancel();
            this.isSpeaking = false;
        }

        this.isVoiceActive = true;
        this.accumulatedText = '';
        this.setVoiceUI(true);
        this.setDebug('stt', '聆听中...');
        this.elements.audioLevel.style.display = 'block';
        this.elements.audioBar.classList.add('active');

        try {
            this.recognition.start();
        } catch (e) {
            // already started, ignore
        }
    }

    stopVoice() {
        this.isVoiceActive = false;
        this.clearSilenceTimer();
        this.accumulatedText = '';
        this.setVoiceUI(false);
        this.setDebug('stt', '空闲');
        this.elements.audioLevel.style.display = 'none';
        this.elements.audioBar.classList.remove('active');

        try {
            this.recognition.stop();
        } catch (e) {
            // ignore
        }
    }

    setVoiceUI(active) {
        if (active) {
            this.elements.btnPtt.classList.add('voice-active');
            this.elements.pttText.textContent = '停止语音对话';
            this.elements.pttIcon.textContent = '🎙️';
        } else {
            this.elements.btnPtt.classList.remove('voice-active');
            this.elements.pttText.textContent = '开始语音对话';
            this.elements.pttIcon.textContent = '🎤';
        }
    }

    resetSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }
        this.silenceTimer = setTimeout(() => {
            this.silenceTimer = null;
            this.submitVoiceText();
        }, this.silenceTimeout);
    }

    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    submitVoiceText() {
        const text = this.accumulatedText.trim();
        this.accumulatedText = '';
        if (!text || !this.isVoiceActive || this.isProcessing) return;
        this.addMessage('user', text);
        const image = this.getFrameBase64();
        this.sendToAI(text, image);
    }

    setStatus(state) {
        const badge = this.elements.statusBadge;
        badge.className = 'status-' + state;
        const labels = { offline: '未连接', online: '已就绪', thinking: '思考中...' };
        badge.textContent = labels[state] || state;
    }

    setDebug(key, value) {
        const map = { fps: 'debugFps', api: 'debugApi', stt: 'debugStt' };
        const el = this.elements[map[key]];
        if (el) el.textContent = `${key}: ${value}`;
    }

    async checkApiHealth() {
        try {
            const resp = await fetch('/api/health');
            const data = await resp.json();
            if (data.status === 'ok' && data.api_configured) {
                this.setStatus('online');
                this.setDebug('api', '已连接');
                this.elements.btnPtt.disabled = false;
                this.elements.textInput.disabled = false;
                this.elements.btnSend.disabled = false;
            } else {
                this.setDebug('api', '未配置 Key');
                this.addSystemMessage('请先在 backend/.env 中配置 AI_API_KEY');
            }
        } catch {
            this.setDebug('api', '未连接');
            this.addSystemMessage('无法连接到后端服务，请确保服务器已启动');
        }
    }

    async toggleCamera() {
        if (this.isCameraOn) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: this.facingMode,
                },
                audio: false,
            };
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.video.srcObject = this.stream;
            await this.elements.video.play();
            this.elements.video.classList.add('active');
            this.elements.placeholder.style.display = 'none';
            this.isCameraOn = true;
            this.elements.cameraText.textContent = '关闭摄像头';
            this.elements.cameraIcon.textContent = '📷';
            this.elements.btnSwitch.style.display = 'inline-flex';
            this.elements.btnSnapshot.style.display = 'inline-flex';
            this.captureFrame();
            this.updateDebugFps();
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                this.addSystemMessage('请允许摄像头访问权限');
            } else if (err.name === 'NotFoundError') {
                this.addSystemMessage('未检测到摄像头设备');
            } else {
                this.addSystemMessage('摄像头启动失败: ' + err.message);
            }
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this.isVoiceActive) {
            this.stopVoice();
        }
        this.elements.video.classList.remove('active');
        this.elements.video.srcObject = null;
        this.elements.placeholder.style.display = 'flex';
        this.isCameraOn = false;
        this.elements.cameraText.textContent = '开启摄像头';
        this.elements.btnSwitch.style.display = 'none';
        this.elements.btnSnapshot.style.display = 'none';
        this.setDebug('fps', '0');
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        this.stopCamera();
        await this.startCamera();
    }

    captureFrame() {
        const video = this.elements.video;
        const canvas = this.elements.canvas;
        if (!video.videoWidth) return;

        const maxW = 640, maxH = 480;
        let w = video.videoWidth, h = video.videoHeight;
        if (w > maxW) { h = h * maxW / w; w = maxW; }
        if (h > maxH) { w = w * maxH / h; h = maxH; }

        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        const ctx = canvas.getContext('2d');
        if (this.facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        this.lastFrameCapture = Date.now();
    }

    captureSnapshot() {
        this.captureFrame();
        this.addSystemMessage('已拍照');
    }

    getFrameBase64() {
        this.captureFrame();
        const canvas = this.elements.canvas;
        if (!canvas.width) return null;
        return canvas.toDataURL('image/jpeg', 0.6);
    }

    updateDebugFps() {
        this.setDebug('fps', '待命');
    }

    addMessage(role, text) {
        const div = document.createElement('div');
        div.className = `message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = role === 'user' ? '我' : 'AI';

        const content = document.createElement('div');
        content.className = 'msg-content';
        content.textContent = text;

        div.appendChild(avatar);
        div.appendChild(content);
        this.elements.chatMessages.appendChild(div);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    addThinkingMessage() {
        const div = document.createElement('div');
        div.className = 'message assistant thinking';
        div.id = 'thinking-msg';

        const avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = 'AI';

        const content = document.createElement('div');
        content.className = 'msg-content';
        content.textContent = '思考中';

        div.appendChild(avatar);
        div.appendChild(content);
        this.elements.chatMessages.appendChild(div);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
        return div;
    }

    removeThinkingMessage() {
        const el = document.getElementById('thinking-msg');
        if (el) el.remove();
    }

    addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'message system';
        const content = document.createElement('div');
        content.className = 'msg-content';
        content.textContent = text;
        div.appendChild(content);
        this.elements.chatMessages.appendChild(div);
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    async sendTextMessage() {
        const text = this.elements.textInput.value.trim();
        if (!text || this.isProcessing) return;
        this.elements.textInput.value = '';
        this.addMessage('user', text);

        const image = this.getFrameBase64();
        await this.sendToAI(text, image);
    }

    async sendToAI(text, image) {
        this.isProcessing = true;
        this.setStatus('thinking');

        const history = this.conversationHistory.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.role === 'user'
                ? [{ type: 'text', text: msg.text }]
                : msg.text,
        }));

        this.addThinkingMessage();

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, image, conversation_history: history }),
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${resp.status}`);
            }

            const data = await resp.json();
            this.removeThinkingMessage();

            this.conversationHistory.push({ role: 'user', text });
            this.conversationHistory.push({ role: 'assistant', text: data.reply });

            this.addMessage('assistant', data.reply);
            this.speakText(data.reply);
        } catch (err) {
            this.removeThinkingMessage();
            this.addSystemMessage('请求失败: ' + err.message);
        } finally {
            this.isProcessing = false;
            this.setStatus('online');
        }
    }

    clearConversation() {
        this.conversationHistory = [];
        this.elements.chatMessages.querySelectorAll('.message:not(.system)').forEach(el => el.remove());
        this.addSystemMessage('对话已清空');
    }

    speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.1;
        utterance.volume = 1.0;

        this.isSpeaking = true;
        this.setDebug('stt', '🔊 播报中...');
        utterance.onstart = () => {
            this.setDebug('stt', '🔊 播报中...');
        };
        utterance.onend = () => {
            this.isSpeaking = false;
            this.setDebug('stt', this.isVoiceActive ? '聆听中...' : '空闲');
        };
        utterance.onerror = (e) => {
            this.isSpeaking = false;
            this.setDebug('stt', this.isVoiceActive ? '聆听中...' : '空闲');
        };

        speechSynthesis.speak(utterance);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VisualAssistant();
});
