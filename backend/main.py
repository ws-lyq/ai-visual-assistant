import base64
import io
import json
import logging
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

from config import (
    AI_API_KEY,
    AI_BASE_URL,
    AI_MODEL,
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


class ChatRequest(BaseModel):
    text: str
    image: str | None = None
    conversation_history: list[dict] | None = None


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


def normalize_history(msg: dict) -> dict:
    role = msg.get("role", "user")
    content = msg.get("content", "")
    if role == "user" and isinstance(content, str):
        return {"role": role, "content": [{"type": "text", "text": content}]}
    return msg


def build_messages(req: ChatRequest) -> list[dict]:
    system_prompt = {
        "role": "system",
        "content": (
            "你是AI视觉助手，通过摄像头实时观察用户周围的环境。\n"
            "核心原则：\n"
            "1. 用户不问画面，就绝对不提画面。用户打招呼你就正常打招呼，不要描述看到了什么。\n"
            "2. 只有用户明确问「我在哪」「这是什么」「我旁边有什么」等涉及画面内容的问题时，才根据摄像头画面回答。\n"
            "3. 回答要自然口语化，像朋友聊天一样简短。不要主动提及用户的穿着、姿势、表情、背景。\n"
            "4. 用户说「嗯」「哦」「好的」等简短回应时，简短确认即可，不要展开描述。\n"
            "5. 必须结合对话历史的所有上下文来回答。如果用户之前提到过某件事，之后再次提起时要记得并关联起来。不要重复之前说过的内容，让对话有连贯性。"
        ),
    }

    history = [normalize_history(m) for m in (req.conversation_history or [])][-10:]

    user_content: list[dict] = [{"type": "text", "text": req.text}]
    if req.image:
        compressed = compress_image(req.image)
        user_content.append({"type": "image_url", "image_url": {"url": compressed}})

    current = {"role": "user", "content": user_content}
    return [system_prompt] + history + [current]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not AI_API_KEY:
        raise HTTPException(status_code=500, detail="AI_API_KEY not configured in .env")

    messages = build_messages(req)
    logger.info("User input (%d chars): %s", len(req.text), req.text[:200])
    payload = {
        "model": AI_MODEL,
        "messages": messages,
        "max_tokens": 600,
        "temperature": 0.7,
        "stream": True,
    }
    body = json.dumps(payload).encode("utf-8")

    async def generate():
        full_reply = ""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{AI_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {AI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    content=body,
                ) as resp:
                    if resp.status_code != 200:
                        resp_body = await resp.aread()
                        resp_text = resp_body.decode("utf-8", errors="replace")
                        logger.error("AI API error: %s %s", resp.status_code, resp_text[:500])
                        yield f"data: {json.dumps({'error': f'{resp.status_code}: {resp_text[:200]}'})}\n\n"
                        return

                    async for line in resp.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                full_reply += content
                                yield f"data: {json.dumps({'content': content})}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
        except httpx.RequestError as e:
            logger.error("Network error: %s", e)
            yield f"data: {json.dumps({'error': 'Network error'})}\n\n"
        except Exception as e:
            logger.error("Unexpected error: %s", e)
            yield f"data: {json.dumps({'error': 'Internal error'})}\n\n"
        finally:
            logger.info("AI reply (%d chars): %s", len(full_reply), full_reply[:100])
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "model": AI_MODEL,
        "api_configured": bool(AI_API_KEY),
    }


@app.get("/{full_path:path}", include_in_schema=False)
async def serve_frontend(full_path: str):
    static_dir = Path(__file__).resolve().parent.parent / "frontend"
    if full_path == "" or full_path == "/":
        full_path = "index.html"
    file_path = static_dir / full_path
    if file_path.exists() and file_path.is_file():
        content = file_path.read_bytes()
        media_type = {
            ".html": "text/html",
            ".css": "text/css",
            ".js": "application/javascript",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
            ".json": "application/json",
        }.get(file_path.suffix, "application/octet-stream")
        return HTMLResponse(content=content, media_type=media_type)
    index_path = static_dir / "index.html"
    if index_path.exists():
        return HTMLResponse(content=index_path.read_bytes(), media_type="text/html")
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
