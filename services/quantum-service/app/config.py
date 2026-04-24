"""Application configuration via environment variables (pydantic-settings)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Quantum-service runtime configuration.

    All values are read from environment variables (case-insensitive).
    Defaults are suitable for local development.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "dev"
    port: int = 8000
    host: str = "0.0.0.0"
    qkd_kms_url: str = "http://qkd-kms:8001"
    log_level: str = "info"

    # QRNG defaults
    qrng_default_bits: int = 256
    qrng_max_bits: int = 4096

    # BB84 defaults
    bb84_default_key_length: int = 64
    bb84_qber_threshold: float = 0.11

    # VQC model path
    vqc_model_path: str = "app/models/vqc.pkl"


settings = Settings()
