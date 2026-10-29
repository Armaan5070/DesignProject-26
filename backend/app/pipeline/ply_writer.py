"""
PLY point cloud serializer for Surface 3D Reconstruction.

Supports standard binary little-endian format compatible with Three.js PLYLoader:
- Vertex attributes: float x, y, z (coordinates in mm)
- Color attributes: uchar red, green, blue (0-255)
"""

from pathlib import Path
from typing import Union
import numpy as np


def write_ply(
    filepath: Union[str, Path],
    points: np.ndarray,
    colors: np.ndarray,
    binary: bool = True,
    comment: str = "Surface 3D Stereo Reconstruction",
) -> int:
    """
    Writes 3D points and colors to a standard PLY file.

    Args:
        filepath: Destination file path.
        points: (N, 3) float array of 3D coordinates.
        colors: (N, 3) uint8 array of RGB colors.
        binary: If True, writes binary_little_endian 1.0; else ascii 1.0.
        comment: Optional header comment.

    Returns:
        Number of points written.

    Raises:
        ValueError: If points or colors shape is invalid.
    """
    filepath = Path(filepath)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    if points.ndim != 2 or points.shape[1] != 3:
        raise ValueError(f"Points array must have shape (N, 3), got {points.shape}")
    if colors.ndim != 2 or colors.shape[1] != 3:
        raise ValueError(f"Colors array must have shape (N, 3), got {colors.shape}")
    if points.shape[0] != colors.shape[0]:
        raise ValueError(f"Points ({points.shape[0]}) and colors ({colors.shape[0]}) count mismatch.")

    n_points = points.shape[0]

    if binary:
        header = (
            "ply\n"
            "format binary_little_endian 1.0\n"
            f"comment {comment}\n"
            f"element vertex {n_points}\n"
            "property float x\n"
            "property float y\n"
            "property float z\n"
            "property uchar red\n"
            "property uchar green\n"
            "property uchar blue\n"
            "end_header\n"
        )

        dtype = np.dtype([
            ("x", "<f4"),
            ("y", "<f4"),
            ("z", "<f4"),
            ("red", "u1"),
            ("green", "u1"),
            ("blue", "u1"),
        ])

        structured_data = np.empty(n_points, dtype=dtype)
        structured_data["x"] = points[:, 0].astype(np.float32)
        structured_data["y"] = points[:, 1].astype(np.float32)
        structured_data["z"] = points[:, 2].astype(np.float32)
        structured_data["red"] = colors[:, 0].astype(np.uint8)
        structured_data["green"] = colors[:, 1].astype(np.uint8)
        structured_data["blue"] = colors[:, 2].astype(np.uint8)

        with open(filepath, "wb") as f:
            f.write(header.encode("ascii"))
            structured_data.tofile(f)
    else:
        header = (
            "ply\n"
            "format ascii 1.0\n"
            f"comment {comment}\n"
            f"element vertex {n_points}\n"
            "property float x\n"
            "property float y\n"
            "property float z\n"
            "property uchar red\n"
            "property uchar green\n"
            "property uchar blue\n"
            "end_header\n"
        )

        with open(filepath, "w", encoding="ascii") as f:
            f.write(header)
            for i in range(n_points):
                f.write(
                    f"{points[i, 0]:.3f} {points[i, 1]:.3f} {points[i, 2]:.3f} "
                    f"{int(colors[i, 0])} {int(colors[i, 1])} {int(colors[i, 2])}\n"
                )

    return n_points
