class VisualAssistant {
    constructor() {
        this.stream = null;
        this.isCameraOn = false;
        this.isListening = false;
        this.isProcessing = false;
        this.frameInterval = null;
        this.lastFrameTime = 0;
        this.frameCount = 0;
        this.lastSentImage = null;

        this.elements = {
            video: document.getElementById('camera-preview'),
            canvas: document.getElementById('frame-canvas'),
            placeholder: document.getElementById('camera-placeholder'),
            statusBadge: document.getElementById('status-badge'),
            btnCamera: document.getElementById('btn-toggle-camera'),
            cameraIcon: document.getElementById('camera-icon'),
            cameraText: document.getElementById('camera-text'),
            btnPtt: document.getElementById('btn-ptt'),
            pttIcon: document.getElementById('ptt-icon'),
            pttText: document.getElementById('ptt-text'),
            textInput: document.getElementById('text-input'),
            btnSend: document.getElementById('btn-send'),
            chatMessages: document.getElementById('chat-messages'),
            debugFps: document.getElementById('debug-fps'),
            debugApi: document.getElementById('debug-api'),
            debugStt: document.getElementById('debug-stt'),
        };

        this.setupEventListeners();
        this.checkApiHealth();
    }

    setupEventListeners() {
        this.elements.btnCamera.addEventListener('click', () => this.toggleCamera());
        this.elements.btnPtt.addEventListener('mousedown', () => this.startListening());
        this.elements.btnPtt.addEventListener('mouseup', () => this.stopListening());
        this.elements.btnPtt.addEventListener('touchstart', (e) => { e.preventDefault(); this.startListening(); });
        this.elements.btnPtt.addEventListener('touchend', (e) => { e.preventDefault(); this.stopListening(); });
        this.elements.btnSend.addEventListener('click', () => this.sendTextMessage());
        this.elements.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendTextMessage();
        });
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
                this.addSystemMessage('请先在 backend/.env 中配置 DEEPSEEK_API_KEY');
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
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
                audio: false,
            });
            this.elements.video.srcObject = this.stream;
            await this.elements.video.play();
            this.elements.video.classList.add('active');
            this.elements.placeholder.style.display = 'none';
            this.isCameraOn = true;
            this.elements.cameraText.textContent = '关闭摄像头';
            this.elements.cameraIcon.textContent = '📷';
            this.startFrameCapture();
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
        this.elements.video.classList.remove('active');
        this.elements.video.srcObject = null;
        this.elements.placeholder.style.display = 'flex';
        this.isCameraOn = false;
        this.elements.cameraText.textContent = '开启摄像头';
        this.stopFrameCapture();
    }

    startFrameCapture() {
        const FPS = 1;
        this.frameInterval = setInterval(() => this.captureFrame(), 1000 / FPS);
        this.frameCount = 0;
    }

    stopFrameCapture() {
        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }
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
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        this.frameCount++;
        this.setDebug('fps', `${this.frameCount}fps`);
        this.lastFrameTime = Date.now();
    }

    getFrameBase64() {
        const canvas = this.elements.canvas;
        if (!canvas.width) return null;
        return canvas.toDataURL('image/jpeg', 0.6);
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

    startListening() {
        if (this.isListening || this.isProcessing || !this.isCameraOn) return;
        this.isListening = true;
        this.elements.btnPtt.classList.add('listening');
        this.elements.pttText.textContent = '松开结束';
        this.elements.pttIcon.textContent = '🔴';
        this.setDebug('stt', '录音中...');
    }

    stopListening() {
        if (!this.isListening) return;
        this.isListening = false;
        this.elements.btnPtt.classList.remove('listening');
        this.elements.pttText.textContent = '按住说话';
        this.elements.pttIcon.textContent = '🎤';
        this.setDebug('stt', '空闲');
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
        this.addThinkingMessage();

        try {
            const resp = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, image }),
            });

            if (!resp.ok) {
                const errData = await resp.json().catch(() => ({}));
                throw new Error(errData.detail || `HTTP ${resp.status}`);
            }

            const data = await resp.json();
            this.removeThinkingMessage();
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

    speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const voices = speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.startsWith('zh'));
        if (zhVoice) utterance.voice = zhVoice;

        speechSynthesis.speak(utterance);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VisualAssistant();
});
