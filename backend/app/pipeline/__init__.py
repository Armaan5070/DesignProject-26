"""Pipeline package for Surface stereo reconstruction."""
from .calibration_parser import parse_calibration, CalibrationValidationError
from .rectification import prepare_and_rectify, RectifiedRigParams
from .stereo import compute_stereo_sgbm
from .depth import reconstruct_3d_points, PointCloudData
from .ply_writer import write_ply
from .runner import run_pipeline, PipelineExecutionResult

__all__ = [
    "parse_calibration",
    "CalibrationValidationError",
    "prepare_and_rectify",
    "RectifiedRigParams",
    "compute_stereo_sgbm",
    "reconstruct_3d_points",
    "PointCloudData",
    "write_ply",
    "run_pipeline",
    "PipelineExecutionResult",
]
