"""
Surface 3D Structural Surface Inspection — FastAPI Backend Application.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes.inspections import router as inspections_router


app = FastAPI(
    title="Surface Stereo Reconstruction API",
    description="Photogrammetry stereo reconstruction backend for 3D structural surface inspection.",
    version="1.0.0",
)

# Configure CORS strictly for development frontend origins
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(inspections_router)


@app.get("/", tags=["health"])
async def root():
    return {
        "service": "Surface 3D Stereo Reconstruction API",
        "status": "online",
        "version": "1.0.0",
        "docs_url": "/docs",
    }


@app.get("/api/health", tags=["health"])
async def health_check():
    return {"status": "healthy"}
