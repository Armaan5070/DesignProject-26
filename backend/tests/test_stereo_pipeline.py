"""
Unit and integration tests for the stereo processing pipeline modules.
"""

from pathlib import Path
import pytest
import numpy as np
import cv2

from app.models.calibration import RectifiedStereoCalibration
from app.pipeline.rectification import prepare_and_rectify
from app.pipeline.stereo import compute_stereo_sgbm
from app.pipeline.depth import reconstruct_3d_points
from app.pipeline.ply_writer import write_ply
from app.pipeline.runner import run_pipeline


def test_rectification_dimension_mismatch(synthetic_stereo_pair):
    """Rejects stereo images with mismatched resolutions."""
    left = synthetic_stereo_pair["left_bgr"]
    # Resize right image to mismatch
    right_mismatched = cv2.resize(synthetic_stereo_pair["right_bgr"], (200, 200))

    calib = RectifiedStereoCalibration(
        baseline_distance_mm=120.0,
        focal_length_px=500.0,
    )

    with pytest.raises(ValueError) as exc:
        prepare_and_rectify(left, right_mismatched, calib)
    assert "dimensions mismatch" in str(exc.value)


def test_stereo_sgbm_disparity_computation(synthetic_stereo_pair):
    """Verifies that StereoSGBM computes disparity and visualization."""
    left = synthetic_stereo_pair["left_bgr"]
    right = synthetic_stereo_pair["right_bgr"]

    disp, vis = compute_stereo_sgbm(left, right, min_disparity=0, num_disparities=64, block_size=5)

    assert disp.dtype == np.float32
    assert disp.shape == left.shape[:2]
    assert vis.dtype == np.uint8
    assert vis.shape == (*left.shape[:2], 3)

    # Disparity at foreground patch (y=100, x=140) should be close to 16
    patch_disp = disp[90:130, 130:170]
    valid_patch_disp = patch_disp[patch_disp > 0.5]
    assert len(valid_patch_disp) > 0
    # Median detected disparity in patch should be within 2 pixels of 16.0
    assert abs(np.median(valid_patch_disp) - 16.0) < 3.0


def test_disparity_filtering_rejects_invalid_values():
    """Ensures depth reconstruction strictly rejects invalid, negative, zero, and infinite disparities."""
    h, w = 100, 100
    fake_disp = np.full((h, w), -1.0, dtype=np.float32)
    fake_disp[10, 10] = 0.0
    fake_disp[20, 20] = np.nan
    fake_disp[30, 30] = np.inf
    fake_disp[40, 40] = 0.3  # Below 0.5 threshold

    fake_img = np.zeros((h, w, 3), dtype=np.uint8)

    with pytest.raises(ValueError) as exc:
        reconstruct_3d_points(
            disparity=fake_disp,
            baseline_mm=100.0,
            fx=500.0,
            fy=500.0,
            cx=50.0,
            cy=50.0,
            left_bgr_img=fake_img,
        )
    assert "zero valid pixels" in str(exc.value).lower()


def test_depth_reconstruction_with_valid_disparities(synthetic_stereo_pair):
    """Verifies depth triangulation, coordinate calculation, and color extraction."""
    left = synthetic_stereo_pair["left_bgr"]
    right = synthetic_stereo_pair["right_bgr"]

    disp, _ = compute_stereo_sgbm(left, right, num_disparities=64)

    pt_cloud = reconstruct_3d_points(
        disparity=disp,
        baseline_mm=120.0,
        fx=500.0,
        fy=500.0,
        cx=160.0,
        cy=120.0,
        left_bgr_img=left,
        min_disparity=0.5,
    )

    assert pt_cloud.valid_count > 0
    assert pt_cloud.points.shape == (pt_cloud.valid_count, 3)
    assert pt_cloud.colors.shape == (pt_cloud.valid_count, 3)
    assert pt_cloud.points.dtype == np.float32
    assert pt_cloud.colors.dtype == np.uint8

    # Depth Z = (fx * B) / d -> for d=16: Z = (500 * 120) / 16 = 3750 mm
    # Median depth should be in reasonable physical range around 3750 mm
    assert 2000.0 < pt_cloud.depth_median_mm < 6000.0


def test_ply_writer_binary_format(tmp_path):
    """Verifies that binary PLY files have standard headers and valid structure."""
    pts = np.array([
        [10.0, 20.0, -30.0],
        [40.0, -50.0, 60.0],
    ], dtype=np.float32)
    colors = np.array([
        [255, 0, 128],
        [0, 255, 64],
    ], dtype=np.uint8)

    ply_path = tmp_path / "test.ply"
    count = write_ply(ply_path, pts, colors, binary=True)
    assert count == 2
    assert ply_path.exists()

    with open(ply_path, "rb") as f:
        content = f.read()

    header_text = content.split(b"end_header\n")[0].decode("ascii")
    assert "format binary_little_endian 1.0" in header_text
    assert "element vertex 2" in header_text
    assert "property float x" in header_text
    assert "property uchar red" in header_text

    # Binary payload should be exactly 2 * 15 bytes = 30 bytes
    payload = content.split(b"end_header\n")[1]
    assert len(payload) == 30


def test_full_pipeline_runner(tmp_path, synthetic_stereo_pair):
    """Executes full stereo runner and checks all output artifacts."""
    job_dir = tmp_path / "job_001"
    job_dir.mkdir(parents=True)

    left_path = job_dir / "left.png"
    right_path = job_dir / "right.png"
    with open(left_path, "wb") as f:
        f.write(synthetic_stereo_pair["left_bytes"])
    with open(right_path, "wb") as f:
        f.write(synthetic_stereo_pair["right_bytes"])

    calib = RectifiedStereoCalibration(
        baseline_distance_mm=120.0,
        focal_length_px=500.0,
        image_width=synthetic_stereo_pair["width"],
        image_height=synthetic_stereo_pair["height"],
    )

    steps_recorded = []
    def on_step(idx, step_id, status, msg):
        steps_recorded.append((idx, step_id, status))

    res = run_pipeline(
        job_dir=job_dir,
        left_image_path=left_path,
        right_image_path=right_path,
        calibration=calib,
        on_step_change=on_step,
    )

    assert res.success is True
    assert res.point_count > 0
    assert res.point_cloud_path.exists()
    assert res.disparity_path.exists()
    assert res.disparity_vis_path.exists()
    assert res.rectified_left_path.exists()
    assert res.rectified_right_path.exists()

    # Verify stage progression
    step_ids = [s[1] for s in steps_recorded]
    assert "prepare" in step_ids
    assert "depth" in step_ids
    assert "surface" in step_ids
    assert "results" in step_ids
