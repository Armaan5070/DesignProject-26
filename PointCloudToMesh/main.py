"""
3D Point Cloud to 3D Mesh Reconstruction Application Launcher
Starts the FastAPI backend and launches the web interface.
"""
import sys
import time
import threading
import webbrowser
from pathlib import Path

# Ensure root directory is in python path
ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import SERVER_HOST, SERVER_PORT, SAMPLES_DIR
from backend.samples.generate_samples import generate_all_samples


def open_browser_delayed(url: str, delay_sec: float = 1.2):
    """Opens the web browser once the server starts."""
    time.sleep(delay_sec)
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")


def main():
    print("=" * 70)
    print("  3D Point Cloud to 3D Mesh Reconstruction Web Application")
    print("  Poisson Surface Reconstruction Engine")
    print("=" * 70)

    # 1. Check Open3D availability
    try:
        import open3d as o3d
        print(f"[OK] Open3D detected (v{o3d.__version__})")
    except ImportError:
        print("[WARNING] Open3D is not installed.")
        print("          Install it using: pip install open3d")
        print("          Header inspection and samples will still function,")
        print("          but surface reconstruction requires open3d.")

    # 2. Generate sample test models
    print("[*] Checking sample point cloud datasets...")
    created = generate_all_samples()
    if created:
        print(f"[OK] Generated {len(created)} sample models in {SAMPLES_DIR}")
    else:
        print(f"[OK] Sample models ready in {SAMPLES_DIR}")

    # 3. Check Uvicorn
    try:
        import uvicorn
    except ImportError:
        print("[ERROR] uvicorn is not installed. Please run:")
        print("        pip install fastapi \"uvicorn[standard]\" python-multipart")
        sys.exit(1)

    url = f"http://{SERVER_HOST}:{SERVER_PORT}"
    print(f"\n[*] Starting Web Server on {url}")
    print(f"[*] Access the Web Application at: {url}")
    print("[*] Press Ctrl+C in terminal to stop the server.\n")

    # Open browser automatically in background thread
    threading.Thread(target=open_browser_delayed, args=(url,), daemon=True).start()

    # 4. Start Server
    uvicorn.run(
        "backend.app:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=False,
        timeout_keep_alive=300,
        log_level="info"
    )


if __name__ == "__main__":
    main()
