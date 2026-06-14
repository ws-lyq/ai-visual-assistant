class VisualAssistant {
    constructor() {
        this.inCall = false;
        this.stream = null;
        this.isCameraOn = false;
        this.isProcessing = false;
        this.recognition = null;
        this.isSpeaking = false;
        this.isVoiceActive = false;
        this.conversationHistory = [];
        this.facingMode = 'user';

        this.accumulatedText = '';
        this.lastInterim = '';
        this.silenceTimer = null;
        this.silenceTimeout = 1200;

        this.audioContext = null;
        this.analyserNode = null;
        this.vadDataArray = null;
        this.vadFrameId = null;
        this.vadInterruptStart = 0;
        this.vadMicStream = null;
        this.vadEnergy = 0;
        this._lastSubmit = 0;
        this._lastSubmittedText = '';
        this._ttsEndTime = 0;

        this.timerInterval = null;
        this.timerSeconds = 0;

        this.chatMsgCount = 0;
        this.chatAIEl = null;

        this.elements = {
            lobby: document.getElementById('lobby-view'),
            call: document.getElementById('call-view'),
            btnCall: document.getElementById('btn-call'),
            lobbyError: document.getElementById('lobby-error'),
            video: document.getElementById('camera-preview'),
            canvas: document.getElementById('frame-canvas'),
            pipStatus: document.getElementById('pip-status'),
            pipWave: document.getElementById('pip-wave'),
            audioLevel: document.getElementById('audio-level'),
            audioBar: document.getElementById('audio-bar'),
            chatOverlay: document.getElementById('chat-overlay'),
            chatMessages: document.getElementById('chat-messages'),
            textInput: document.getElementById('text-input'),
            btnSendText: document.getElementById('btn-send-text'),
            btnMic: document.getElementById('btn-toggle-mic'),
            btnCam: document.getElementById('btn-toggle-camera'),
            btnHangup: document.getElementById('btn-hangup'),
            timer: document.getElementById('call-timer'),
        };

        this.initTTS();
        this.initSpeechRecognition();
        this.setupEventListeners();
        console.log('[系统] VisualAssistant 初始化完成');
    }

    initTTS() {
        if (!window.speechSynthesis) return;
        this.ttsVoice = null;
        const pickVoice = () => {
            const all = speechSynthesis.getVoices();
            const zh = all.filter(v => v.lang.startsWith('zh'));
            const preferred = zh.find(v => /Microsoft\s+(Yaoyao|Huihui|Xiaoxiao|Xiaoyi|Yunxi|Yunyang|Hanhan)/i.test(v.name));
            if (preferred) { this.ttsVoice = preferred; return; }
            const google = zh.find(v => v.name.includes('Google'));
            if (google) { this.ttsVoice = google; return; }
            if (zh.length) { this.ttsVoice = zh[0]; }
        };
        const voices = speechSynthesis.getVoices();
        if (voices.length) { pickVoice(); } else {
            speechSynthesis.addEventListener('voiceschanged', pickVoice, { once: true });
        }
        speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.setPipStatus('浏览器不支持语音识别');
            this.elements.btnMic.style.display = 'none';
            return;
        }
        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'zh-CN';
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;

        this.recognition.onstart = () => {
            console.log('[语音] 识别已启动');
        };

        this.recognition.onresult = (event) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                const text = r[0].transcript.trim();
                const confidence = r[0].confidence ?? 1;
                console.log('[语音] raw:', JSON.stringify(text), 'confidence:', confidence, 'isFinal:', r.isFinal);

                const cleaned = text.replace(/[，。！？、；：,.!?;:\s]+/g, '');
                if (cleaned.length < 1) continue;
                if (/^[嗯啊哦呃唉噢吖哈嘿嘻]+$/.test(cleaned) && cleaned.length <= 2) continue;

                if (r.isFinal) {
                    final += text;
                } else {
                    interim += text;
                }
            }

            // Show listening text in chat overlay
            const display = this.accumulatedText + (this.accumulatedText && interim ? ' ' : '') + interim;
            if (this.isVoiceActive && !this.isSpeaking) {
                this.setListeningText(display || '\u200b');
            }

            if (this.isSpeaking) return;
            if (Date.now() - this._ttsEndTime < 1500) return;

            if (final) {
                this.accumulatedText += (this.accumulatedText ? ' ' : '') + final;
                if (this.isSpeaking) {
                    window.speechSynthesis.cancel();
                    this.isSpeaking = false;
                    this.setPipStatus('聆听中...');
                    this.elements.pipWave.className = '';
                }
                this.resetSilenceTimer();
            } else if (interim) {
                this.lastInterim = interim;
                this.resetSilenceTimer();
            }
        };

        this.recognition.onerror = (event) => {
            console.log('[语音] 错误:', event.error, '| message:', event.message);
            if (event.error === 'no-speech' || event.error === 'aborted') {
                return;
            }
            if (event.error === 'not-allowed') {
                this.setPipStatus('麦克风权限被拒绝');
                this.isVoiceActive = false;
                this.elements.btnMic.classList.add('muted');
                return;
            }
            this.setPipStatus('语音识别错误');
            if (this.isVoiceActive) {
                this.isVoiceActive = false;
                this.elements.btnMic.classList.add('muted');
            }
        };

        this.recognition.onend = () => {
            console.log('[语音] 识别结束, isVoiceActive:', this.isVoiceActive, 'inCall:', this.inCall);
            if (this.isVoiceActive && this.inCall) {
                setTimeout(() => {
                    if (!this.isVoiceActive || !this.inCall) return;
                    try {
                        this.recognition.start();
                        console.log('[语音] 已重启');
                    } catch (e) {
                        console.error('[语音] 重启失败:', e.message);
                    }
                }, 200);
            }
        };
    }

    setupEventListeners() {
        this.elements.btnCall.addEventListener('click', () => this.startCall());
        this.elements.btnMic.addEventListener('click', () => this.toggleMic());
        this.elements.btnCam.addEventListener('click', () => this.toggleCamera());
        this.elements.btnHangup.addEventListener('click', () => this.hangup());
        this.elements.btnSendText.addEventListener('click', () => this.sendTextInput());
        this.elements.textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.sendTextInput();
        });
    }

    sendTextInput() {
        const text = this.elements.textInput.value.trim();
        if (!text || !this.inCall || this.isProcessing) return;
        this.elements.textInput.value = '';
        this.removeListeningText();
        this.addChatMessage('user', text);
        this.sendToAI(text);
    }

    // ─── Call Lifecycle ───

    async startCall() {
        try {
            console.log('[系统] 开始视频通话...');
            await this.startCamera();
            console.log('[系统] 摄像头状态:', this.isCameraOn);
        } catch (e) {
            console.error('[系统] startCamera 异常:', e);
        }
        if (!this.isCameraOn) {
            if (this.elements.lobbyError) this.elements.lobbyError.style.display = 'block';
            return;
        }

        this.inCall = true;
        this.elements.lobby.style.display = 'none';
        this.elements.call.style.display = 'block';

        this.startVoice();
        this.startTimer();
    }

    hangup() {
        this.inCall = false;
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
        this.stopVoice();
        this.stopVAD();
        this.stopCamera();
        this.stopTimer();

        this.isProcessing = false;
        this.isSpeaking = false;
        this.conversationHistory = [];
        this.chatMsgCount = 0;
        this.chatAIEl = null;

        if (this.elements.chatMessages) this.elements.chatMessages.innerHTML = '';
        if (this.elements.textInput) this.elements.textInput.value = '';

        this.elements.call.style.display = 'none';
        this.elements.lobby.style.display = 'flex';
        this.elements.pipWave.className = '';
        this.setPipStatus('准备中');
        this.elements.btnMic.classList.remove('muted');
        this.elements.btnCam.classList.remove('muted');
    }

    // ─── Camera ───

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
            console.log('[摄像头] 请求权限...');
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('[摄像头] 获取流成功');
            this.elements.video.srcObject = this.stream;
            await this.elements.video.play();
            this.isCameraOn = true;
            console.log('[摄像头] 播放成功');
        } catch (err) {
            console.error('[摄像头] 错误:', err.name, err.message);
            if (err.name === 'NotAllowedError') {
                this.setPipStatus('请允许摄像头权限');
                if (this.elements.lobbyError) { this.elements.lobbyError.textContent = '请允许浏览器访问摄像头（点击地址栏左侧的锁图标）'; this.elements.lobbyError.style.display = 'block'; }
            } else if (err.name === 'NotFoundError') {
                this.setPipStatus('未检测到摄像头');
                if (this.elements.lobbyError) { this.elements.lobbyError.textContent = '未检测到摄像头设备'; this.elements.lobbyError.style.display = 'block'; }
            } else {
                this.setPipStatus('摄像头启动失败');
                if (this.elements.lobbyError) { this.elements.lobbyError.textContent = '摄像头启动失败: ' + err.message; this.elements.lobbyError.style.display = 'block'; }
            }
        }
    }

    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        this.elements.video.srcObject = null;
        this.isCameraOn = false;
    }

    toggleCamera() {
        if (this.isCameraOn) {
            this.stopCamera();
            this.elements.btnCam.classList.add('muted');
        } else {
            this.startCamera();
            this.elements.btnCam.classList.remove('muted');
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
        if (this.facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    getFrameBase64() {
        this.captureFrame();
        const canvas = this.elements.canvas;
        if (!canvas.width) return null;
        return canvas.toDataURL('image/jpeg', 0.6);
    }

    // ─── Microphone / Voice ───

    toggleMic() {
        if (this.isVoiceActive) {
            this.stopVoice();
            this.elements.btnMic.classList.add('muted');
        } else {
            this.startVoice();
            this.elements.btnMic.classList.remove('muted');
        }
    }

    startVoice() {
        if (!this.recognition) return;
        this.isVoiceActive = true;
        this.accumulatedText = '';
        this.lastInterim = '';
        this.setPipStatus('聆听中...');
        this.elements.pipWave.className = '';
        this.elements.audioLevel.style.display = 'block';
        try {
            this.recognition.start();
        } catch (e) {
            console.error('[语音] 启动失败:', e.message);
        }
        if (!this.audioContext) this.startVAD();
    }

    stopVoice() {
        this.isVoiceActive = false;
        this.clearSilenceTimer();
        this.accumulatedText = '';
        this.lastInterim = '';
        this.vadInterruptStart = 0;
        this.removeListeningText();
        this.setPipStatus('麦克风已关闭');
        this.elements.pipWave.className = '';
        this.elements.audioLevel.style.display = 'none';
        this.stopVAD();
        try {
            this.recognition.stop();
        } catch (e) {
            // ignore
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

    // ─── Voice Activity Detection (VAD) ───

    async startVAD() {
        try {
            this.vadMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') await ctx.resume();
            this.audioContext = ctx;
            const source = ctx.createMediaStreamSource(this.vadMicStream);
            this.analyserNode = ctx.createAnalyser();
            this.analyserNode.fftSize = 256;
            source.connect(this.analyserNode);
            this.vadDataArray = new Uint8Array(this.analyserNode.fftSize);
            this.vadLoop();
        } catch (e) {
            // VAD unavailable, proceed without visual bar
        }
    }

    stopVAD() {
        if (this.vadFrameId) {
            cancelAnimationFrame(this.vadFrameId);
            this.vadFrameId = null;
        }
        if (this.audioContext) {
            this.audioContext.close().catch(() => {});
            this.audioContext = null;
        }
        if (this.vadMicStream) {
            this.vadMicStream.getTracks().forEach(t => t.stop());
            this.vadMicStream = null;
        }
        this.analyserNode = null;
        this.vadDataArray = null;
        this.vadEnergy = 0;
    }

    vadLoop() {
        if (!this.isVoiceActive || !this.analyserNode || !this.vadDataArray) return;
        this.analyserNode.getByteTimeDomainData(this.vadDataArray);
        let sum = 0;
        for (let i = 0; i < this.vadDataArray.length; i++) {
            const v = (this.vadDataArray[i] - 128) / 128;
            sum += v * v;
        }
        this.vadEnergy = Math.sqrt(sum / this.vadDataArray.length);

        const pct = Math.min(100, this.vadEnergy * 180);
        this.elements.audioBar.style.width = pct + '%';

        if (this.isSpeaking && this.vadEnergy > 0.30) {
            if (!this.vadInterruptStart) this.vadInterruptStart = Date.now();
            if (Date.now() - this.vadInterruptStart > 800) {
                window.speechSynthesis.cancel();
                this.isSpeaking = false;
                this.vadInterruptStart = 0;
                this.clearSilenceTimer();
                this.setPipStatus('聆听中...');
                this.elements.pipWave.className = '';
                this.elements.audioLevel.style.display = 'block';
                this.startVoice();
            }
        } else if (this.vadEnergy < 0.05) {
            this.vadInterruptStart = 0;
        }

        this.vadFrameId = requestAnimationFrame(() => this.vadLoop());
    }

    submitVoiceText() {
        let text = this.accumulatedText.trim() || this.lastInterim.trim();
        this.accumulatedText = '';
        this.lastInterim = '';
        if (!text || !this.isVoiceActive || !this.inCall || this.isProcessing) return;

        const cleaned = text.replace(/[，。！？、；：,.!?;:\s]+/g, '');
        if (cleaned.length < 1) return;
        if (/^[嗯啊哦呃唉噢吖哈嘿嘻]+$/.test(cleaned) && cleaned.length <= 2) return;

        const now = Date.now();
        if (now - this._lastSubmit < 1500) return;

        if (text === this._lastSubmittedText) {
            this._lastSubmittedText = text;
            this._lastSubmit = now;
            return;
        }

        text = text.replace(/(.)\1{4,}/g, '$1$1$1');
        this._lastSubmittedText = text;
        this._lastSubmit = now;
        console.log('[语音] 提交:', text);
        this.removeListeningText();
        this.addChatMessage('user', text);
        this.sendToAI(text);
    }

    // ─── AI Chat ───

    async sendToAI(text) {
        this.isProcessing = true;
        this.setPipStatus('思考中...');
        this.elements.pipWave.className = 'thinking';

        const history = this.conversationHistory.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.role === 'user'
                ? [{ type: 'text', text: msg.text }]
                : msg.text,
        }));

        const image = this.getFrameBase64();

        // Create AI message placeholder
        this.chatAIEl = this.addChatMessage('ai', '');

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

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullReply = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6);
                    if (dataStr === '[DONE]') break;

                    try {
                        const data = JSON.parse(dataStr);
                        if (data.error) {
                            throw new Error(data.error);
                        }
                        if (data.content) {
                            fullReply += data.content;
                            if (this.chatAIEl) {
                                this.chatAIEl.textContent = fullReply;
                                this.scrollChatToBottom();
                            }
                        }
                    } catch (e) {
                        if (!(e instanceof SyntaxError)) throw e;
                    }
                }
            }

            console.log('[AI] 回复:', fullReply);
            this.conversationHistory.push({ role: 'user', text });
            this.conversationHistory.push({ role: 'assistant', text: fullReply });

            this.trimChatMessages();
            this.speakText(fullReply);
        } catch (err) {
            console.error('[AI] 请求失败:', err.message);
            // Remove failed message element
            if (this.chatAIEl) {
                this.chatAIEl.remove();
                this.chatAIEl = null;
            }
            this.setPipStatus('请求失败，请重试');
            this.elements.pipWave.className = '';
        } finally {
            this.chatAIEl = null;
            this.isProcessing = false;
        }
    }

    speakText(text) {
        if (!this.inCall || !window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        this.isSpeaking = true;
        this.clearSilenceTimer();
        this.accumulatedText = '';
        this.lastInterim = '';
        this.removeListeningText();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.3;
        utterance.volume = 1.0;
        if (this.ttsVoice) utterance.voice = this.ttsVoice;

        try { this.recognition.stop(); } catch (e) { /**/ }
        this.setPipStatus('正在说话...');
        this.elements.pipWave.className = 'speaking';
        this.elements.audioLevel.style.display = 'none';

        const onDone = () => {
            this.isSpeaking = false;
            this._ttsEndTime = Date.now();
            this.elements.pipWave.className = '';
            if (this.isVoiceActive) {
                this.setPipStatus('聆听中...');
                this.elements.audioLevel.style.display = 'block';
                try { this.recognition.start(); } catch (e) { /**/ }
            } else {
                this.setPipStatus('麦克风已关闭');
            }
        };
        utterance.onend = onDone;
        utterance.onerror = onDone;

        speechSynthesis.speak(utterance);
    }

    // ─── Chat Helpers ───

    addChatMessage(type, text) {
        const el = document.createElement('div');
        el.className = 'chat-msg chat-msg-' + type;
        el.textContent = text;
        this.elements.chatMessages.appendChild(el);
        this.scrollChatToBottom();
        if (type !== 'listening') {
            this.chatMsgCount++;
        }
        return el;
    }

    setListeningText(text) {
        let el = this.elements.chatMessages.querySelector('.chat-msg-listening');
        if (!el) {
            el = document.createElement('div');
            el.className = 'chat-msg chat-msg-listening';
            this.elements.chatMessages.appendChild(el);
        }
        el.textContent = text;
        this.scrollChatToBottom();
    }

    removeListeningText() {
        const el = this.elements.chatMessages.querySelector('.chat-msg-listening');
        if (el) el.remove();
    }

    trimChatMessages() {
        const children = this.elements.chatMessages.children;
        while (this.chatMsgCount > 3 && children.length > 0) {
            for (let i = 0; i < children.length; i++) {
                if (!children[i].classList.contains('chat-msg-listening')) {
                    children[i].remove();
                    this.chatMsgCount--;
                    break;
                }
            }
        }
    }

    scrollChatToBottom() {
        this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }

    // ─── Timer ───

    startTimer() {
        this.timerSeconds = 0;
        this.elements.timer.style.display = 'block';
        this.updateTimerDisplay();
        this.timerInterval = setInterval(() => {
            this.timerSeconds++;
            this.updateTimerDisplay();
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.elements.timer.style.display = 'none';
    }

    updateTimerDisplay() {
        const m = String(Math.floor(this.timerSeconds / 60)).padStart(2, '0');
        const s = String(this.timerSeconds % 60).padStart(2, '0');
        this.elements.timer.textContent = `${m}:${s}`;
    }

    // ─── UI Helpers ───

    setPipStatus(text) {
        if (this.elements.pipStatus) {
            this.elements.pipStatus.textContent = text;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new VisualAssistant();
});
