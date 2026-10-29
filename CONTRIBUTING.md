# Contributing to Distributed 3D Structural Surface Processing System (Surface)

Welcome to the team! This repository establishes the clean integration baseline on `main` for the **Surface** 3D structural inspection project.

---

## 1. Team Ownership & Integration Contracts

The project pipeline is divided into clear modular boundaries:

```
[ Stereo Images + Calibration ]
               │
               ▼
┌───────────────────────────────┐
│     Armaan's Pipeline         │  Stereo Images ➔ Point Cloud
│ (Epipolar Rectification,      │  - Inputs: Left & Right images, camera calibration
│  Disparity Estimation,        │  - Output: Metric 3D point cloud (PLY / NumPy coordinates)
│  Depth Triangulation)         │  - Baseline currently: OpenCV StereoSGBM
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│     Satyam's Pipeline         │  Point Cloud ➔ Surface Model & Anomalies
│ (Geometric Surface Analysis,  │  - Inputs: Calibrated 3D point cloud coordinates (mm)
│  Reference Fitting,           │  - Output: Surface mesh / geometric deviations / damage findings
│  Deviation & Crack Detection) │  - Baseline currently: Pending integration
└──────────────┬────────────────┘
               │
               ▼
┌───────────────────────────────┐
│     Deep and Bhavya's         |
|         Pipeline              │  Frontend Dashboard & Full-Stack Orchestration
│ (React + Vite + Three.js,     │  - FastAPI backend endpoints & job manager
│  WebGL PLY Viewer,            │  - Authentic status polling & artifact delivery
│  Inspection Workflow)         │  - Tested baseline active
└───────────────────────────────┘
```

### Integration Guidelines:
- **Preserve Existing Algorithms**: Existing algorithm implementations must be integrated with minimal changes to core logic.
- **Contract Agreement**: Before integration, we agree on input formats, output formats, coordinate conventions, units, dependencies, and error handling.
- **Coordinate Conventions**:
  - Triangulation camera frame: $+X$ right, $+Y$ down, $+Z$ forward.
  - Three.js viewer frame: $+X$ right, $+Y$ up, $+Z$ towards viewer.
  - Units: Millimeters ($\text{mm}$) for all physical dimensions and deviations.
- **Truthful Status**: Never simulate progress or fabricate synthetic findings. Record authentic durations and empty findings (`[]`) until actual detection models run.

---

## 2. Git Workflow for Contributors

The shared integration branch for all development is **`main`**.

### Step 1: Clone the Repository

```bash
git clone https://github.com/Deep084-bot/DesignProject-26.git
cd DesignProject-26
```

### Step 2: Switch to the Main Integration Branch

```bash
git switch main
git pull origin main
```

### Step 3: Create a Dedicated Feature Branch

Choose a descriptive branch name reflecting your ownership area:

- **For Armaan (stereo-to-point-cloud):**
  ```bash
  git switch -c feat/stereo-to-point-cloud
  ```
- **For Satyam (point-cloud-to-3D-model / surface analysis):**
  ```bash
  git switch -c feat/point-cloud-to-surface
  ```

### Step 4: Local Setup and Verification

Ensure your environment is set up and current tests pass before writing new code:

```bash
# Frontend
npm install
npm run build
npx oxlint

# Backend
python3.12 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
pytest backend/tests/ -v
```

### Step 5: Make Meaningful, Atomic Commits

- Commit only source code, tests, and documentation.
- Never commit `.env` files, `node_modules/`, `backend/venv/`, build outputs (`dist/`), temporary logs, or runtime jobs (`backend/storage/jobs/`).
- Verify what you are staging before committing:
  ```bash
  git status
  git diff
  git add <explicit-file-path>
  git diff --cached
  git commit -m "feat(pipeline): integrate stereo disparity estimator"
  ```

### Step 6: Run Verification Tests Before Pushing

Always verify that your changes do not break existing checks:
```bash
# Backend pytest suite
./backend/venv/bin/pytest backend/tests/ -v

# Frontend linter and production build
npx oxlint && npm run build
```

### Step 7: Push and Open a Pull Request Targeting `main`

```bash
git push -u origin <your-feature-branch>
```

Then visit [https://github.com/Deep084-bot/DesignProject-26](https://github.com/Deep084-bot/DesignProject-26) to open a pull request targeting **`main`**. Provide a concise description of your changes, inputs, outputs, and test results. Deep will review, test, and merge the pull requests.
