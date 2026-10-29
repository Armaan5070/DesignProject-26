"""
Calibration parser and contract validator for Surface stereo reconstruction.

Enforces strict physical constraints:
- Case A: Already-rectified stereo parameters (requires baseline_distance_mm > 0 and focal_length_px > 0).
- Case B: Raw stereo rig parameters (requires K1, K2, D1, D2, R, T).

Rejects incomplete or ambiguous calibration with detailed human-readable error messages.
"""

import json
from typing import Dict, Any, Union, Tuple
from pydantic import ValidationError
from ..models.calibration import (
    RectifiedStereoCalibration,
    FullStereoRigCalibration,
    StereoCalibration,
    CalibrationSummary,
)


class CalibrationValidationError(ValueError):
    """Raised when a calibration payload fails geometric validation or is insufficient."""
    pass


def parse_calibration(
    raw_content: Union[str, bytes, dict],
    file_name: str = "camera_calibration.json",
    image_width: int = None,
    image_height: int = None,
) -> Tuple[StereoCalibration, CalibrationSummary]:
    """
    Parses and strictly validates camera calibration data.

    Returns:
        Tuple of (StereoCalibration, CalibrationSummary)

    Raises:
        CalibrationValidationError: If JSON is invalid or calibration lacks required fields.
    """
    if isinstance(raw_content, (str, bytes)):
        try:
            data = json.loads(raw_content)
        except json.JSONDecodeError as e:
            raise CalibrationValidationError(
                f"Invalid calibration JSON: File '{file_name}' cannot be parsed as valid JSON. Details: {e.msg}"
            )
    elif isinstance(raw_content, dict):
        data = raw_content
    else:
        raise CalibrationValidationError(
            f"Unsupported calibration input type: {type(raw_content).__name__}"
        )

    if not isinstance(data, dict):
        raise CalibrationValidationError(
            f"Calibration JSON root must be an object/dictionary, got {type(data).__name__}."
        )

    # Detect whether input matches Case B (Raw Stereo Rig) or Case A (Rectified Stereo)
    has_rig_keys = any(
        k in data
        for k in (
            "left_camera_matrix",
            "K1",
            "camera_matrix_left",
            "rotation_matrix",
            "R",
            "translation_vector",
            "T",
        )
    )

    if has_rig_keys or data.get("mode") == "full_stereo_rig":
        # Case B: Full stereo rig calibration
        try:
            rig = FullStereoRigCalibration(**data)
            w = rig.image_width or image_width
            h = rig.image_height or image_height
            summary = CalibrationSummary(
                file_name=file_name,
                mode="full_stereo_rig",
                baseline_distance_mm=float(
                    (rig.translation_vector[0]**2 + rig.translation_vector[1]**2 + rig.translation_vector[2]**2)**0.5
                ),
                focal_length_px=float(rig.left_camera_matrix[0][0]),
                image_resolution=f"{w} × {h} px" if (w and h) else None,
                status="valid",
                notes="Full stereo rig calibration verified (K1, K2, D1, D2, R, T). Epipolar rectification enabled.",
            )
            return rig, summary
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise CalibrationValidationError(
                f"Insufficient or invalid full stereo rig calibration: {'; '.join(errors)}. "
                "Raw unrectified stereo requires complete intrinsics (K1, K2), distortion (D1, D2), "
                "and relative pose (R, T)."
            )

    # Case A: Already-rectified stereo parameters
    has_rect_keys = any(
        k in data
        for k in (
            "baseline_distance_mm",
            "baseline",
            "baseline_mm",
            "focal_length_px",
            "focal_length",
            "focal_px",
            "fx",
        )
    )

    if has_rect_keys or data.get("mode") == "rectified" or "camera_model" in data:
        try:
            rect = RectifiedStereoCalibration(**data)
            # If principal point is omitted, set default based on resolution if provided
            if rect.principal_point is None and image_width and image_height:
                rect.principal_point = (image_width / 2.0, image_height / 2.0)

            w = rect.image_width or image_width
            h = rect.image_height or image_height
            summary = CalibrationSummary(
                file_name=file_name,
                mode="rectified",
                baseline_distance_mm=rect.baseline_distance_mm,
                focal_length_px=rect.focal_length_px,
                image_resolution=f"{w} × {h} px" if (w and h) else None,
                status="valid",
                notes="Rectified stereo calibration parameters verified (baseline distance and focal length).",
            )
            return rect, summary
        except ValidationError as e:
            errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
            raise CalibrationValidationError(
                f"Insufficient calibration parameters: {'; '.join(errors)}. "
                "Rectified stereo reconstruction requires positive 'baseline_distance_mm' and 'focal_length_px'."
            )

    # If neither Case A nor Case B keys were found
    raise CalibrationValidationError(
        f"Insufficient calibration contract in '{file_name}': The file does not specify either "
        "(A) rectified stereo parameters ('baseline_distance_mm' and 'focal_length_px') or "
        "(B) full stereo rig parameters ('left_camera_matrix', 'right_camera_matrix', 'rotation_matrix', 'translation_vector'). "
        "A 3D surface cannot be accurately reconstructed without calibrated camera baseline and optical parameters."
    )
