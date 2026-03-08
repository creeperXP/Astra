import os
from pydantic_settings import BaseSettings

# Absolute path to backend/.env so it's found regardless of working directory
_ENV_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")

# LOCKED: Embedding dimension 1024. NV-Embed-v2 4096 -> PCA to 1024 before any storage.
EMBED_DIM = 1024
NV_EMBED_RAW_DIM = 4096


class Settings(BaseSettings):
    nebula_api_key: str = ""
    gemini_api_key: str = ""
    nemotron_api_key: str = ""         # NVIDIA Build API key (nvapi-...)
    nvidia_nim_base_url: str = ""      # NV-Embed endpoint base
    mongodb_uri: str = ""              # matches MONGODB_URI in .env
    nv_ingest_url: str = ""            # optional: http://localhost:8000 if server is running
    embed_dim: int = EMBED_DIM

    class Config:
        env_file = _ENV_FILE
        extra = "ignore"


settings = Settings()
