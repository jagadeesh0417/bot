"""CollegeAI entry point.

Run:  uvicorn main:app --reload
"""
import uvicorn

from app.config.settings import settings

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
    )
