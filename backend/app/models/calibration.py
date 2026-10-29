"""
Calibration models and validation contracts for Surface 3D Structural Inspection.

Supports two rigorous contracts:
1. Case A: Already-rectified stereo camera parameters
   - Baseline distance B (mm, > 0)
   - Focal length fx (pixels, > 0)
   - Optional fy (pixels, > 0, defaults to fx)
   - Optional principal point [cx, cy] (pixels, defaults to image center if omitted)
   - Optional image dimensions [width, height]

2. Case B: Full raw stereo camera rig parameters
   - Left intrinsic matrix K1 (3x3)
   - Right intrinsic matrix K2 (3x3)
   - Left distortion vector D1 (>= 4 coefficients)
   - Right distortion vector D2 (>= 4 coefficients)
   - Relative rotation matrix R (3x3)
   - Relative translation vector T (3x1, in mm)
   - Optional image dimensions [width, height]
"""

from typing import List, Optional, Tuple, Literal, Union
from pydantic import BaseModel, Field, ConfigDict, AliasChoices, model_validator


class RectifiedStereoCalibration(BaseModel):
    """Parameters for stereo pairs that have already been epipolar-rectified."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    mode: Literal["rectified"] = "rectified"
    baseline_distance_mm: float = Field(
        ...,
        gt=0,
        validation_alias=AliasChoices("baseline_distance_mm", "baseline", "baseline_mm"),
        description="Distance between camera optical centers in mm",
    )
    focal_length_px: float = Field(
        ...,
        gt=0,
        validation_alias=AliasChoices("focal_length_px", "focal_length", "focal_px", "fx"),
        description="Focal length in pixels (fx)",
    )
    focal_length_y_px: Optional[float] = Field(
        None,
        gt=0,
        validation_alias=AliasChoices("focal_length_y_px", "fy"),
        description="Focal length in pixels (fy), if non-square pixels",
    )
    principal_point: Optional[Tuple[float, float]] = Field(
        None,
        validation_alias=AliasChoices("principal_point", "principal_point_px", "cx_cy", "center"),
        description="[cx, cy] principal point optical center",
    )
    image_width: Optional[int] = Field(
        None,
        gt=0,
        validation_alias=AliasChoices("image_width", "width", "w"),
    )
    image_height: Optional[int] = Field(
        None,
        gt=0,
        validation_alias=AliasChoices("image_height", "height", "h"),
    )
    reprojection_error_px: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None


class FullStereoRigCalibration(BaseModel):
    """Full geometric parameters required to rectify raw unrectified stereo images."""
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    mode: Literal["full_stereo_rig"] = "full_stereo_rig"
    left_camera_matrix: List[List[float]] = Field(
        ...,
        validation_alias=AliasChoices("left_camera_matrix", "K1", "camera_matrix_left"),
        description="3x3 intrinsic matrix K1",
    )
    right_camera_matrix: List[List[float]] = Field(
        ...,
        validation_alias=AliasChoices("right_camera_matrix", "K2", "camera_matrix_right"),
        description="3x3 intrinsic matrix K2",
    )
    left_distortion_coefficients: List[float] = Field(
        ...,
        validation_alias=AliasChoices("left_distortion_coefficients", "D1", "dist_coeffs_left"),
        description="Distortion vector D1",
    )
    right_distortion_coefficients: List[float] = Field(
        ...,
        validation_alias=AliasChoices("right_distortion_coefficients", "D2", "dist_coeffs_right"),
        description="Distortion vector D2",
    )
    rotation_matrix: List[List[float]] = Field(
        ...,
        validation_alias=AliasChoices("rotation_matrix", "R", "rotation"),
        description="3x3 relative rotation matrix R",
    )
    translation_vector: List[float] = Field(
        ...,
        validation_alias=AliasChoices("translation_vector", "T", "translation"),
        description="3x1 relative translation vector T in mm",
    )
    image_width: Optional[int] = Field(
        None,
        gt=0,
        validation_alias=AliasChoices("image_width", "width", "w"),
    )
    image_height: Optional[int] = Field(
        None,
        gt=0,
        validation_alias=AliasChoices("image_height", "height", "h"),
    )
    reprojection_error_px: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None

    @model_validator(mode="after")
    def validate_matrices(self):
        if len(self.left_camera_matrix) != 3 or any(len(r) != 3 for r in self.left_camera_matrix):
            raise ValueError("left_camera_matrix must be a 3x3 matrix")
        if len(self.right_camera_matrix) != 3 or any(len(r) != 3 for r in self.right_camera_matrix):
            raise ValueError("right_camera_matrix must be a 3x3 matrix")
        if len(self.rotation_matrix) != 3 or any(len(r) != 3 for r in self.rotation_matrix):
            raise ValueError("rotation_matrix must be a 3x3 matrix")
        if len(self.translation_vector) != 3:
            raise ValueError("translation_vector must have exactly 3 components [Tx, Ty, Tz]")
        if len(self.left_distortion_coefficients) < 4:
            raise ValueError("left_distortion_coefficients must have at least 4 coefficients [k1, k2, p1, p2]")
        if len(self.right_distortion_coefficients) < 4:
            raise ValueError("right_distortion_coefficients must have at least 4 coefficients [k1, k2, p1, p2]")
        return self


StereoCalibration = Union[RectifiedStereoCalibration, FullStereoRigCalibration]


class CalibrationSummary(BaseModel):
    """Standardized summary serialized in inspection status responses."""
    model_config = ConfigDict(extra="ignore")

    file_name: str
    mode: Literal["rectified", "full_stereo_rig", "unverified"] = "unverified"
    baseline_distance_mm: Optional[float] = None
    focal_length_px: Optional[float] = None
    image_resolution: Optional[str] = None
    status: Literal["valid", "partial", "invalid", "unverified"] = "unverified"
    notes: Optional[str] = None
