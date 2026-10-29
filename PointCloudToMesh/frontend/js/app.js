/**
 * Application Workflow and UI Controller
 * Manages API communication, dual 3D viewers, and parameter bindings.
 */

document.addEventListener("DOMContentLoaded", () => {
  // Application State
  const state = {
    currentFileId: null,
    currentFileName: null,
    currentMeshId: null,
    isReconstructing: false,
    syncCameras: false
  };

  // Initialize Viewers
  const viewerA = new PointCloudViewer("canvas-container-a");
  const viewerB = new MeshViewer("canvas-container-b");

  // DOM Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("file-input");
  const btnReconstruct = document.getElementById("btn-reconstruct");
  const btnExport = document.getElementById("btn-export");
  const syncToggle = document.getElementById("sync-views-toggle");

  const sliderDepth = document.getElementById("slider-depth");
  const valDepth = document.getElementById("val-depth");
  const sliderTrim = document.getElementById("slider-trim");
  const valTrim = document.getElementById("val-trim");
  const sliderKnn = document.getElementById("slider-knn");
  const valKnn = document.getElementById("val-knn");

  // Overlay & Stats Elements
  const emptyStateA = document.getElementById("empty-state-a");
  const emptyStateB = document.getElementById("empty-state-b");
  const loadingOverlayB = document.getElementById("loading-overlay-b");
  const loadingTextB = document.getElementById("loading-text-b");

  const statsPoints = document.getElementById("stats-points");
  const statsColors = document.getElementById("stats-colors");
  const statsNormals = document.getElementById("stats-normals");

  const statsVertices = document.getElementById("stats-vertices");
  const statsFaces = document.getElementById("stats-faces");
  const statsTime = document.getElementById("stats-time");

  const quickStatsText = document.getElementById("quick-stats-text");

  // Floating Toolbar Elements
  const sliderPointSize = document.getElementById("slider-point-size");
  const selectPcColor = document.getElementById("select-pc-color");
  const btnResetCamA = document.getElementById("btn-reset-cam-a");
  const btnFullscreenA = document.getElementById("btn-fullscreen-a");

  const selectMeshShading = document.getElementById("select-mesh-shading");
  const selectMeshMaterial = document.getElementById("select-mesh-material");
  const btnResetCamB = document.getElementById("btn-reset-cam-b");
  const btnFullscreenB = document.getElementById("btn-fullscreen-b");

  // ========================================================================
  // Camera Synchronization
  // ========================================================================
  syncToggle.addEventListener("change", (e) => {
    state.syncCameras = e.target.checked;
    if (state.syncCameras) {
      viewerB.syncWith(viewerA.camera, viewerA.controls.target);
      showToast("Views synchronized. Camera movements linked.", "info");
    } else {
      showToast("Views unlinked. Independent camera control.", "info");
    }
  });

  viewerA.onCameraChange = (camera, target) => {
    if (state.syncCameras) {
      viewerB.syncWith(camera, target);
    }
  };

  viewerB.onCameraChange = (camera, target) => {
    if (state.syncCameras) {
      viewerA.syncWith(camera, target);
    }
  };

  // ========================================================================
  // Parameter Sliders
  // ========================================================================
  sliderDepth.addEventListener("input", (e) => {
    valDepth.textContent = e.target.value;
  });

  sliderTrim.addEventListener("input", (e) => {
    valTrim.textContent = `${e.target.value}%`;
  });

  sliderKnn.addEventListener("input", (e) => {
    valKnn.textContent = e.target.value;
  });

  // Viewer A Toolbars
  sliderPointSize.addEventListener("input", (e) => {
    viewerA.setPointSize(parseFloat(e.target.value));
  });

  selectPcColor.addEventListener("change", (e) => {
    viewerA.setColorMode(e.target.value);
  });

  btnResetCamA.addEventListener("click", () => viewerA.resetCamera());
  btnFullscreenA.addEventListener("click", () => toggleFullscreen("panel-a"));

  // Viewer B Toolbars
  selectMeshShading.addEventListener("change", (e) => {
    viewerB.setShadingMode(e.target.value);
  });

  selectMeshMaterial.addEventListener("change", (e) => {
    viewerB.setMaterialPreset(e.target.value);
  });

  btnResetCamB.addEventListener("click", () => viewerB.resetCamera());
  btnFullscreenB.addEventListener("click", () => toggleFullscreen("panel-b"));

  function toggleFullscreen(panelId) {
    const elem = document.getElementById(panelId);
    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  }

  // ========================================================================
  // File Upload Handlers
  // ========================================================================
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  ["dragleave", "dragend"].forEach(type => {
    dropzone.addEventListener(type, () => dropzone.classList.remove("dragover"));
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function resetDropzone() {
    dropzone.querySelector(".primary").textContent = "Drop PLY Point Cloud Here";
    dropzone.querySelector(".subtext").textContent = "Click to browse (.ply files up to 1 GB)";
  }

  async function handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith(".ply")) {
      showToast("Invalid file: Only .ply point cloud files are accepted.", "error");
      return;
    }

    const maxSizeBytes = 1024 * 1024 * 1024; // 1 GB
    if (file.size > maxSizeBytes) {
      showToast(`File exceeds maximum size of 1 GB (${(file.size / (1024 * 1024 * 1024)).toFixed(2)} GB).`, "error");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    showToast(`Uploading ${file.name} (${fileSizeMB} MB)...`, "info");
    dropzone.querySelector(".primary").textContent = `Uploading: 0% (0 / ${fileSizeMB} MB)`;
    dropzone.querySelector(".subtext").textContent = "Streaming to backend...";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.min(100, Math.round((e.loaded / e.total) * 100));
        const loadedMB = (e.loaded / (1024 * 1024)).toFixed(1);
        const totalMB = (e.total / (1024 * 1024)).toFixed(1);
        dropzone.querySelector(".primary").textContent = `Uploading: ${percent}% (${loadedMB} / ${totalMB} MB)`;
        if (percent === 100) {
          dropzone.querySelector(".subtext").textContent = "Validating point cloud header & bounds...";
        }
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onPointCloudLoaded(data);
        } else {
          throw new Error(data.detail || "Upload validation failed.");
        }
      } catch (err) {
        console.error(err);
        showToast(err.message, "error");
        resetDropzone();
      }
    };

    xhr.onerror = () => {
      showToast("Network error occurred during file upload.", "error");
      resetDropzone();
    };

    xhr.send(formData);
  }

  // ========================================================================
  // Sample Models Handlers
  // ========================================================================
  document.querySelectorAll(".btn-sample").forEach(btn => {
    btn.addEventListener("click", async () => {
      const sampleId = btn.dataset.sample;
      showToast(`Loading sample: ${sampleId}...`, "info");

      try {
        const res = await fetch(`/api/samples/${sampleId}/load`, { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Failed to load sample.");

        onPointCloudLoaded(data);
      } catch (err) {
        console.error(err);
        showToast(err.message, "error");
      }
    });
  });

  // ========================================================================
  // Point Cloud Uploaded Callback
  // ========================================================================
  async function onPointCloudLoaded(data) {
    state.currentFileId = data.file_id;
    state.currentFileName = data.filename;
    state.currentMeshId = null;

    dropzone.querySelector(".primary").textContent = data.filename;
    if (data.is_display_optimized) {
      dropzone.querySelector(".subtext").textContent = `${data.num_points.toLocaleString()} pts (Viewer: ${data.display_points.toLocaleString()})`;
      statsPoints.innerHTML = `${data.num_points.toLocaleString()} <span style="font-size:0.65rem;color:var(--accent-cyan);">(Display: ${data.display_points.toLocaleString()})</span>`;
    } else {
      dropzone.querySelector(".subtext").textContent = `${data.num_points.toLocaleString()} points`;
      statsPoints.textContent = data.num_points.toLocaleString();
    }

    // Update Stats Display in Viewer A
    statsColors.textContent = data.has_colors ? "Yes" : "No";
    statsNormals.textContent = data.has_normals ? "Yes" : "No (will estimate)";

    quickStatsText.textContent = `Point Cloud: ${data.num_points.toLocaleString()} pts | Ready`;

    // Load into Viewer A
    emptyStateA.style.display = "none";
    try {
      await viewerA.loadPLY(data.pointcloud_url);
      if (data.is_display_optimized) {
        showToast(`Loaded ${data.num_points.toLocaleString()} points (WebGL display-optimized for smooth interaction).`, "success");
      } else {
        showToast(`Loaded ${data.num_points.toLocaleString()} points into Viewer A.`, "success");
      }
    } catch (err) {
      showToast("Error rendering point cloud in Three.js.", "error");
    }

    // Enable Reconstruct Button & Reset Viewer B
    btnReconstruct.disabled = false;
    btnExport.disabled = true;
    emptyStateB.style.display = "flex";
    viewerB.clear();
    statsVertices.textContent = "-";
    statsFaces.textContent = "-";
    statsTime.textContent = "-";
  }

  // ========================================================================
  // Poisson Surface Reconstruction Execution
  // ========================================================================
  btnReconstruct.addEventListener("click", async () => {
    if (!state.currentFileId || state.isReconstructing) return;

    state.isReconstructing = true;
    btnReconstruct.disabled = true;
    btnExport.disabled = true;

    // Show loading overlay
    loadingOverlayB.classList.add("active");
    loadingTextB.textContent = "Computing Oriented Normals & Octree...";
    emptyStateB.style.display = "none";

    const payload = {
      file_id: state.currentFileId,
      depth: parseInt(sliderDepth.value, 10),
      density_trim: parseFloat(sliderTrim.value),
      k_neighbors: parseInt(sliderKnn.value, 10),
      scale: 1.1,
      linear_fit: false
    };

    try {
      // Step feedback animation
      const timer = setTimeout(() => {
        if (state.isReconstructing) {
          loadingTextB.textContent = "Solving Poisson Equation & Extracting Iso-surface...";
        }
      }, 1500);

      const res = await fetch("/api/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      clearTimeout(timer);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Surface reconstruction failed.");
      }

      state.currentMeshId = data.mesh_id;
      loadingTextB.textContent = "Rendering Reconstructed 3D Mesh...";

      // Load resulting mesh into Viewer B
      const meshStats = await viewerB.loadPLY(data.mesh_url);

      // Update Statistics
      statsVertices.textContent = data.stats.num_vertices.toLocaleString();
      statsFaces.textContent = data.stats.num_triangles.toLocaleString();
      statsTime.textContent = `${data.stats.processing_time_sec}s`;

      quickStatsText.textContent = `Reconstructed Mesh: ${data.stats.num_triangles.toLocaleString()} triangles in ${data.stats.processing_time_sec}s`;

      btnExport.disabled = false;
      showToast(`Reconstruction complete! Generated ${data.stats.num_triangles.toLocaleString()} triangles.`, "success");

      // Auto-sync cameras initially if sync is enabled
      if (state.syncCameras) {
        viewerB.syncWith(viewerA.camera, viewerA.controls.target);
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
      emptyStateB.style.display = "flex";
    } finally {
      state.isReconstructing = false;
      btnReconstruct.disabled = false;
      loadingOverlayB.classList.remove("active");
    }
  });

  // ========================================================================
  // Mesh Export Handler
  // ========================================================================
  btnExport.addEventListener("click", () => {
    if (!state.currentMeshId) {
      showToast("No reconstructed mesh available for download.", "error");
      return;
    }

    const baseName = (state.currentFileName || "mesh").replace(/\.ply$/i, "");
    const downloadUrl = `/api/mesh/${state.currentMeshId}/download?name=${encodeURIComponent(baseName)}_reconstructed.ply`;

    // Trigger download via anchor element
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = `${baseName}_reconstructed.ply`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    showToast("Downloading reconstructed PLY mesh...", "success");
  });

  // ========================================================================
  // Toast Notifications
  // ========================================================================
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;

    let iconSvg = "";
    if (type === "success") {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="#10b981" fill="none" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`;
    } else if (type === "error") {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="#f43f5e" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="#00d2ff" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div class="toast-message">${escapeHtml(message)}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(50%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Health check on startup
  fetch("/api/health")
    .then(res => res.json())
    .then(data => {
      const badge = document.getElementById("header-status-badge");
      if (data.open3d_available) {
        badge.innerHTML = `<span class="status-indicator"></span> Backend Ready (Open3D)`;
      } else {
        badge.innerHTML = `<span class="status-indicator" style="background:#f59e0b;box-shadow:0 0 8px #f59e0b"></span> Backend Connected`;
      }
    })
    .catch(() => {
      const badge = document.getElementById("header-status-badge");
      badge.innerHTML = `<span class="status-indicator" style="background:#f43f5e;box-shadow:0 0 8px #f43f5e"></span> Backend Disconnected`;
    });
});
