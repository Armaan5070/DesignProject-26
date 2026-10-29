"""
Point Cloud Normal Estimation and Orientation Module
Computes robust oriented normals required for Poisson Surface Reconstruction.
"""
from typing import Tuple, Optional, Any
import numpy as np

try:
    import open3d as o3d
    HAS_OPEN3D = True
except ImportError:
    o3d = None
    HAS_OPEN3D = False

try:
    from scipy.spatial import cKDTree
    HAS_SCIPY = True
except ImportError:
    cKDTree = None
    HAS_SCIPY = False


def ensure_oriented_normals(pcd, k_neighbors: int = 30) -> Tuple[Any, bool]:
    """
    Ensures that an Open3D point cloud has valid, unit-length, oriented normals.
    If normals are missing, computes them via KDTree covariance analysis and
    orients them using consistent tangent plane propagation.
    """
    if not HAS_OPEN3D:
        raise RuntimeError("Open3D is required for normal estimation.")

    pcd_has_normals = pcd.has_normals()
    normals = np.asarray(pcd.normals) if pcd_has_normals else np.array([])

    needs_estimation = (
        not pcd_has_normals
        or len(normals) != len(pcd.points)
        or np.all(np.linalg.norm(normals, axis=1) < 1e-6)
    )

    if needs_estimation:
        # Estimate normals using k-nearest neighbors
        pcd.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamKNN(knn=max(10, k_neighbors))
        )

        # Orient normals consistently using tangent plane propagation
        try:
            pcd.orient_normals_consistent_tangent_plane(k=max(10, k_neighbors))
        except Exception:
            # Fallback orientation towards point cloud center/outward
            center = pcd.get_center()
            pcd.orient_normals_towards_camera_location(center + np.array([0, 0, 1000.0]))

        was_computed = True
    else:
        # Ensure existing normals are normalized to unit vectors
        pcd.normalize_normals()
        was_computed = False

    return pcd, was_computed


def estimate_normals_numpy(points: np.ndarray, k_neighbors: int = 30) -> np.ndarray:
    """
    Fallback PCA normal estimation using pure NumPy and SciPy cKDTree.
    Computes covariance matrix of local neighborhoods and takes the smallest eigenvector.
    """
    if not HAS_SCIPY:
        raise RuntimeError("SciPy is required for numpy-based normal estimation fallback.")

    num_points = len(points)
    k = min(k_neighbors, num_points - 1)
    if k < 3:
        return np.tile([0.0, 0.0, 1.0], (num_points, 1))

    tree = cKDTree(points)
    _, idxs = tree.query(points, k=k)

    normals = np.zeros((num_points, 3), dtype=np.float64)
    centroid = np.mean(points, axis=0)

    for i in range(num_points):
        neighbors = points[idxs[i]]
        cov = np.cov(neighbors, rowvar=False)
        eigenvalues, eigenvectors = np.linalg.eigh(cov)
        normal = eigenvectors[:, 0]  # Smallest eigenvalue corresponds to normal

        # Orient outward from center
        vec_to_center = points[i] - centroid
        if np.dot(normal, vec_to_center) < 0:
            normal = -normal

        normals[i] = normal / (np.linalg.norm(normal) + 1e-12)

    return normals
