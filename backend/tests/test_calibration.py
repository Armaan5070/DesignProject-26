"""
Unit tests for camera calibration parsing and contract validation.
"""

import pytest
from app.pipeline.calibration_parser import parse_calibration, CalibrationValidationError
from app.models.calibration import RectifiedStereoCalibration, FullStereoRigCalibration


def test_parse_valid_rectified_calibration(valid_rectified_calib_json):
    """Verifies that standard Case A rectified calibration parses and produces valid summary."""
    model, summary = parse_calibration(valid_rectified_calib_json, "test_calib.json", 320, 240)
    assert isinstance(model, RectifiedStereoCalibration)
    assert model.baseline_distance_mm == 120.0
    assert model.focal_length_px == 500.0
    assert model.principal_point == (160.0, 120.0)
    assert summary.status == "valid"
    assert summary.baseline_distance_mm == 120.0
    assert summary.focal_length_px == 500.0


def test_parse_valid_full_rig_calibration(valid_full_rig_calib_json):
    """Verifies that Case B raw stereo rig calibration parses and computes summary."""
    model, summary = parse_calibration(valid_full_rig_calib_json, "test_rig.json", 320, 240)
    assert isinstance(model, FullStereoRigCalibration)
    assert summary.status == "valid"
    assert summary.mode == "full_stereo_rig"
    assert summary.baseline_distance_mm == 120.0
    assert summary.focal_length_px == 500.0


def test_parse_invalid_json():
    """Rejects malformed JSON with understandable error."""
    with pytest.raises(CalibrationValidationError) as exc:
        parse_calibration("{malformed_json: true,", "bad.json")
    assert "Invalid calibration JSON" in str(exc.value)


def test_parse_insufficient_calibration_missing_fields():
    """Rejects JSON that contains only generic or partial metadata without baseline/focal length."""
    partial_json = '{"camera_model": "pinhole", "reprojection_error": 0.12}'
    with pytest.raises(CalibrationValidationError) as exc:
        parse_calibration(partial_json, "partial.json")
    assert "Insufficient" in str(exc.value)
    assert "baseline_distance_mm" in str(exc.value)


def test_parse_negative_baseline():
    """Rejects physical violations like negative baseline."""
    bad_json = '{"baseline_distance_mm": -100.0, "focal_length_px": 500.0}'
    with pytest.raises(CalibrationValidationError) as exc:
        parse_calibration(bad_json, "neg_baseline.json")
    assert "greater than 0" in str(exc.value).lower() or "insufficient" in str(exc.value).lower()


def test_parse_incomplete_rig_matrix():
    """Rejects Case B calibration if matrix dimensions are wrong."""
    bad_rig = '''{
        "left_camera_matrix": [[1.0, 0.0], [0.0, 1.0]],
        "right_camera_matrix": [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
        "left_distortion_coefficients": [0, 0, 0, 0],
        "right_distortion_coefficients": [0, 0, 0, 0],
        "rotation_matrix": [[1,0,0],[0,1,0],[0,0,1]],
        "translation_vector": [1, 2, 3]
    }'''
    with pytest.raises(CalibrationValidationError) as exc:
        parse_calibration(bad_rig, "bad_rig.json")
    assert "3x3 matrix" in str(exc.value)
