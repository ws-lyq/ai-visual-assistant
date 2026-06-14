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
        this.silenceTimeout = 800;

        this.audioContext = null;
        this.analyserNode = null;
        this.vadDataArray = null;
        this.vadFrameId = null;
        this.vadInterruptStart = 0;
        this.vadMicStream = null;
        this.vadEnergy = 0;

        this.timerInterval = null;
        this.timerSeconds = 0;

        this.elements = {
            lobby: document.getElementById('lobby-view'),
            call: document.getElementById('call-view'),
            btnCall: document.getElementById('btn-call'),
            video: document.getElementById('camera-preview'),
            canvas: document.getElementById('frame-canvas'),
            pipStatus: document.getElementById('pip-status'),
            pipWave: document.getElementById('pip-wave'),
            audioLevel: document.getElementById('audio-level'),
            audioBar: document.getElementById('audio-bar'),
            btnMic: document.getElementById('btn-toggle-mic'),
            btnCam: document.getElementById('btn-toggle-camera'),
            btnHangup: document.getElementById('btn-hangup'),
            timer: document.getElementById('call-timer'),
        };

        this.initTTS();
        this.initSpeechRecognition();
        this.setupEventListeners();
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

        this.recognition.onresult = (event) => {
            let final = '';
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const r = event.results[i];
                const text = r[0].transcript.trim();
                if (r.isFinal) {
                    if (text.length >= 2) final += text;
                } else {
                    if (text.length >= 2) interim += text;
                }
            }
            if (final) {
                this.accumulatedText += (this.accumulatedText ? ' ' : '') + final;
                if (this.isSpeaking) {
                    window.speechSynthesis.cancel();
                    this.isSpeaking = false;
                    this.setPipStatus('聆听中...');
                    this.elements.pipWave.className = '';
                }
                this.resetSilenceTimer();
            } else if (interim && !this.isSpeaking) {
                this.lastInterim = interim;
                this.resetSilenceTimer();
            }
        };

        this.recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
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
            if (this.isVoiceActive && this.inCall) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // ignore
                }
            }
        };
    }

    setupEventListeners() {
        this.elements.btnCall.addEventListener('click', () => this.startCall());
        this.elements.btnMic.addEventListener('click', () => this.toggleMic());
        this.elements.btnCam.addEventListener('click', () => this.toggleCamera());
        this.elements.btnHangup.addEventListener('click', () => this.hangup());
    }

    // ─── Call Lifecycle ───

    async startCall() {
        await this.startCamera();
        if (!this.isCameraOn) return;

        this.inCall = true;
        this.elements.lobby.style.display = 'none';
        this.elements.call.style.display = 'block';

        this.startVoice();
        this.startTimer();
    }

    hangup() {
        window.speechSynthesis.cancel();
        this.isSpeaking = false;
        this.stopVoice();
        this.stopVAD();
        this.stopCamera();
        this.stopTimer();

        this.inCall = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.conversationHistory = [];

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
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.video.srcObject = this.stream;
            await this.elements.video.play();
            this.isCameraOn = true;
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                this.setPipStatus('请允许摄像头权限');
            } else if (err.name === 'NotFoundError') {
                this.setPipStatus('未检测到摄像头');
            } else {
                this.setPipStatus('摄像头启动失败');
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
            // ignore
        }
        if (!this.audioContext) this.startVAD();
    }

    stopVoice() {
        this.isVoiceActive = false;
        this.clearSilenceTimer();
        this.accumulatedText = '';
        this.lastInterim = '';
        this.vadInterruptStart = 0;
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

        if (this.isSpeaking && this.vadEnergy > 0.12) {
            if (!this.vadInterruptStart) this.vadInterruptStart = Date.now();
            if (Date.now() - this.vadInterruptStart > 500) {
                window.speechSynthesis.cancel();
                this.isSpeaking = false;
                this.vadInterruptStart = 0;
                this.clearSilenceTimer();
                this.setPipStatus('聆听中...');
                this.elements.pipWave.className = '';
                this.elements.audioLevel.style.display = 'block';
                this.startVoice();
            }
        } else {
            this.vadInterruptStart = 0;
        }

        this.vadFrameId = requestAnimationFrame(() => this.vadLoop());
    }

    submitVoiceText() {
        let text = this.accumulatedText.trim() || this.lastInterim.trim();
        this.accumulatedText = '';
        this.lastInterim = '';
        if (!text || text.length < 2 || !this.isVoiceActive || !this.inCall || this.isProcessing) return;
        text = text.replace(/(.)\1{4,}/g, '$1$1$1');
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

            this.conversationHistory.push({ role: 'user', text });
            this.conversationHistory.push({ role: 'assistant', text: data.reply });

            this.speakText(data.reply);
        } catch (err) {
            this.setPipStatus('请求失败，请重试');
            this.elements.pipWave.className = '';
        } finally {
            this.isProcessing = false;
        }
    }

    speakText(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 1.3;
        utterance.volume = 1.0;
        if (this.ttsVoice) utterance.voice = this.ttsVoice;

        this.isSpeaking = true;
        this.clearSilenceTimer();
        this.accumulatedText = '';
        this.lastInterim = '';
        try { this.recognition.stop(); } catch (e) { /**/ }
        this.setPipStatus('正在说话...');
        this.elements.pipWave.className = 'speaking';
        this.elements.audioLevel.style.display = 'none';

        const onDone = () => {
            this.isSpeaking = false;
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
