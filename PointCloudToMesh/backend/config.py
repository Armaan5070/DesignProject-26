"""
Application Configuration and Directory Management
"""
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
OUTPUT_DIR = DATA_DIR / "outputs"
SAMPLES_DIR = BASE_DIR / "samples"

# Ensure runtime directories exist
for directory in [DATA_DIR, UPLOAD_DIR, OUTPUT_DIR, SAMPLES_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Upload Configuration
ALLOWED_EXTENSIONS = {".ply"}
MAX_UPLOAD_SIZE_BYTES = 1024 * 1024 * 1024  # 1 GB max file size (1024 MB)
UPLOAD_CHUNK_SIZE_BYTES = 8 * 1024 * 1024    # 8 MB streaming buffer for fast 1GB file transfer

# Large Model WebGL Display Optimization Thresholds
# Keeps original 1GB files 100% full precision for Poisson reconstruction,
# while serving an adaptive display representation if WebGL vertex buffers would crash.
MAX_DISPLAY_POINTS = 2_500_000
MAX_DISPLAY_TRIANGLES = 3_000_000

# Reconstruction Defaults
DEFAULT_OCTREE_DEPTH = 8
MIN_OCTREE_DEPTH = 6
MAX_OCTREE_DEPTH = 11

DEFAULT_DENSITY_TRIM_PERCENT = 5.0  # Quantile (0% to 25%)
DEFAULT_KNN_NORMALS = 30
DEFAULT_SCALE = 1.1
DEFAULT_LINEAR_FIT = False

# Server Configuration
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8000
