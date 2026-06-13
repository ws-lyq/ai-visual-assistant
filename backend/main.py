import base64
import io
import logging
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    HOST,
    JPEG_QUALITY,
    MAX_IMAGE_HEIGHT,
    MAX_IMAGE_WIDTH,
    PORT,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Visual Assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).resolve().parent.parent / "frontend"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="frontend")


class ChatRequest(BaseModel):
    text: str
    image: str | None = None
    conversation_history: list[dict] | None = None


class ChatResponse(BaseModel):
    reply: str


def compress_image(base64_str: str) -> str:
    try:
        header, data = base64_str.split(",", 1) if "," in base64_str else ("", base64_str)
        image_data = base64.b64decode(data)
        img = Image.open(io.BytesIO(image_data))

        if img.mode == "RGBA":
            img = img.convert("RGB")

        img.thumbnail((MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT), Image.LANCZOS)

        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        compressed = base64.b64encode(buffer.getvalue()).decode("utf-8")

        logger.info(
            "Image compressed: %dx%d -> %dx%d, %dKB -> %dKB",
            img.width, img.height,
            img.width, img.height,
            len(image_data) // 1024,
            len(compressed) // 1024,
        )
        return f"data:image/jpeg;base64,{compressed}"
    except Exception as e:
        logger.warning("Image compression failed: %s", e)
        return base64_str


def build_messages(req: ChatRequest) -> list[dict]:
    system_prompt = {
        "role": "system",
        "content": (
            "你是AI视觉助手，通过摄像头观察用户周围环境并回答问题。"
            "请基于用户问题和摄像头画面给出简洁准确的回答。"
            "回答控制在2句话以内，保持自然口语化的中文。"
            "如果画面中没有人或物体，如实告知即可。"
        ),
    }

    history = (req.conversation_history or [])[-10:]

    user_content: list[dict] = [{"type": "text", "text": req.text}]
    if req.image:
        compressed = compress_image(req.image)
        user_content.append({"type": "image_url", "image_url": {"url": compressed}})

    current = {"role": "user", "content": user_content}
    return [system_prompt] + history + [current]


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not configured")

    messages = build_messages(req)
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": messages,
        "max_tokens": 300,
        "temperature": 0.7,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{DEEPSEEK_BASE_URL}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            logger.info("AI reply (%d chars): %s", len(reply), reply[:100])
            return ChatResponse(reply=reply)
    except httpx.HTTPStatusError as e:
        logger.error("DeepSeek API error: %s %s", e.response.status_code, e.response.text)
        raise HTTPException(status_code=e.response.status_code, detail="AI service error")
    except httpx.RequestError as e:
        logger.error("Network error: %s", e)
        raise HTTPException(status_code=502, detail="AI service unavailable")
    except Exception as e:
        logger.error("Unexpected error: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "model": DEEPSEEK_MODEL,
        "api_configured": bool(DEEPSEEK_API_KEY),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
