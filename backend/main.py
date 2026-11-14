"""
Entrypoint alias for Vercel and serverless deployment.
Exposes the FastAPI application instance from app.main.
"""

from app.main import app

__all__ = ["app"]
