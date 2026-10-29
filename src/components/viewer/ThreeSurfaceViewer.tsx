import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RotateCcw, Eye, EyeOff, Box } from 'lucide-react';
import type { Finding } from '../../types/inspection';
import { resolveArtifactUrl } from '../../services/api';

interface ThreeSurfaceViewerProps {
  plyUrl?: string;
  findings?: Finding[];
  selectedFindingId?: string | null;
  isDemoModel?: boolean;
}

export const ThreeSurfaceViewer: React.FC<ThreeSurfaceViewerProps> = ({
  plyUrl,
  findings = [],
  selectedFindingId = null,
  isDemoModel = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(Boolean(plyUrl));
  const [error, setError] = useState<string | null>(null);
  const [pointCount, setPointCount] = useState<number | null>(null);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [hasDeviationData, setHasDeviationData] = useState<boolean>(false);
  const [isSampleGeometry, setIsSampleGeometry] = useState<boolean>(false);
  const pointSize = 3.5;

  // Internal Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsObjectRef = useRef<THREE.Points | null>(null);
  const originalColorsRef = useRef<THREE.BufferAttribute | null>(null);
  const highlightGroupRef = useRef<THREE.Group | null>(null);
  const initialCameraPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 800));

  // Resolved URL pointing to backend or local sample
  const resolvedPlyUrl = resolveArtifactUrl(plyUrl);

  useEffect(() => {
    if (!resolvedPlyUrl) return;

    const container = containerRef.current;
    if (!container) return;

    // 1. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8f7f2); // Warm ivory background
    sceneRef.current = scene;

    // 2. Setup Camera
    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(0, 0, 750);
    cameraRef.current = camera;

    // 3. Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Setup OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 1.0;
    controls.panSpeed = 0.8;
    controls.minDistance = 50;
    controls.maxDistance = 3000;
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight1.position.set(200, 300, 400);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xe7ede4, 0.4);
    dirLight2.position.set(-200, -200, 200);
    scene.add(dirLight2);

    // 6. Highlight Group
    const highlightGroup = new THREE.Group();
    scene.add(highlightGroup);
    highlightGroupRef.current = highlightGroup;

    // 7. Ground reference plane / subtle grid
    const gridHelper = new THREE.GridHelper(800, 20, 0xd5d1c5, 0xe8e5dc);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = -15;
    gridHelper.name = 'gridHelper';
    scene.add(gridHelper);

    // 8. Load PLY File
    setLoading(true);
    setError(null);

    const isSample = Boolean(isDemoModel || resolvedPlyUrl.includes('concrete_wall_surface.ply'));
    setIsSampleGeometry(isSample);

    const loader = new PLYLoader();
    loader.load(
      resolvedPlyUrl,
      (geometry) => {
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();

        const box = geometry.boundingBox || new THREE.Box3();
        const size = box.getSize(new THREE.Vector3());

        // Center display coordinates
        geometry.center();

        const numPoints = geometry.attributes.position ? geometry.attributes.position.count : 0;
        setPointCount(numPoints);

        // Check if true deviation scalars exist in the PLY file
        const deviationAttr =
          geometry.attributes.deviation ||
          geometry.attributes.scalar_field ||
          geometry.attributes.intensity;
        const hasTrueScalars = Boolean(deviationAttr);
        setHasDeviationData(hasTrueScalars);

        // Store original vertex colors for toggling deviation heatmap
        if (geometry.attributes.color) {
          originalColorsRef.current = geometry.attributes.color.clone() as THREE.BufferAttribute;
        }

        // Create point cloud material
        const hasColors = Boolean(geometry.attributes.color);
        const material = new THREE.PointsMaterial({
          size: pointSize,
          sizeAttenuation: true,
          vertexColors: hasColors,
          color: hasColors ? 0xffffff : 0x777d73,
          transparent: true,
          opacity: 0.95,
        });

        const points = new THREE.Points(geometry, material);
        pointsObjectRef.current = points;
        scene.add(points);

        // Fit camera to object bounding box
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.5;
        cameraZ = Math.max(cameraZ, 300);

        camera.position.set(0, 0, cameraZ);
        camera.lookAt(0, 0, 0);
        initialCameraPosRef.current.copy(camera.position);

        controls.target.set(0, 0, 0);
        controls.update();

        setLoading(false);
      },
      undefined,
      (err) => {
        console.warn('PLY load error:', err);
        setError('Could not load 3D point cloud file. Please verify the backend artifact URL.');
        setLoading(false);
      }
    );

    // 9. Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 10. Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 11. Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      controls.dispose();
      renderer.dispose();

      if (pointsObjectRef.current) {
        pointsObjectRef.current.geometry.dispose();
        if (Array.isArray(pointsObjectRef.current.material)) {
          pointsObjectRef.current.material.forEach((m) => m.dispose());
        } else {
          pointsObjectRef.current.material.dispose();
        }
      }

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [resolvedPlyUrl, isDemoModel]);

  // Toggle grid visibility
  useEffect(() => {
    if (sceneRef.current) {
      const grid = sceneRef.current.getObjectByName('gridHelper');
      if (grid) grid.visible = showGrid;
    }
  }, [showGrid]);

  // Toggle measured deviation heatmap
  useEffect(() => {
    const points = pointsObjectRef.current;
    if (!points || !points.geometry) return;

    const geometry = points.geometry;
    const pos = geometry.attributes.position;
    if (!pos) return;

    if (showHeatmap) {
      const deviationAttr =
        geometry.attributes.deviation ||
        geometry.attributes.scalar_field ||
        geometry.attributes.intensity;

      if (deviationAttr) {
        // True backend deviation scalar normalization
        const scalarAttr = deviationAttr as THREE.BufferAttribute;
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (let i = 0; i < scalarAttr.count; i++) {
          const v = scalarAttr.getX(i);
          if (v < minVal) minVal = v;
          if (v > maxVal) maxVal = v;
        }
        const range = Math.max(0.001, maxVal - minVal);
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const val = scalarAttr.getX(i);
          const t = Math.min(1.0, Math.max(0.0, (val - minVal) / range));
          // Pale sage to warm terracotta
          colors[i * 3] = 0.58 + t * 0.25;
          colors[i * 3 + 1] = 0.72 - t * 0.22;
          colors[i * 3 + 2] = 0.58 - t * 0.2;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.attributes.color.needsUpdate = true;
      } else if (isSampleGeometry) {
        // Explicitly labelled demo simulation only
        const colors = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const z = pos.getZ(i);
          const deviation = Math.max(0, -z);
          const t = Math.min(1.0, deviation / 4.0);
          colors[i * 3] = 0.58 + t * 0.25;
          colors[i * 3 + 1] = 0.72 - t * 0.22;
          colors[i * 3 + 2] = 0.58 - t * 0.2;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.attributes.color.needsUpdate = true;
      }
    } else if (originalColorsRef.current) {
      geometry.setAttribute('color', originalColorsRef.current.clone());
      geometry.attributes.color.needsUpdate = true;
    }
  }, [showHeatmap, isSampleGeometry]);

  // Render 3D highlight markers when finding is selected
  useEffect(() => {
    const group = highlightGroupRef.current;
    if (!group) return;

    // Clear previous highlights
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    }

    if (!selectedFindingId) return;

    const finding = findings.find((f) => f.id === selectedFindingId);
    if (!finding || !finding.regionCenter3D) return;

    const [fx, fy, fz] = finding.regionCenter3D;

    // Create subtle circular highlight ring in warm terracotta
    const ringGeo = new THREE.RingGeometry(18, 22, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xc98f78,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(fx, fy, fz + 2);
    group.add(ring);

    // Add subtle indicator post
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(fx, fy, fz),
      new THREE.Vector3(fx, fy, fz + 35),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xc98f78 });
    const line = new THREE.Line(lineGeo, lineMat);
    group.add(line);
  }, [selectedFindingId, findings]);

  const resetCamera = () => {
    if (!cameraRef.current || !controlsRef.current) return;
    cameraRef.current.position.copy(initialCameraPosRef.current);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  };

  // If no point cloud URL was provided for this inspection
  if (!plyUrl) {
    return (
      <div className="relative w-full h-[480px] md:h-[540px] rounded-xl overflow-hidden border border-[#E8E5DC] bg-[#F8F7F2] flex flex-col items-center justify-center p-6 text-center space-y-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="w-10 h-10 rounded-full bg-[#F0EFE8] text-[#777D73] flex items-center justify-center">
          <Box className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#343832]">No 3D surface model available</p>
          <p className="text-xs text-[#777D73] max-w-sm leading-relaxed">
            The processing pipeline has not produced a 3D PLY point cloud artifact for this inspection.
          </p>
        </div>
      </div>
    );
  }

  const canShowHeatmap = hasDeviationData || isSampleGeometry;

  return (
    <div className="relative w-full h-[480px] md:h-[540px] rounded-xl overflow-hidden border border-[#E8E5DC] bg-[#F8F7F2] select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Three.js Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#F8F7F2]/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-xs text-[#777D73] z-20">
          <div className="w-6 h-6 border-2 border-[#9BAE98] border-t-transparent rounded-full animate-spin" />
          <p>Loading 3D surface geometry...</p>
        </div>
      )}

      {/* Error Callout */}
      {error && (
        <div className="absolute inset-0 bg-[#F8F7F2]/90 flex flex-col items-center justify-center p-6 text-center gap-2 z-20">
          <p className="text-xs font-medium text-[#8F543E]">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-[#777D73] underline hover:text-[#343832] cursor-pointer"
          >
            Retry loading model
          </button>
        </div>
      )}

      {/* Top Left Geometry Info & Legend */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <div className="px-3 py-1.5 rounded-lg bg-white/90 backdrop-blur-md border border-[#E8E5DC] text-xs text-[#343832] shadow-xs flex items-center gap-2">
          <span className="font-medium">3D Point Cloud</span>
          <span className="text-[#9BA297]">•</span>
          <span className="font-mono text-[#777D73] text-[11px]">
            {pointCount !== null ? `${pointCount.toLocaleString()} points` : 'Loading'}
          </span>
          <span className="text-[#9BA297]">•</span>
          {isSampleGeometry ? (
            <span className="font-mono text-[10px] text-[#777D73] bg-[#F0EFE8] px-1.5 py-0.5 rounded border border-[#E8E5DC]">
              Sample Test Geometry
            </span>
          ) : (
            <span className="font-mono text-[10px] text-[#3F513D] bg-[#E7EDE4] px-1.5 py-0.5 rounded border border-[#D5E0D1]">
              Backend PLY Artifact
            </span>
          )}
        </div>

        {/* Heatmap Legend */}
        {showHeatmap && (
          <div className="px-3 py-2 rounded-lg bg-white/90 backdrop-blur-md border border-[#E8E5DC] text-[11px] text-[#343832] shadow-xs space-y-1.5">
            <div className="font-medium text-[#777D73]">
              {isSampleGeometry ? 'Simulated deviation (Demo)' : 'Measured out-of-plane deviation'}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#777D73]">0 mm</span>
              <div className="w-24 h-2 rounded-full bg-gradient-to-r from-[#9BAE98] via-[#E2B6A6] to-[#C98F78]" />
              <span className="text-[10px] text-[#8F543E] font-medium">4 mm</span>
            </div>
          </div>
        )}
      </div>

      {/* Top Right Controls Toolbar */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 bg-white/90 backdrop-blur-md border border-[#E8E5DC] p-1 rounded-lg shadow-xs">
        {canShowHeatmap ? (
          <button
            type="button"
            onClick={() => setShowHeatmap(!showHeatmap)}
            title={
              isSampleGeometry
                ? showHeatmap
                  ? 'Show natural vertex colors'
                  : 'Show simulated deviation heatmap (Demo)'
                : showHeatmap
                ? 'Show natural vertex colors'
                : 'Show measured surface deviation heatmap'
            }
            className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
              showHeatmap
                ? 'bg-[#E7EDE4] text-[#3F513D]'
                : 'text-[#777D73] hover:text-[#343832] hover:bg-[#F0EFE8]'
            }`}
          >
            {showHeatmap
              ? isSampleGeometry
                ? 'Deviation map on (Demo)'
                : 'Deviation map on'
              : isSampleGeometry
              ? 'Color by deviation (Demo)'
              : 'Color by deviation'}
          </button>
        ) : (
          <span
            title="Deviation heatmap unavailable: backend point cloud does not contain deviation scalars"
            className="px-2.5 py-1 text-xs font-medium text-[#9BA297] bg-[#F0EFE8]/50 rounded cursor-not-allowed select-none"
          >
            Deviation unmeasured
          </span>
        )}

        <span className="w-px h-4 bg-[#E8E5DC]" />

        <button
          type="button"
          onClick={() => setShowGrid(!showGrid)}
          title={showGrid ? 'Hide reference grid' : 'Show reference grid'}
          className={`p-1.5 rounded text-[#777D73] hover:text-[#343832] hover:bg-[#F0EFE8] transition-colors cursor-pointer ${
            showGrid ? 'text-[#343832]' : ''
          }`}
        >
          {showGrid ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={resetCamera}
          title="Reset camera view"
          className="p-1.5 rounded text-[#777D73] hover:text-[#343832] hover:bg-[#F0EFE8] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom Hint */}
      <div className="absolute bottom-3 left-4 z-10 text-[11px] text-[#777D73] bg-white/80 px-2 py-0.5 rounded border border-[#E8E5DC]/80 backdrop-blur-xs">
        Rotate: Left click + drag • Pan: Right click + drag • Zoom: Scroll
      </div>
    </div>
  );
};
