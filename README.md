# Surface — Distributed 3D Structural Surface Processing System

Surface is a 3D structural inspection platform designed to reconstruct physical surfaces from calibrated stereo photographs, measure geometric deviations, and help engineers identify potential cracks and structural surface irregularities.

---

## 1. Project Overview & Workflow

Surface operates through a natural, end-to-end inspection journey:

$$\text{Upload stereo pair} \longrightarrow \text{Validate camera parameters} \longrightarrow \text{Reconstruct 3D surface} \longrightarrow \text{Inspect findings}$$

1. **Upload & Calibration**: Ingests left and right stereo camera photographs alongside camera calibration (baseline distance and focal length in JSON format).
2. **Epipolar Alignment & Rectification**: Corrects optical distortions and aligns perspective scanlines ($y_L = y_R$).
3. **Disparity Estimation**: Measures sub-pixel horizontal displacement between stereo views.
4. **Metric 3D Triangulation**: Triangulates physical surface coordinates in millimeters ($X, Y, Z$) and aligns with Three.js world coordinates.
5. **Geometric Deviation Analysis**: Measures out-of-plane surface depressions/spalls against a fitted reference plane.
6. **Damage Detection**: Correlates visual surface patterns with geometric anomalies to detect fissures and surface irregularities.
7. **Interactive 3D Review**: Explores the metric PLY point cloud in a Three.js WebGL viewer with OrbitControls, color mapping, and inspection findings.

---

## 2. Pipeline Implementation Status

| Stage ID | Pipeline Stage | Implementation Status | Current Baseline Technology | Planned Target |
|---|---|---|---|---|
| `prepare` | Stereo Pair Validation & Rectification | **Implemented** | OpenCV `stereoRectify` & dimension validation | Full stereo rig rectification |
| `depth` | Disparity & Depth Estimation | **Implemented (Baseline)** | OpenCV Semi-Global Block Matching (StereoSGBM) | Armaan's RAFT-Stereo pipeline |
| `surface` | Metric 3D Coordinate Triangulation & PLY Export | **Implemented** | Pinhole stereo triangulation ($Z = \frac{f_x \cdot B}{d}$) & binary PLY writer | Armaan's point-cloud generator |
| `deviations` | Out-of-Plane Surface Deviation Analysis | **Pending** | Milestone 1 honest baseline (0 fabricated deviations) | Satyam's geometric analysis pipeline |
| `damage` | Structural Crack & Irregularity Detection | **Pending** | Milestone 1 honest baseline (empty findings `[]`) | Satyam's anomaly classifier |
| `results` | Artifact Manifest & Metric Report Delivery | **Implemented** | FastAPI JSON manifest & binary PLY artifact endpoint | Comprehensive inspection report |

---

## 3. Team Ownership & Integration Contracts

- **Armaan (Stereo Images $\to$ Point Cloud)**:
  - Input: Left and right calibrated stereo images, calibration JSON.
  - Output: Metric 3D point cloud coordinates $(X, Y, Z)$ in millimeters, vertex RGB colors, and disparity map.
  - Integration target: `backend/app/pipeline/stereo.py` and `depth.py`.
- **Satyam (Point Cloud $\to$ 3D Surface & Damage Findings)**:
  - Input: Point cloud array (NumPy $(N, 3)$ float32 in millimeters, RGB colors).
  - Output: Reference plane fit, out-of-plane deviations (mm), bounding regions, and classified structural findings.
  - Integration target: `backend/app/pipeline/deviations.py` and `damage.py`.
- **Deep (Frontend Dashboard & Full-Stack Orchestration)**:
  - React + Vite + Three.js viewer, FastAPI backend, job execution manager, and artifact delivery.

The shared integration branch for all development is **`main`**. Contributors should branch from `main` and open pull requests targeting `main`. See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines, branch conventions, and step-by-step instructions.

---

## 4. Local Setup & Run Commands

### Prerequisites
- **macOS** (Apple Silicon or Intel) or Linux
- **Node.js** 18+ and `npm`
- **Python** 3.10, 3.11, or 3.12

### Frontend Setup & Execution
```bash
# Install frontend dependencies
npm install

# Start Vite development server
npm run dev
# The application will be accessible at http://localhost:5173/
```

### Python Backend Setup & Execution
```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python3.12 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI backend server (from workspace root)
./backend/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend --reload
# API docs available at http://localhost:8000/docs
```

### Environment Configuration
Copy `.env.example` to `.env` in the workspace root:
```ini
# When set, the frontend communicates with the real FastAPI photogrammetry backend
VITE_API_BASE_URL=http://localhost:8000
```
*(Leaving `VITE_API_BASE_URL` empty automatically switches the frontend to client-side Demo Mode).*

---

## 5. Verification & Tests

Always run both test suites before committing code:

```bash
# Run backend pytest suite (21 unit and integration tests)
./backend/venv/bin/pytest backend/tests/ -v

# Run frontend linter and production build
npx oxlint
npm run build
```

---

## 6. Repository Architecture

```text
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application & CORS configuration
│   │   ├── models/
│   │   │   ├── calibration.py          # Case A & Case B calibration schemas
│   │   │   └── inspection.py           # Inspection API schemas & pipeline stages
│   │   ├── pipeline/
│   │   │   ├── calibration_parser.py   # Strict calibration contract validator
│   │   │   ├── depth.py                # Disparity-to-depth triangulation & filter
│   │   │   ├── ply_writer.py           # Fast binary little-endian PLY exporter
│   │   │   ├── rectification.py        # Case A & Case B stereo rectification
│   │   │   ├── runner.py               # 6-stage pipeline orchestrator
│   │   │   └── stereo.py               # StereoSGBM disparity baseline
│   │   ├── routes/
│   │   │   └── inspections.py          # Upload, status polling & artifact endpoints
│   │   └── services/
│   │       └── job_manager.py          # Persistent workspace & thread worker pool
│   ├── requirements.txt                # Pinned backend dependencies
│   ├── storage/jobs/                   # Local job workspaces (ignored by git)
│   └── tests/                          # 21 unit and integration tests
├── src/
│   ├── components/
│   │   ├── common/                     # Reusable UI primitives (Button, Card, Badge)
│   │   ├── layout/                     # Top Navbar with Real/Demo toggle
│   │   └── viewer/                     # ThreeSurfaceViewer (WebGL PLY point cloud)
│   ├── pages/                          # Overview, NewInspection, Progress, Detail, History
│   ├── services/                       # Typed API client with response normalizer
│   └── types/                          # Shared TypeScript domain interfaces
├── public/samples/                     # Calibrated sample stereo pair & sample PLY
├── scripts/                            # Synthetic stereo pair generation utilities
├── CONTRIBUTING.md                     # Team collaboration and branch guidelines
└── README.md                           # Project documentation
```
