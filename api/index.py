"""Vercel serverless entry point for the CollegeAI FastAPI app."""
from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="off")
