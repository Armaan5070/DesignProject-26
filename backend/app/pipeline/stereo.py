"""
Classical stereo matching baseline using OpenCV StereoSGBM.

Computes sub-pixel horizontal disparity between epipolar-rectified left and right stereo images.
Outputs:
- Raw floating-point disparity map (disparity.npy)
- Color-mapped disparity visualization for quality assessment (disparity_vis.png)
"""

from typing import Tuple
import cv2
import numpy as np


def compute_stereo_sgbm(
    left_img: np.ndarray,
    right_img: np.ndarray,
    min_disparity: int = 0,
    num_disparities: int = 128,
    block_size: int = 5,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Computes disparity using OpenCV Semi-Global Block Matching (StereoSGBM).

    Args:
        left_img: Rectified left BGR or grayscale image (H, W, 3) or (H, W).
        right_img: Rectified right BGR or grayscale image (H, W, 3) or (H, W).
        min_disparity: Minimum disparity search offset (typically 0).
        num_disparities: Disparity search range (must be divisible by 16).
        block_size: Matched block size (odd integer >= 3).

    Returns:
        Tuple of (disparity_float, disparity_vis):
        - disparity_float: np.float32 array of shape (H, W) in pixels.
        - disparity_vis: np.uint8 BGR image of shape (H, W, 3) with color-mapped valid disparities.
    """
    # Ensure num_disparities is divisible by 16
    if num_disparities % 16 != 0:
        num_disparities = ((num_disparities // 16) + 1) * 16

    # Convert to grayscale if necessary
    if len(left_img.shape) == 3:
        gray_left = cv2.cvtColor(left_img, cv2.COLOR_BGR2GRAY)
    else:
        gray_left = left_img.copy()

    if len(right_img.shape) == 3:
        gray_right = cv2.cvtColor(right_img, cv2.COLOR_BGR2GRAY)
    else:
        gray_right = right_img.copy()

    # Pre-filter / enhance contrast slightly for robust correlation
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray_left = clahe.apply(gray_left)
    gray_right = clahe.apply(gray_right)

    # OpenCV SGBM configuration
    sgbm = cv2.StereoSGBM_create(
        minDisparity=min_disparity,
        numDisparities=num_disparities,
        blockSize=block_size,
        P1=8 * 3 * block_size * block_size,
        P2=32 * 3 * block_size * block_size,
        disp12MaxDiff=1,
        uniquenessRatio=10,
        speckleWindowSize=100,
        speckleRange=32,
        preFilterCap=63,
        mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY,
    )

    # Compute raw 16-bit disparity (values scaled by 16)
    disp16 = sgbm.compute(gray_left, gray_right)

    # Convert to true sub-pixel floating-point disparity in pixel units
    disparity_float = disp16.astype(np.float32) / 16.0

    # Create visualization
    valid_mask = (disparity_float > 0.5) & (disparity_float < (min_disparity + num_disparities)) & np.isfinite(disparity_float)

    disparity_vis = np.zeros((*disparity_float.shape, 3), dtype=np.uint8)

    if np.any(valid_mask):
        valid_vals = disparity_float[valid_mask]
        d_min = float(np.percentile(valid_vals, 2))
        d_max = float(np.percentile(valid_vals, 98))
        if d_max > d_min:
            norm_disp = np.clip((disparity_float - d_min) / (d_max - d_min) * 255.0, 0, 255).astype(np.uint8)
        else:
            norm_disp = np.zeros_like(disparity_float, dtype=np.uint8)

        # Apply TURBO colormap (high perceptual contrast)
        colored = cv2.applyColorMap(norm_disp, cv2.COLORMAP_TURBO)
        disparity_vis[valid_mask] = colored[valid_mask]
        # Invalid pixels remain dark slate gray (30, 30, 30) for clarity
        disparity_vis[~valid_mask] = [30, 30, 30]

    return disparity_float, disparity_vis
