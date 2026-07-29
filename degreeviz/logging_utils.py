"""Structured application logging helpers."""

import json
import logging as py_logging
import sys
import time
import uuid
from typing import Any, Dict, Optional

from flask import has_request_context, session


LOGGER_NAME = "degreeviz"


def configure_logging(app) -> None:
    """Configure JSON-ish application logs for Flask."""
    handler = py_logging.StreamHandler()
    handler.setFormatter(py_logging.Formatter("%(message)s"))

    logger = py_logging.getLogger(LOGGER_NAME)
    if not logger.handlers:
        logger.addHandler(handler)
    logger.setLevel(py_logging.INFO)
    app.logger.handlers = logger.handlers
    app.logger.setLevel(logger.level)


def _request_context(request=None) -> Dict[str, Any]:
    """Collect request/session fields that are useful in every log event."""
    if request is None or not has_request_context():
        return {}
    return {
        "request_id": session.get("request_id"),
        "user_id": session.get("user_id"),
        "schedule_id": session.get("schedule_id"),
        "ip": request.headers.get("X-Forwarded-For", request.remote_addr),
        "method": request.method,
        "path": request.path,
        "endpoint": request.endpoint,
    }


def ensure_request_id() -> str:
    """Return a stable per-session request correlation id."""
    if "request_id" not in session:
        session["request_id"] = str(uuid.uuid4())
    return session["request_id"]


def log_event(
    request,
    action: str,
    *,
    status: str = "success",
    details: Optional[Dict[str, Any]] = None,
    error: Optional[BaseException] = None,
    duration_ms: Optional[float] = None,
) -> None:
    """Write one structured event for a user/server action."""
    event = {
        "event": action,
        "status": status,
        "timestamp": time.time(),
        **_request_context(request),
    }
    if details:
        event["details"] = details
    if duration_ms is not None:
        event["duration_ms"] = round(duration_ms, 2)
    if error is not None:
        event["error"] = {
            "type": type(error).__name__,
            "message": str(error),
        }

    logger = py_logging.getLogger(LOGGER_NAME)
    log_line = json.dumps(event, default=str, sort_keys=True)
    if error is not None or status == "error":
        if error is not None and sys.exc_info()[0] is not None:
            logger.exception(log_line)
        else:
            logger.error(log_line)
    else:
        logger.info(log_line)


def log_entry(request, action):
    """Backward-compatible wrapper for older call sites."""
    log_event(request, action)
