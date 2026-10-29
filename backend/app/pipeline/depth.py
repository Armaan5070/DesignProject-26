"""
Depth triangulation and 3D coordinate reconstruction from stereo disparity.

Units:
- Baseline: Millimeters (mm)
- Focal length: Pixels (px)
- Resulting coordinates (X, Y, Z): Millimeters (mm)

Strict filtering:
- Rejects invalid, non-finite, zero, and negative disparities.
- Rejects unphysically close or distant depth points.
- Never fabricates points for missing or low-confidence pixels.
"""

from typing import Tuple, NamedTuple, Optional
import numpy as np


class PointCloudData(NamedTuple):
    points: np.ndarray  # Shape (N, 3), float32, [X, Y, Z] in millimeters
    colors: np.ndarray  # Shape (N, 3), uint8, [R, G, B]
    valid_count: int
    depth_min_mm: float
    depth_max_mm: float
    depth_median_mm: float


def reconstruct_3d_points(
    disparity: np.ndarray,
    baseline_mm: float,
    fx: float,
    fy: float,
    cx: float,
    cy: float,
    left_bgr_img: np.ndarray,
    min_disparity: float = 0.5,
    min_depth_mm: float = 50.0,
    max_depth_mm: float = 50000.0,
    subsample_step: int = 1,
) -> PointCloudData:
    """
    Triangulates 3D points from disparity map using pinhole stereo geometry.

    Args:
        disparity: Disparity map float32 array (H, W).
        baseline_mm: Distance between camera optical centers in mm.
        fx: Horizontal focal length in pixels.
        fy: Vertical focal length in pixels.
        cx: Principal point horizontal offset in pixels.
        cy: Principal point vertical offset in pixels.
        left_bgr_img: Left image (H, W, 3) in BGR uint8.
        min_disparity: Disparity threshold below which pixels are deemed invalid.
        min_depth_mm: Minimum valid physical depth in mm.
        max_depth_mm: Maximum valid physical depth in mm.
        subsample_step: Spatial decimation step (1 = all valid pixels, 2 = half resolution).

    Returns:
        PointCloudData namedtuple containing valid 3D points and colors.

    Raises:
        ValueError: If no valid disparity pixels exist or baseline/focal length is invalid.
    """
    if baseline_mm <= 0:
        raise ValueError(f"Baseline distance must be strictly positive, got {baseline_mm} mm.")
    if fx <= 0 or fy <= 0:
        raise ValueError(f"Focal length must be strictly positive, got fx={fx}, fy={fy} px.")

    h, w = disparity.shape[:2]

    # Subsample grid if requested
    if subsample_step > 1:
        disp_sub = disparity[::subsample_step, ::subsample_step]
        img_sub = left_bgr_img[::subsample_step, ::subsample_step]
        u_coords = np.arange(0, w, subsample_step)
        v_coords = np.arange(0, h, subsample_step)
    else:
        disp_sub = disparity
        img_sub = left_bgr_img
        u_coords = np.arange(w)
        v_coords = np.arange(h)

    u_grid, v_grid = np.meshgrid(u_coords, v_coords)

    # 1. Strict disparity validation mask
    valid_mask = (
        np.isfinite(disp_sub)
        & (disp_sub > min_disparity)
    )

    if not np.any(valid_mask):
        raise ValueError(
            "Stereo disparity map contains zero valid pixels above the confidence threshold. "
            "Ensure the stereo pair has sufficient visual texture, horizontal baseline displacement, and valid overlap."
        )

    valid_disp = disp_sub[valid_mask]
    valid_u = u_grid[valid_mask]
    valid_v = v_grid[valid_mask]

    # 2. Triangulate depth: Z = (fx * Baseline) / disparity
    z_camera = (fx * baseline_mm) / valid_disp

    # 3. Filter depth by physical range constraints
    depth_in_bounds = (z_camera >= min_depth_mm) & (z_camera <= max_depth_mm)

    if not np.any(depth_in_bounds):
        raise ValueError(
            f"All triangulated depth points fell outside physical bounds [{min_depth_mm} mm, {max_depth_mm} mm]. "
            "Verify calibration focal length and baseline distance."
        )

    z = z_camera[depth_in_bounds]
    u = valid_u[depth_in_bounds]
    v = valid_v[depth_in_bounds]

    # 4. Project X and Y in camera frame (mm)
    # X_cam = (u - cx) * Z / fx
    # Y_cam = (v - cy) * Z / fy
    x_cam = (u - cx) * z / fx
    y_cam = (v - cy) * z / fy

    # 5. Transform to Three.js viewer coordinate frame:
    # OpenCV: +X Right, +Y Down, +Z Forward
    # Three.js: +X Right, +Y Up, +Z Towards Viewer
    x_three = x_cam.astype(np.float32)
    y_three = (-y_cam).astype(np.float32)  # Invert Y so up is up
    z_three = (-z).astype(np.float32)      # Invert Z so forward faces camera

    points_3d = np.stack([x_three, y_three, z_three], axis=1)

    # 6. Extract RGB colors from left image
    # Note: cv2 uses BGR, so convert BGR to RGB
    bgr_valid = img_sub[valid_mask][depth_in_bounds]
    rgb_colors = bgr_valid[:, [2, 1, 0]].astype(np.uint8)

    return PointCloudData(
        points=points_3d,
        colors=rgb_colors,
        valid_count=int(points_3d.shape[0]),
        depth_min_mm=float(np.min(z)),
        depth_max_mm=float(np.max(z)),
        depth_median_mm=float(np.median(z)),
    )
