import logging
import sys
import tempfile
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.config.settings import settings


def _writable_dir(preferred: str | Path) -> Path:
    """Return a writable directory, falling back to the OS temp dir (serverless-safe)."""
    candidates = [Path(preferred), Path(tempfile.gettempdir()) / "collegeai_logs"]
    for candidate in candidates:
        try:
            candidate.mkdir(parents=True, exist_ok=True)
            test_file = candidate / ".write_test"
            test_file.touch()
            test_file.unlink()
            return candidate
        except OSError:
            continue
    return candidates[-1]


def _log_file(name: str) -> Path:
    return _writable_dir(settings.LOG_DIR) / f"{name}.log"


def setup_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(level)
    logger.propagate = False

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)

    try:
        file_handler = RotatingFileHandler(
            _log_file(name), maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except OSError:
        # Read-only filesystem (e.g. serverless) — console logging only.
        pass

    return logger


app_logger = setup_logger("app")
ai_logger = setup_logger("ai")
auth_logger = setup_logger("auth")
error_logger = setup_logger("errors")
mongo_logger = setup_logger("mongo")
upload_logger = setup_logger("uploads")


def log_with_time(logger: logging.Logger, level: str, message: str) -> None:
    entry = {"ts": datetime.utcnow().isoformat() + "Z", "message": message}
    getattr(logger, level, logger.info)(entry)
