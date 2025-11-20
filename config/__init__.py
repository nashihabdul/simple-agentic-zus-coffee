from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
import os

load_dotenv(".env", override=True)

class AppConfig(BaseSettings):
    # LLM
    LLM_KEY: Optional[str]
    LLM_API: Optional[str]
    LLM_MODEL: str
    
    # SERPAPI
    SERP_API: Optional[str]
    
    # CHROMA
    COLLECTION_NAME: str
    PERSIST_DIR: str

    model_config = {
        "env_file": ".env",
    }
    
    @field_validator("LLM_API", "LLM_KEY", "SERP_API", mode="before")
    def none_if_none(cls, v):
        if v is None:
            return None
        if str(v).upper() == "NONE":
            return None
        return v

settings = AppConfig()