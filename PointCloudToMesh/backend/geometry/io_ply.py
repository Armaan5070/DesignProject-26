"""
PLY File I/O and Validation Module
Extracts point cloud coordinates, attributes, bounding boxes, and validates integrity.
"""
from pathlib import Path
from typing import Dict, Any, Tuple, Optional
import numpy as np

# Try importing Open3D; fallbacks provided if not yet installed
try:
    import open3d as o3d
    HAS_OPEN3D = True
except ImportError:
    o3d = None
    HAS_OPEN3D = False

try:
    from plyfile import PlyData
    HAS_PLYFILE = True
except ImportError:
    PlyData = None
    HAS_PLYFILE = False


def validate_ply_header(file_path: Path) -> Dict[str, Any]:
    """
    Parses and validates the header of a PLY file.
    Returns validation status, vertex count, and available attributes.
    """
    if not file_path.exists():
        return {"is_valid": False, "error": f"File does not exist: {file_path.name}"}

    file_size = file_path.stat().st_size
    if file_size < 16:
        return {"is_valid": False, "error": "File is empty or too small to be a valid PLY file."}

    try:
        with open(file_path, "rb") as f:
            # Read first line
            first_line = f.readline().decode("latin1", errors="ignore").strip()
            if first_line.lower() != "ply":
                return {
                    "is_valid": False,
                    "error": f"Invalid header: File must start with 'ply' magic identifier, got '{first_line[:20]}'"
                }

            header_lines = [first_line]
            in_header = True
            format_line = None
            vertex_count = 0
            current_element = None
            properties = {}

            # Read up to 200 lines of header
            line_count = 0
            while in_header and line_count < 200:
                line_count += 1
                raw_line = f.readline()
                if not raw_line:
                    break
                line = raw_line.decode("latin1", errors="ignore").strip()
                header_lines.append(line)

                if line == "end_header":
                    in_header = False
                    break

                parts = line.split()
                if not parts:
                    continue

                if parts[0] == "format" and len(parts) >= 2:
                    format_line = parts[1]
                elif parts[0] == "element" and len(parts) >= 3:
                    current_element = parts[1]
                    properties[current_element] = []
                    if current_element == "vertex":
                        try:
                            vertex_count = int(parts[2])
                        except ValueError:
                            vertex_count = 0
                elif parts[0] == "property" and len(parts) >= 3 and current_element:
                    prop_name = parts[-1]
                    properties[current_element].append(prop_name)

            if in_header:
                return {
                    "is_valid": False,
                    "error": "Incomplete PLY header: 'end_header' delimiter not found within expected length."
                }

            if not format_line:
                return {"is_valid": False, "error": "Missing format specification in PLY header."}

            if "vertex" not in properties or vertex_count <= 0:
                return {
                    "is_valid": False,
                    "error": f"Point cloud contains no vertices (vertex count: {vertex_count})."
                }

            vertex_props = properties.get("vertex", [])
            has_x = "x" in vertex_props
            has_y = "y" in vertex_props
            has_z = "z" in vertex_props

            if not (has_x and has_y and has_z):
                return {
                    "is_valid": False,
                    "error": f"Missing required 3D coordinate properties (x, y, z) in vertex element: found {vertex_props}"
                }

            # Check for colors and normals
            color_props = {"red", "green", "blue", "diffuse_red", "diffuse_green", "diffuse_blue", "r", "g", "b"}
            has_colors = len(color_props.intersection(vertex_props)) >= 3

            normal_props = {"nx", "ny", "nz", "normal_x", "normal_y", "normal_z"}
            has_normals = len(normal_props.intersection(vertex_props)) >= 3

            return {
                "is_valid": True,
                "format": format_line,
                "num_points": vertex_count,
                "has_colors": has_colors,
                "has_normals": has_normals,
                "vertex_properties": vertex_props,
                "error": None
            }

    except Exception as e:
        return {"is_valid": False, "error": f"Error parsing PLY file: {str(e)}"}


def inspect_point_cloud(file_path: Path) -> Dict[str, Any]:
    """
    Extracts deep point cloud metadata including bounding box, centroid,
    and verified numerical coordinates.
    """
    header_info = validate_ply_header(file_path)
    if not header_info["is_valid"]:
        return header_info

    # Use Open3D if available
    if HAS_OPEN3D:
        try:
            pcd = o3d.io.read_point_cloud(str(file_path))
            num_points = len(pcd.points)

            if num_points == 0:
                return {
                    "is_valid": False,
                    "error": "Open3D loaded zero points from the PLY file."
                }

            # Direct C++ bounding calculations avoid allocating gigabytes of NumPy array copies
            min_bound = pcd.get_min_bound().tolist()
            max_bound = pcd.get_max_bound().tolist()
            center = pcd.get_center().tolist()
            dimensions = (pcd.get_max_bound() - pcd.get_min_bound()).tolist()

            has_colors = pcd.has_colors()
            has_normals = pcd.has_normals()

            return {
                "is_valid": True,
                "num_points": int(num_points),
                "has_colors": bool(has_colors),
                "has_normals": bool(has_normals),
                "bounds": {
                    "min": [round(v, 4) for v in min_bound],
                    "max": [round(v, 4) for v in max_bound],
                    "center": [round(v, 4) for v in center],
                    "dimensions": [round(v, 4) for v in dimensions]
                },
                "num_invalid_points_filtered": 0,
                "error": None
            }
        except Exception as e:
            return {"is_valid": False, "error": f"Open3D failed to parse point cloud: {str(e)}"}

    # Fallback to PlyData if Open3D not installed
    elif HAS_PLYFILE:
        try:
            plydata = PlyData.read(str(file_path))
            v = plydata["vertex"]
            x = np.array(v["x"], dtype=np.float64)
            y = np.array(v["y"], dtype=np.float64)
            z = np.array(v["z"], dtype=np.float64)
            pts = np.column_stack([x, y, z])

            min_bound = pts.min(axis=0).tolist()
            max_bound = pts.max(axis=0).tolist()
            center = pts.mean(axis=0).tolist()
            dimensions = (pts.max(axis=0) - pts.min(axis=0)).tolist()

            return {
                "is_valid": True,
                "num_points": int(len(pts)),
                "has_colors": header_info["has_colors"],
                "has_normals": header_info["has_normals"],
                "bounds": {
                    "min": [round(v, 4) for v in min_bound],
                    "max": [round(v, 4) for v in max_bound],
                    "center": [round(v, 4) for v in center],
                    "dimensions": [round(v, 4) for v in dimensions]
                },
                "error": None
            }
        except Exception as e:
            return {"is_valid": False, "error": f"Failed to read PLY data: {str(e)}"}

    # Basic header fallback
    return {
        "is_valid": True,
        "num_points": header_info["num_points"],
        "has_colors": header_info["has_colors"],
        "has_normals": header_info["has_normals"],
        "bounds": None,
        "error": None
    }


def create_display_point_cloud(
    input_path: Path,
    output_display_path: Path,
    max_points: int = 2_500_000
) -> Tuple[bool, int]:
    """
    Creates an adaptive, display-optimized PLY point cloud for browser WebGL rendering
    when point clouds are huge (up to 1GB).
    Preserves 100% full-precision point cloud for backend Poisson reconstruction.
    """
    if not HAS_OPEN3D:
        return False, 0

    try:
        pcd = o3d.io.read_point_cloud(str(input_path))
        num_pts = len(pcd.points)
        if num_pts <= max_points:
            return False, num_pts

        step = int(np.ceil(num_pts / max_points))
        display_pcd = pcd.uniform_down_sample(step)
        output_display_path.parent.mkdir(parents=True, exist_ok=True)
        o3d.io.write_point_cloud(
            str(output_display_path),
            display_pcd,
            write_ascii=False,
            compressed=False
        )
        return True, len(display_pcd.points)
    except Exception as e:
        print(f"Warning: Display downsampling failed: {e}")
        return False, 0

