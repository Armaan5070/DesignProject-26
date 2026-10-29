"""
Stereo image rectification module.

Handles:
- Case A: Already-rectified image verification and optical parameter extraction.
- Case B: Full OpenCV stereo rectification (stereoRectify, initUndistortRectifyMap, remap).
"""

from typing import Tuple, NamedTuple
import cv2
import numpy as np
from ..models.calibration import (
    RectifiedStereoCalibration,
    FullStereoRigCalibration,
    StereoCalibration,
)


class RectifiedRigParams(NamedTuple):
    rectified_left: np.ndarray
    rectified_right: np.ndarray
    baseline_mm: float
    fx: float
    fy: float
    cx: float
    cy: float


def prepare_and_rectify(
    left_img: np.ndarray,
    right_img: np.ndarray,
    calibration: StereoCalibration,
) -> RectifiedRigParams:
    """
    Validates stereo pair dimensions and aligns epipolar lines.

    Args:
        left_img: Left image as uint8 NumPy array (H, W, 3).
        right_img: Right image as uint8 NumPy array (H, W, 3).
        calibration: Verified StereoCalibration object.

    Returns:
        RectifiedRigParams with rectified images and optical parameters.

    Raises:
        ValueError: If image dimensions mismatch or rectification fails.
    """
    h_l, w_l = left_img.shape[:2]
    h_r, w_r = right_img.shape[:2]

    if (h_l != h_r) or (w_l != w_r):
        raise ValueError(
            f"Stereo image dimensions mismatch: left image is {w_l}x{h_l} px, "
            f"right image is {w_r}x{h_r} px. Epipolar stereo matching requires matching dimensions."
        )

    width = w_l
    height = h_l

    if isinstance(calibration, RectifiedStereoCalibration):
        # Case A: Images are already epipolar-rectified
        baseline_mm = float(calibration.baseline_distance_mm)
        fx = float(calibration.focal_length_px)
        fy = float(calibration.focal_length_y_px or fx)

        if calibration.principal_point is not None:
            cx, cy = float(calibration.principal_point[0]), float(calibration.principal_point[1])
        else:
            cx, cy = width / 2.0, height / 2.0

        return RectifiedRigParams(
            rectified_left=left_img,
            rectified_right=right_img,
            baseline_mm=baseline_mm,
            fx=fx,
            fy=fy,
            cx=cx,
            cy=cy,
        )

    elif isinstance(calibration, FullStereoRigCalibration):
        # Case B: Unrectified raw images requiring full stereo rectification
        k1 = np.array(calibration.left_camera_matrix, dtype=np.float64)
        k2 = np.array(calibration.right_camera_matrix, dtype=np.float64)
        d1 = np.array(calibration.left_distortion_coefficients, dtype=np.float64)
        d2 = np.array(calibration.right_distortion_coefficients, dtype=np.float64)
        r = np.array(calibration.rotation_matrix, dtype=np.float64)
        t = np.array(calibration.translation_vector, dtype=np.float64).reshape(3, 1)

        r1, r2, p1, p2, q, _, _ = cv2.stereoRectify(
            cameraMatrix1=k1,
            distCoeffs1=d1,
            cameraMatrix2=k2,
            distCoeffs2=d2,
            imageSize=(width, height),
            R=r,
            T=t,
            flags=cv2.CALIB_ZERO_DISPARITY,
            alpha=0,
        )

        map1x, map1y = cv2.initUndistortRectifyMap(k1, d1, r1, p1, (width, height), cv2.CV_32FC1)
        map2x, map2y = cv2.initUndistortRectifyMap(k2, d2, r2, p2, (width, height), cv2.CV_32FC1)

        rectified_left = cv2.remap(left_img, map1x, map1y, cv2.INTER_LINEAR)
        rectified_right = cv2.remap(right_img, map2x, map2y, cv2.INTER_LINEAR)

        fx = float(p1[0, 0])
        fy = float(p1[1, 1])
        cx = float(p1[0, 2])
        cy = float(p1[1, 2])

        # Baseline in mm is extracted from P2 projection matrix: P2[0, 3] = -fx * Baseline
        if abs(p2[0, 3]) > 1e-6:
            baseline_mm = abs(float(p2[0, 3])) / fx
        else:
            baseline_mm = float(np.linalg.norm(t))

        return RectifiedRigParams(
            rectified_left=rectified_left,
            rectified_right=rectified_right,
            baseline_mm=baseline_mm,
            fx=fx,
            fy=fy,
            cx=cx,
            cy=cy,
        )

    else:
        raise ValueError(f"Unknown calibration type: {type(calibration).__name__}")
