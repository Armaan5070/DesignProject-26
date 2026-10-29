"""
FastAPI Application for 3D Point Cloud to 3D Mesh Reconstruction
Provides REST endpoints for upload, reconstruction, sample loading, and mesh export.
"""
import shutil
import sys
from pathlib import Path
from uuid import uuid4
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.config import (
    UPLOAD_DIR,
    OUTPUT_DIR,
    SAMPLES_DIR,
    FRONTEND_DIR,
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_SIZE_BYTES,
    UPLOAD_CHUNK_SIZE_BYTES,
    MAX_DISPLAY_POINTS,
    MAX_DISPLAY_TRIANGLES,
    DEFAULT_OCTREE_DEPTH,
    DEFAULT_DENSITY_TRIM_PERCENT,
    DEFAULT_KNN_NORMALS,
    DEFAULT_SCALE,
    DEFAULT_LINEAR_FIT
)
from backend.geometry.io_ply import inspect_point_cloud, create_display_point_cloud
from backend.geometry.poisson import run_poisson_reconstruction, HAS_OPEN3D
from backend.samples.generate_samples import generate_all_samples

app = FastAPI(
    title="3D Point Cloud to Mesh Reconstruction API",
    description="Backend API for Poisson Surface Reconstruction of PLY point clouds.",
    version="1.0.0"
)

# Enable CORS for local development flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure sample files exist on startup
generate_all_samples()

# Static Files Mounting
if FRONTEND_DIR.exists():
    css_dir = FRONTEND_DIR / "css"
    js_dir = FRONTEND_DIR / "js"
    if css_dir.exists():
        app.mount("/css", StaticFiles(directory=str(css_dir)), name="css")
    if js_dir.exists():
        app.mount("/js", StaticFiles(directory=str(js_dir)), name="js")


# Request Models
class ReconstructRequest(BaseModel):
    file_id: str
    depth: int = Field(default=DEFAULT_OCTREE_DEPTH, ge=6, le=11)
    density_trim: float = Field(default=DEFAULT_DENSITY_TRIM_PERCENT, ge=0.0, le=25.0)
    k_neighbors: int = Field(default=DEFAULT_KNN_NORMALS, ge=10, le=80)
    scale: float = Field(default=DEFAULT_SCALE, ge=1.0, le=1.5)
    linear_fit: bool = Field(default=DEFAULT_LINEAR_FIT)


@app.get("/")
async def serve_index():
    """Serves the main application user interface."""
    index_file = FRONTEND_DIR / "index.html"
    if not index_file.exists():
        return JSONResponse({"status": "error", "message": "Frontend index.html not found"}, status_code=404)
    return FileResponse(str(index_file))


@app.get("/api/health")
async def health_check():
    """Health check endpoint providing engine status."""
    return {
        "status": "healthy",
        "open3d_available": HAS_OPEN3D,
        "python_version": sys.version,
        "ready": True
    }


@app.post("/api/upload")
async def upload_point_cloud(file: UploadFile = File(...)):
    """
    Accepts and validates an uploaded PLY point cloud file.
    Extracts point coordinates, bounding box, color, and normal attributes.
    """
    filename = file.filename or "pointcloud.ply"
    suffix = Path(filename).suffix.lower()

    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{suffix}'. Only PLY (.ply) point clouds are supported."
        )

    file_id = f"pc_{uuid4().hex[:12]}"
    saved_path = UPLOAD_DIR / f"{file_id}.ply"

    # Save uploaded bytes with streaming chunk buffer (up to 1GB)
    try:
        size = 0
        with open(saved_path, "wb") as buffer:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE_BYTES):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE_BYTES:
                    buffer.close()
                    saved_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=400,
                        detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_SIZE_BYTES // (1024*1024*1024)} GB."
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        saved_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Inspect and validate point cloud
    metadata = inspect_point_cloud(saved_path)
    if not metadata.get("is_valid", False):
        saved_path.unlink(missing_ok=True)
        error_msg = metadata.get("error", "The uploaded file is not a valid 3D point cloud.")
        raise HTTPException(status_code=400, detail=error_msg)

    # For massive point clouds (e.g. 1GB files with 10M-30M points),
    # generate a WebGL-safe display point cloud for Viewer A so the browser doesn't crash,
    # while preserving the 100% full-precision point cloud for Poisson reconstruction on backend.
    was_downsampled = False
    display_points = metadata["num_points"]
    if metadata["num_points"] > MAX_DISPLAY_POINTS:
        display_path = UPLOAD_DIR / f"{file_id}_display.ply"
        was_downsampled, display_points = create_display_point_cloud(
            saved_path, display_path, max_points=MAX_DISPLAY_POINTS
        )

    return {
        "success": True,
        "file_id": file_id,
        "filename": filename,
        "file_size_bytes": size,
        "num_points": metadata["num_points"],
        "display_points": display_points,
        "is_display_optimized": was_downsampled,
        "has_colors": metadata["has_colors"],
        "has_normals": metadata["has_normals"],
        "bounds": metadata["bounds"],
        "pointcloud_url": f"/api/pointcloud/{file_id}?display=true" if was_downsampled else f"/api/pointcloud/{file_id}"
    }


@app.get("/api/pointcloud/{file_id}")
async def get_point_cloud(file_id: str, display: bool = Query(False)):
    """Streams the point cloud PLY file for 3D rendering in Viewer A."""
    if display:
        display_file = UPLOAD_DIR / f"{file_id}_display.ply"
        if display_file.exists():
            return FileResponse(
                str(display_file),
                media_type="application/octet-stream",
                filename=f"{file_id}_display.ply"
            )

    file_path = UPLOAD_DIR / f"{file_id}.ply"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Point cloud file not found.")

    return FileResponse(
        str(file_path),
        media_type="application/octet-stream",
        filename=f"{file_id}.ply"
    )


@app.get("/api/samples")
async def list_sample_models():
    """Lists available pre-generated sample PLY models for testing."""
    samples = []
    if SAMPLES_DIR.exists():
        for item in SAMPLES_DIR.glob("*.ply"):
            meta = inspect_point_cloud(item)
            samples.append({
                "sample_id": item.stem,
                "name": item.stem.replace("sample_", "").replace("_", " ").title(),
                "filename": item.name,
                "num_points": meta.get("num_points", 0),
                "has_colors": meta.get("has_colors", False),
                "has_normals": meta.get("has_normals", False),
            })
    return {"samples": samples}


@app.post("/api/samples/{sample_id}/load")
async def load_sample_point_cloud(sample_id: str):
    """Copies a pre-generated sample file into active uploads for instant testing."""
    source_file = SAMPLES_DIR / f"{sample_id}.ply"
    if not source_file.exists():
        raise HTTPException(status_code=404, detail=f"Sample '{sample_id}' not found.")

    file_id = f"pc_{uuid4().hex[:12]}"
    target_path = UPLOAD_DIR / f"{file_id}.ply"
    shutil.copyfile(source_file, target_path)

    metadata = inspect_point_cloud(target_path)
    return {
        "success": True,
        "file_id": file_id,
        "filename": source_file.name,
        "file_size_bytes": target_path.stat().st_size,
        "num_points": metadata["num_points"],
        "has_colors": metadata["has_colors"],
        "has_normals": metadata["has_normals"],
        "bounds": metadata["bounds"],
        "pointcloud_url": f"/api/pointcloud/{file_id}"
    }


@app.post("/api/reconstruct")
async def reconstruct_mesh(req: ReconstructRequest):
    """
    Executes Poisson Surface Reconstruction on the selected point cloud.
    Returns mesh metadata and URLs for Viewer B rendering and file export.
    """
    input_file = UPLOAD_DIR / f"{req.file_id}.ply"
    if not input_file.exists():
        raise HTTPException(status_code=404, detail="Source point cloud file not found.")

    mesh_id = f"mesh_{uuid4().hex[:12]}"
    output_file = OUTPUT_DIR / f"{mesh_id}.ply"
    display_output_file = OUTPUT_DIR / f"{mesh_id}_display.ply"

    try:
        stats = run_poisson_reconstruction(
            input_ply_path=input_file,
            output_ply_path=output_file,
            depth=req.depth,
            density_trim_percent=req.density_trim,
            k_neighbors=req.k_neighbors,
            scale=req.scale,
            linear_fit=req.linear_fit,
            output_display_ply_path=display_output_file,
            max_display_triangles=MAX_DISPLAY_TRIANGLES
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reconstruction failed: {str(e)}")

    mesh_viewer_url = f"/api/mesh/{mesh_id}?display=true" if stats.get("has_display_mesh") else f"/api/mesh/{mesh_id}"

    return {
        "success": True,
        "mesh_id": mesh_id,
        "stats": stats,
        "mesh_url": mesh_viewer_url,
        "download_url": f"/api/mesh/{mesh_id}/download"
    }


@app.get("/api/mesh/{mesh_id}")
async def get_reconstructed_mesh(mesh_id: str, display: bool = Query(False)):
    """Streams the reconstructed PLY mesh for 3D rendering in Viewer B."""
    if display:
        display_file = OUTPUT_DIR / f"{mesh_id}_display.ply"
        if display_file.exists():
            return FileResponse(
                str(display_file),
                media_type="application/octet-stream",
                filename=f"{mesh_id}_display.ply"
            )

    file_path = OUTPUT_DIR / f"{mesh_id}.ply"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Reconstructed mesh not found.")

    return FileResponse(
        str(file_path),
        media_type="application/octet-stream",
        filename=f"{mesh_id}.ply"
    )


@app.get("/api/mesh/{mesh_id}/download")
async def download_reconstructed_mesh(mesh_id: str, name: Optional[str] = None):
    """
    Downloads the reconstructed triangle mesh as a PLY file.
    Ensures standard Content-Disposition header for browser downloads.
    """
    file_path = OUTPUT_DIR / f"{mesh_id}.ply"
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Reconstructed mesh not found for download.")

    download_filename = name or f"reconstructed_mesh_{mesh_id[:8]}.ply"
    if not download_filename.endswith(".ply"):
        download_filename += ".ply"

    return FileResponse(
        str(file_path),
        media_type="application/x-ply",
        filename=download_filename,
        headers={"Content-Disposition": f'attachment; filename="{download_filename}"'}
    )
