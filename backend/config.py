import os
from dotenv import load_dotenv

load_dotenv()

AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
AI_MODEL = os.getenv("AI_MODEL", "qwen-vl-plus")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

MAX_IMAGE_WIDTH = int(os.getenv("MAX_IMAGE_WIDTH", "640"))
MAX_IMAGE_HEIGHT = int(os.getenv("MAX_IMAGE_HEIGHT", "480"))
JPEG_QUALITY = int(os.getenv("JPEG_QUALITY", "60"))
