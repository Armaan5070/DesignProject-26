/**
 * 3D Viewers for Point Cloud and Reconstructed Mesh
 * Powered by Three.js and OrbitControls
 */

class Base3DViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container element #${containerId} not found.`);
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.grid = null;
    this.initialCameraPos = new THREE.Vector3(0, 0, 5);
    this.initialTarget = new THREE.Vector3(0, 0, 0);
    this.animationId = null;
    this.onCameraChange = null;
    this.isSyncing = false;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || 400;
    const height = this.container.clientHeight || 400;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1422);

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 1000);
    this.camera.position.copy(this.initialCameraPos);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.container.appendChild(this.renderer.domElement);

    // Orbit Controls
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;

    // Setup Lighting
    this.setupLighting();

    // Subtle Ground Grid
    this.grid = new THREE.GridHelper(10, 20, 0x00d2ff, 0x1f293d);
    this.grid.position.y = -1;
    this.scene.add(this.grid);

    // Event Listeners
    window.addEventListener("resize", () => this.onResize());
    this.controls.addEventListener("change", () => {
      if (this.onCameraChange && !this.isSyncing) {
        this.onCameraChange(this.camera, this.controls.target);
      }
    });

    // Start Render Loop
    this.animate = this.animate.bind(this);
    this.animate();
  }

  setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(5, 10, 7);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x00d2ff, 0.4);
    fillLight.position.set(-5, -2, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x8b5cf6, 0.35);
    rimLight.position.set(0, -10, 5);
    this.scene.add(rimLight);
  }

  animate() {
    this.animationId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)) * 1.6;

    this.camera.position.set(center.x + cameraZ * 0.7, center.y + cameraZ * 0.5, center.z + cameraZ * 0.9);
    this.camera.lookAt(center);
    this.controls.target.copy(center);

    this.initialCameraPos.copy(this.camera.position);
    this.initialTarget.copy(center);

    // Adjust grid position
    if (this.grid) {
      this.grid.position.y = box.min.y - 0.05 * maxDim;
      this.grid.scale.set(maxDim * 0.6, maxDim * 0.6, maxDim * 0.6);
    }
  }

  resetCamera() {
    this.camera.position.copy(this.initialCameraPos);
    this.controls.target.copy(this.initialTarget);
    this.controls.update();
  }

  syncWith(sourceCamera, sourceTarget) {
    this.isSyncing = true;
    this.camera.position.copy(sourceCamera.position);
    this.camera.quaternion.copy(sourceCamera.quaternion);
    this.camera.zoom = sourceCamera.zoom;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(sourceTarget);
    this.controls.update();
    this.isSyncing = false;
  }
}

/**
 * Viewer A: Dedicated 3D Point Cloud Renderer
 */
class PointCloudViewer extends Base3DViewer {
  constructor(containerId) {
    super(containerId);
    this.pointsObject = null;
    this.originalColors = null;
    this.pointSize = 0.03;
    this.colorMode = "original";
  }

  loadPLY(url, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.PLYLoader();
      loader.load(
        url,
        (geometry) => {
          this.clear();

          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          const hasColors = geometry.hasAttribute("color");
          if (hasColors) {
            this.originalColors = geometry.getAttribute("color").clone();
          } else {
            this.originalColors = null;
          }

          // Create point cloud material
          const material = new THREE.PointsMaterial({
            size: this.pointSize,
            vertexColors: hasColors,
            color: hasColors ? 0xffffff : 0x00d2ff,
            sizeAttenuation: true
          });

          this.pointsObject = new THREE.Points(geometry, material);
          this.scene.add(this.pointsObject);

          this.frameObject(this.pointsObject);
          this.updateColorMode(this.colorMode);

          resolve({
            numPoints: geometry.attributes.position.count,
            hasColors: hasColors
          });
        },
        (xhr) => {
          if (onProgress && xhr.total) {
            onProgress(xhr.loaded / xhr.total);
          }
        },
        (error) => {
          console.error("Error loading point cloud PLY:", error);
          reject(error);
        }
      );
    });
  }

  setPointSize(size) {
    this.pointSize = parseFloat(size);
    if (this.pointsObject && this.pointsObject.material) {
      this.pointsObject.material.size = this.pointSize;
    }
  }

  setColorMode(mode) {
    this.colorMode = mode;
    this.updateColorMode(mode);
  }

  updateColorMode(mode) {
    if (!this.pointsObject) return;
    const geometry = this.pointsObject.geometry;
    const mat = this.pointsObject.material;

    if (mode === "original" && this.originalColors) {
      geometry.setAttribute("color", this.originalColors.clone());
      geometry.attributes.color.needsUpdate = true;
      mat.vertexColors = true;
      mat.color.setHex(0xffffff);
    } else if (mode === "cyan") {
      mat.vertexColors = false;
      mat.color.setHex(0x00d2ff);
    } else if (mode === "elevation") {
      // Compute elevation gradient along Y-axis
      const pos = geometry.attributes.position;
      const count = pos.count;
      const colors = new Float32Array(count * 3);
      let minY = Infinity, maxY = -Infinity;

      for (let i = 0; i < count; i++) {
        const y = pos.getY(i);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      const range = (maxY - minY) || 1.0;
      const colorHelper = new THREE.Color();

      for (let i = 0; i < count; i++) {
        const norm = (pos.getY(i) - minY) / range;
        // Map 0 -> violet/blue, 1 -> cyan/yellow
        colorHelper.setHSL(0.65 - norm * 0.55, 0.9, 0.55);
        colors[i * 3] = colorHelper.r;
        colors[i * 3 + 1] = colorHelper.g;
        colors[i * 3 + 2] = colorHelper.b;
      }

      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.attributes.color.needsUpdate = true;
      mat.vertexColors = true;
      mat.color.setHex(0xffffff);
    }
  }

  clear() {
    if (this.pointsObject) {
      this.scene.remove(this.pointsObject);
      if (this.pointsObject.geometry) this.pointsObject.geometry.dispose();
      if (this.pointsObject.material) this.pointsObject.material.dispose();
      this.pointsObject = null;
    }
    this.originalColors = null;
  }
}

/**
 * Viewer B: Dedicated 3D Reconstructed Mesh Renderer
 */
class MeshViewer extends Base3DViewer {
  constructor(containerId) {
    super(containerId);
    this.meshObject = null;
    this.wireframeMesh = null;
    this.shadingMode = "smooth";
    this.materialPreset = "clay";
    this.hasColors = false;
  }

  loadPLY(url, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.PLYLoader();
      loader.load(
        url,
        (geometry) => {
          this.clear();

          // Ensure vertex normals exist for shading
          geometry.computeVertexNormals();
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();

          this.hasColors = geometry.hasAttribute("color");

          // Create base surface material
          const material = this.createMaterial();
          this.meshObject = new THREE.Mesh(geometry, material);
          this.scene.add(this.meshObject);

          // Create subtle wireframe overlay helper
          const wireframeMat = new THREE.MeshBasicMaterial({
            color: 0x00d2ff,
            wireframe: true,
            transparent: true,
            opacity: 0.25
          });
          this.wireframeMesh = new THREE.Mesh(geometry, wireframeMat);
          this.wireframeMesh.visible = (this.shadingMode === "surface_wireframe");
          this.scene.add(this.wireframeMesh);

          this.frameObject(this.meshObject);
          this.applyShadingAndMaterial();

          const faceCount = geometry.index
            ? geometry.index.count / 3
            : geometry.attributes.position.count / 3;

          resolve({
            numVertices: geometry.attributes.position.count,
            numFaces: Math.round(faceCount)
          });
        },
        (xhr) => {
          if (onProgress && xhr.total) {
            onProgress(xhr.loaded / xhr.total);
          }
        },
        (error) => {
          console.error("Error loading reconstructed mesh PLY:", error);
          reject(error);
        }
      );
    });
  }

  createMaterial() {
    if (this.materialPreset === "normal") {
      return new THREE.MeshNormalMaterial({
        flatShading: (this.shadingMode === "flat")
      });
    }

    const configs = {
      clay: { color: 0xd4d8df, roughness: 0.65, metalness: 0.08 },
      titanium: { color: 0x93a3b8, roughness: 0.25, metalness: 0.8 },
      gold: { color: 0xf59e0b, roughness: 0.3, metalness: 0.75 },
      emerald: { color: 0x10b981, roughness: 0.45, metalness: 0.2 }
    };

    const cfg = configs[this.materialPreset] || configs.clay;

    return new THREE.MeshStandardMaterial({
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      flatShading: (this.shadingMode === "flat"),
      vertexColors: (this.hasColors && this.materialPreset === "clay")
    });
  }

  setShadingMode(mode) {
    this.shadingMode = mode;
    this.applyShadingAndMaterial();
  }

  setMaterialPreset(preset) {
    this.materialPreset = preset;
    this.applyShadingAndMaterial();
  }

  applyShadingAndMaterial() {
    if (!this.meshObject) return;

    const oldMat = this.meshObject.material;
    this.meshObject.material = this.createMaterial();
    if (oldMat) oldMat.dispose();

    if (this.shadingMode === "wireframe") {
      this.meshObject.material.wireframe = true;
      if (this.wireframeMesh) this.wireframeMesh.visible = false;
    } else if (this.shadingMode === "surface_wireframe") {
      this.meshObject.material.wireframe = false;
      if (this.wireframeMesh) this.wireframeMesh.visible = true;
    } else {
      this.meshObject.material.wireframe = false;
      if (this.wireframeMesh) this.wireframeMesh.visible = false;
    }
  }

  clear() {
    if (this.meshObject) {
      this.scene.remove(this.meshObject);
      if (this.meshObject.geometry) this.meshObject.geometry.dispose();
      if (this.meshObject.material) this.meshObject.material.dispose();
      this.meshObject = null;
    }
    if (this.wireframeMesh) {
      this.scene.remove(this.wireframeMesh);
      if (this.wireframeMesh.material) this.wireframeMesh.material.dispose();
      this.wireframeMesh = null;
    }
  }
}
