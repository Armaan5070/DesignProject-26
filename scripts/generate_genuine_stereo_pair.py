"""
Generates a calibrated synthetic concrete wall stereo pair with realistic multi-scale aggregate texture,
epipolar alignment, and accurate horizontal disparity.

Matching calibration parameters:
- Resolution: 1280 x 720 (scaled for fast interactive upload and processing)
- Baseline: 120.5 mm
- Focal length: 900.0 px
- Wall distance: 1500 mm (Disparity ~ 72 px)
- Surface variations: ~10-20 mm depth relief
"""

from pathlib import Path
import cv2
import numpy as np

def generate_calibrated_pair():
    w, h = 1280, 720
    baseline_mm = 120.5
    focal_px = 900.0
    nominal_depth_mm = 1600.0

    # Disparity = (f * B) / Z
    nominal_disp = (focal_px * baseline_mm) / nominal_depth_mm  # ~68 px

    np.random.seed(101)

    # 1. Generate multi-scale concrete texture
    # High frequency aggregate noise
    noise_fine = np.random.normal(160, 22, (h, w)).astype(np.float32)
    noise_fine = cv2.GaussianBlur(noise_fine, (3, 3), 0.8)

    # Medium frequency cement paste variations
    noise_med = cv2.resize(np.random.normal(0, 18, (h // 4, w // 4)).astype(np.float32), (w, h))
    noise_med = cv2.GaussianBlur(noise_med, (15, 15), 5.0)

    # Coarse surface lighting gradient
    y_grad = np.linspace(0.9, 1.1, h)[:, None]
    x_grad = np.linspace(0.95, 1.05, w)[None, :]

    base_intensity = (noise_fine + noise_med) * y_grad * x_grad

    # Concrete color tint: subtle warm gray (BGR: [165, 175, 180])
    b = np.clip(base_intensity * 0.92, 0, 255).astype(np.uint8)
    g = np.clip(base_intensity * 0.97, 0, 255).astype(np.uint8)
    r = np.clip(base_intensity * 1.00, 0, 255).astype(np.uint8)
    left_bgr = np.stack([b, g, r], axis=2)

    # Add dark aggregate stones and a vertical surface indentation / fissure
    num_stones = 140
    for _ in range(num_stones):
        sx = np.random.randint(40, w - 40)
        sy = np.random.randint(40, h - 40)
        radius = np.random.randint(3, 10)
        stone_color = (int(np.random.randint(70, 110)), int(np.random.randint(75, 115)), int(np.random.randint(80, 120)))
        cv2.circle(left_bgr, (sx, sy), radius, stone_color, -1)
        cv2.circle(left_bgr, (sx, sy), radius, (50, 50, 50), 1)

    # Add surface fissure in the center
    fissure_pts = []
    curr_x = w // 2 - 20
    for y in range(120, h - 120, 20):
        curr_x += np.random.randint(-4, 5)
        fissure_pts.append([curr_x, y])
    fissure_arr = np.array(fissure_pts, dtype=np.int32)
    cv2.polylines(left_bgr, [fissure_arr], False, (70, 75, 80), 3)

    # 2. Build continuous depth map: plane with slight out-of-plane relief
    # Plane Z(x, y) = 1600 - 0.05 * x
    x_grid, y_grid = np.meshgrid(np.arange(w), np.arange(h))
    depth_map = 1600.0 - 0.04 * (x_grid - w / 2) + 0.02 * (y_grid - h / 2)

    # Center fissure has 15 mm recession
    for pt in fissure_pts:
        cv2.circle(depth_map, (pt[0], pt[1]), 18, 1615.0, -1)
    depth_map = cv2.GaussianBlur(depth_map, (11, 11), 3.0)

    # Disparity map: d(x, y) = (f * B) / Z(x, y)
    disparity_ground_truth = (focal_px * baseline_mm) / depth_map

    # 3. Warping left view to right view according to horizontal disparity:
    # Right image coordinates: x_right = x_left - disparity
    # Using cv2.remap (backward mapping): left_x = right_x + disparity
    map_x = (x_grid + disparity_ground_truth).astype(np.float32)
    map_y = y_grid.astype(np.float32)

    right_bgr = cv2.remap(left_bgr, map_x, map_y, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # Add slight camera noise to right view
    noise_cam = np.random.normal(0, 2, right_bgr.shape).astype(np.float32)
    right_bgr = np.clip(right_bgr.astype(np.float32) + noise_cam, 0, 255).astype(np.uint8)

    # Save to public/samples
    output_dir = Path(__file__).resolve().parent.parent / "public" / "samples"
    output_dir.mkdir(parents=True, exist_ok=True)

    cv2.imwrite(str(output_dir / "stereo_left.png"), left_bgr)
    cv2.imwrite(str(output_dir / "stereo_right.png"), right_bgr)

    # Also update public/samples/camera_calibration_sample.json with matching parameters
    calib_json = (
        '{\n'
        '  "camera_model": "pinhole_stereo",\n'
        f'  "baseline_distance_mm": {baseline_mm},\n'
        f'  "focal_length_px": {focal_px},\n'
        f'  "image_width": {w},\n'
        f'  "image_height": {h},\n'
        f'  "principal_point": [{w / 2.0}, {h / 2.0}],\n'
        '  "reprojection_error_px": 0.12,\n'
        '  "notes": "Epipolar calibrated stereo rig for concrete surface inspection."\n'
        '}\n'
    )
    with open(output_dir / "camera_calibration_sample.json", "w") as f:
        f.write(calib_json)

    print(f"Generated stereo pair at {w}x{h}: stereo_left.png, stereo_right.png, and updated calibration sample.")

if __name__ == "__main__":
    generate_calibrated_pair()
