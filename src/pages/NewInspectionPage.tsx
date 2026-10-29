import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Check, AlertCircle, FileCode, Sliders, ChevronDown, ChevronUp, Server, PlayCircle } from 'lucide-react';
import { Button } from '../components/common/Button';
import { createInspection, getExecutionMode, getBackendBaseUrl } from '../services/api';
import type { ExecutionMode } from '../types/inspection';

interface ImageFileState {
  file: File;
  previewUrl: string;
  name: string;
  sizeBytes: number;
  width: number;
  height: number;
  dimensions?: string;
}

interface ParsedCalibrationState {
  file: File;
  name: string;
  baselineDistanceMm?: number;
  focalLengthPx?: number;
  imageWidth?: number;
  imageHeight?: number;
  status: 'valid' | 'partial' | 'invalid';
  notes: string;
}

export const NewInspectionPage: React.FC = () => {
  const navigate = useNavigate();

  // Execution Mode
  const [mode, setMode] = useState<ExecutionMode>(getExecutionMode());
  const backendBaseUrl = getBackendBaseUrl();

  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ExecutionMode>;
      if (customEvent.detail) setMode(customEvent.detail);
      else setMode(getExecutionMode());
    };
    window.addEventListener('surface-mode-changed', handleModeChange);
    return () => window.removeEventListener('surface-mode-changed', handleModeChange);
  }, []);

  // Form Inputs
  const [inspectionName, setInspectionName] = useState('');
  const [surfaceType, setSurfaceType] = useState('Vertical concrete surface');
  const [reconstructionMethod, setReconstructionMethod] = useState('Automatic surface reconstruction');

  // Files
  const [leftImage, setLeftImage] = useState<ImageFileState | null>(null);
  const [rightImage, setRightImage] = useState<ImageFileState | null>(null);
  const [calibration, setCalibration] = useState<ParsedCalibrationState | null>(null);

  // UI States
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Hidden File Inputs
  const leftInputRef = useRef<HTMLInputElement>(null);
  const rightInputRef = useRef<HTMLInputElement>(null);
  const calibInputRef = useRef<HTMLInputElement>(null);

  // Helper to read and extract image dimensions
  const processImageFile = (file: File, side: 'left' | 'right') => {
    if (!file.type.startsWith('image/')) {
      setFormError(`The selected file for the ${side} view is not a supported image format.`);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const state: ImageFileState = {
        file,
        previewUrl,
        name: file.name,
        sizeBytes: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
      };
      if (side === 'left') setLeftImage(state);
      else setRightImage(state);
      setFormError(null);
    };
    img.src = previewUrl;
  };

  // Helper to parse camera calibration JSON
  const processCalibrationFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      let baseline: number | undefined;
      let focal: number | undefined;
      let width: number | undefined;
      let height: number | undefined;

      // Check common parameter keys
      if (typeof json.baseline_distance_mm === 'number') baseline = json.baseline_distance_mm;
      else if (typeof json.baseline === 'number') baseline = json.baseline;

      if (typeof json.focal_length_px === 'number') focal = json.focal_length_px;
      else if (typeof json.focal_length === 'number') focal = json.focal_length;
      else if (Array.isArray(json.camera_matrix) && json.camera_matrix[0]?.[0]) focal = json.camera_matrix[0][0];

      if (typeof json.image_width === 'number') width = json.image_width;
      if (typeof json.image_height === 'number') height = json.image_height;

      let status: 'valid' | 'partial' | 'invalid' = 'valid';
      let notes = 'Calibrated baseline and optical parameters successfully parsed.';

      if (baseline === undefined && focal === undefined) {
        status = 'partial';
        notes = 'File loaded, but standard baseline distance or focal length keys were not found. Default geometry scale will be approximated.';
      } else if (baseline === undefined) {
        status = 'partial';
        notes = 'Focal length detected, but stereo baseline distance was not found. Measurements will be displayed in relative units.';
      }

      setCalibration({
        file,
        name: file.name,
        baselineDistanceMm: baseline,
        focalLengthPx: focal,
        imageWidth: width,
        imageHeight: height,
        status,
        notes,
      });
      setFormError(null);
    } catch {
      setCalibration({
        file,
        name: file.name,
        status: 'invalid',
        notes: 'Unable to parse file. Please ensure it is a valid JSON document containing camera calibration parameters.',
      });
    }
  };

  // Quick preset to test with genuine sample stereo files
  const loadSampleData = async () => {
    try {
      // Fetch sample calibration
      const resCalib = await fetch('/samples/camera_calibration_sample.json');
      const calibBlob = await resCalib.blob();
      const calibFile = new File([calibBlob], 'camera_calibration_sample.json', { type: 'application/json' });
      await processCalibrationFile(calibFile);

      // Fetch genuine left stereo image
      const resLeft = await fetch('/samples/stereo_left.png');
      const blobLeft = await resLeft.blob();
      const fileLeft = new File([blobLeft], 'stereo_left.png', { type: 'image/png' });
      processImageFile(fileLeft, 'left');

      // Fetch genuine right stereo image
      const resRight = await fetch('/samples/stereo_right.png');
      const blobRight = await resRight.blob();
      const fileRight = new File([blobRight], 'stereo_right.png', { type: 'image/png' });
      processImageFile(fileRight, 'right');

      setInspectionName('Concrete Retaining Wall — Viaduct Pier');
    } catch (e) {
      console.warn('Sample load failed:', e);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!leftImage || !rightImage) {
      setFormError('Both the left and right stereo images are required to reconstruct a surface.');
      return;
    }

    if (leftImage.width !== rightImage.width || leftImage.height !== rightImage.height) {
      setFormError(
        `Image dimension mismatch: Left is ${leftImage.width}×${leftImage.height} px, but Right is ${rightImage.width}×${rightImage.height} px. Stereo pairs must share identical resolution.`
      );
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const created = await createInspection(
        {
          name: inspectionName || 'Inspection of concrete surface',
          surfaceType,
          reconstructionMethod,
          leftImageFile: leftImage.file,
          rightImageFile: rightImage.file,
          calibrationFile: calibration?.file || null,
        },
        calibration
          ? {
              baselineDistanceMm: calibration.baselineDistanceMm,
              focalLengthPx: calibration.focalLengthPx,
              notes: calibration.notes,
            }
          : undefined
      );

      // Navigate smoothly to the inspection progress page
      navigate(`/inspections/${created.id}/progress`);
    } catch (err: any) {
      setFormError(err.message || 'Unable to start inspection. Please check your inputs and try again.');
      setIsSubmitting(false);
    }
  };

  const dimensionMismatch =
    leftImage && rightImage && (leftImage.width !== rightImage.width || leftImage.height !== rightImage.height);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#343832] tracking-tight">
            New surface inspection
          </h1>
          <button
            type="button"
            onClick={loadSampleData}
            className="text-xs font-medium text-[#777D73] hover:text-[#343832] underline underline-offset-4 cursor-pointer"
            title="Populates form with synthetic sample stereo files for interface testing"
          >
            Load sample stereo pair (for testing)
          </button>
        </div>
        <p className="text-xs text-[#777D73]">
          Provide calibrated stereo photographs to reconstruct physical coordinates, surface depth, and detect structural anomalies.
        </p>
      </div>

      {/* Mode Callout */}
      {mode === 'backend' ? (
        <div className="p-3.5 rounded-xl bg-[#E7EDE4] border border-[#D5E0D1] text-xs text-[#3F513D] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#3F513D] flex-shrink-0" />
            <span>
              Real processing mode active: Images will be posted directly to <code className="font-mono bg-white/60 px-1 py-0.5 rounded">POST {backendBaseUrl ? `${backendBaseUrl}/api/inspections` : '/api/inspections'}</code>.
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#3F513D] bg-white/70 px-2 py-0.5 rounded self-start sm:self-auto border border-[#D5E0D1]">
            FastAPI Pipeline
          </span>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#F0EFE8] border border-[#E8E5DC] text-xs text-[#777D73] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-[#9BA297] flex-shrink-0" />
            <span>
              Demonstration mode active: Inspection will be stored in local session with simulated pipeline progression.
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#777D73] bg-[#E8E5DC] px-2 py-0.5 rounded self-start sm:self-auto">
            Offline Demo
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Inspection Details */}
        <div className="bg-white p-6 rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
          <h2 className="text-xs font-semibold text-[#343832] uppercase tracking-wider">
            General information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="name-input" className="block text-xs font-medium text-[#343832]">
                Inspection name (optional)
              </label>
              <input
                id="name-input"
                type="text"
                placeholder="e.g. Concrete retaining wall — West face"
                value={inspectionName}
                onChange={(e) => setInspectionName(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-[#F8F7F2] border border-[#E8E5DC] rounded-lg text-[#343832] placeholder-[#9BA297] focus:outline-none focus:ring-1 focus:ring-[#9BAE98] focus:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="surface-select" className="block text-xs font-medium text-[#343832]">
                Surface type
              </label>
              <select
                id="surface-select"
                value={surfaceType}
                onChange={(e) => setSurfaceType(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-[#F8F7F2] border border-[#E8E5DC] rounded-lg text-[#343832] focus:outline-none focus:ring-1 focus:ring-[#9BAE98] focus:bg-white transition-colors"
              >
                <option value="Vertical concrete surface">Vertical concrete wall</option>
                <option value="Bridge pier foundation">Bridge pier foundation</option>
                <option value="Curved tunnel lining">Curved tunnel lining</option>
                <option value="Horizontal concrete slab">Horizontal pavement slab</option>
                <option value="Masonry / Stone wall">Masonry / Stone surface</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stereo Image Upload Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[#343832] uppercase tracking-wider">
              Stereo photographs
            </h2>
            <span className="text-[11px] text-[#777D73]">Required • Supported: JPG, PNG, TIFF, WebP</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left Image Card */}
            <div className="bg-white p-5 rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#343832]">Left camera view</span>
                {leftImage && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#3F513D] font-mono">
                    <Check className="w-3 h-3 text-[#5B7358]" /> Ready
                  </span>
                )}
              </div>

              {leftImage ? (
                <div className="space-y-3">
                  <div className="aspect-video w-full rounded-lg overflow-hidden bg-[#F0EFE8] border border-[#E8E5DC] relative group">
                    <img
                      src={leftImage.previewUrl}
                      alt="Left view preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-[#343832] truncate">{leftImage.name}</div>
                    <div className="flex items-center gap-2 text-[#777D73] text-[11px]">
                      <span>{leftImage.dimensions}</span>
                      <span>•</span>
                      <span>{formatFileSize(leftImage.sizeBytes)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => leftInputRef.current?.click()}
                    className="w-full py-1.5 text-xs text-[#777D73] hover:text-[#343832] bg-[#F8F7F2] hover:bg-[#F0EFE8] border border-[#E8E5DC] rounded-lg transition-colors cursor-pointer"
                  >
                    Replace left image
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => leftInputRef.current?.click()}
                  className="aspect-video w-full rounded-lg border border-dashed border-[#D5D1C5] hover:border-[#9BAE98] bg-[#F8F7F2]/60 hover:bg-[#F0EFE8]/60 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-[#E7EDE4] flex items-center justify-center text-[#5B7358] mb-2">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-[#343832]">Select left stereo photograph</p>
                  <p className="text-[11px] text-[#777D73] mt-0.5">Click or drag file here</p>
                </div>
              )}

              <input
                ref={leftInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processImageFile(file, 'left');
                }}
              />
            </div>

            {/* Right Image Card */}
            <div className="bg-white p-5 rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#343832]">Right camera view</span>
                {rightImage && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#3F513D] font-mono">
                    <Check className="w-3 h-3 text-[#5B7358]" /> Ready
                  </span>
                )}
              </div>

              {rightImage ? (
                <div className="space-y-3">
                  <div className="aspect-video w-full rounded-lg overflow-hidden bg-[#F0EFE8] border border-[#E8E5DC] relative group">
                    <img
                      src={rightImage.previewUrl}
                      alt="Right view preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="font-mono text-[#343832] truncate">{rightImage.name}</div>
                    <div className="flex items-center gap-2 text-[#777D73] text-[11px]">
                      <span>{rightImage.dimensions}</span>
                      <span>•</span>
                      <span>{formatFileSize(rightImage.sizeBytes)}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => rightInputRef.current?.click()}
                    className="w-full py-1.5 text-xs text-[#777D73] hover:text-[#343832] bg-[#F8F7F2] hover:bg-[#F0EFE8] border border-[#E8E5DC] rounded-lg transition-colors cursor-pointer"
                  >
                    Replace right image
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => rightInputRef.current?.click()}
                  className="aspect-video w-full rounded-lg border border-dashed border-[#D5D1C5] hover:border-[#9BAE98] bg-[#F8F7F2]/60 hover:bg-[#F0EFE8]/60 flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all"
                >
                  <div className="w-8 h-8 rounded-full bg-[#E7EDE4] flex items-center justify-center text-[#5B7358] mb-2">
                    <Upload className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-medium text-[#343832]">Select right stereo photograph</p>
                  <p className="text-[11px] text-[#777D73] mt-0.5">Click or drag file here</p>
                </div>
              )}

              <input
                ref={rightInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processImageFile(file, 'right');
                }}
              />
            </div>
          </div>

          {/* Dimension mismatch notification */}
          {dimensionMismatch && (
            <div className="p-3 rounded-lg bg-[#F9EFEA] border border-[#E8C9BD] text-xs text-[#8F543E] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Resolution mismatch:</strong> Left image is {leftImage.width}×{leftImage.height} px, but Right image is {rightImage.width}×{rightImage.height} px.
                Stereo rectification requires images with matching dimensions.
              </div>
            </div>
          )}
        </div>

        {/* Camera Calibration Input */}
        <div className="bg-white p-6 rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-[#343832] uppercase tracking-wider">
                Camera calibration file
              </h2>
              <p className="text-xs text-[#777D73] mt-0.5">
                JSON file containing stereo baseline distance and focal length to scale measurements into millimetres.
              </p>
            </div>
            {calibration && (
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded border ${
                  calibration.status === 'valid'
                    ? 'bg-[#E7EDE4] border-[#D5E0D1] text-[#3F513D]'
                    : calibration.status === 'partial'
                    ? 'bg-[#F0EFE8] border-[#E8E5DC] text-[#777D73]'
                    : 'bg-[#F9EFEA] border-[#E8C9BD] text-[#8F543E]'
                }`}
              >
                {calibration.status === 'valid' ? 'Calibrated' : calibration.status === 'partial' ? 'Partial' : 'Invalid format'}
              </span>
            )}
          </div>

          {calibration ? (
            <div className="p-4 rounded-lg bg-[#F8F7F2] border border-[#E8E5DC] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[#343832] font-medium">{calibration.name}</span>
                <button
                  type="button"
                  onClick={() => calibInputRef.current?.click()}
                  className="text-xs text-[#777D73] hover:text-[#343832] underline cursor-pointer"
                >
                  Change file
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs text-[#777D73]">
                <div>
                  Stereo baseline:{' '}
                  <strong className="text-[#343832]">
                    {calibration.baselineDistanceMm !== undefined ? `${calibration.baselineDistanceMm} mm` : 'Not specified'}
                  </strong>
                </div>
                <div>
                  Focal length:{' '}
                  <strong className="text-[#343832]">
                    {calibration.focalLengthPx !== undefined ? `${calibration.focalLengthPx} px` : 'Not specified'}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-[#777D73] pt-1 border-t border-[#E8E5DC] leading-relaxed">
                {calibration.notes}
              </p>
            </div>
          ) : (
            <div
              onClick={() => calibInputRef.current?.click()}
              className="p-5 rounded-lg border border-dashed border-[#D5D1C5] hover:border-[#9BAE98] bg-[#F8F7F2]/60 hover:bg-[#F0EFE8]/60 flex items-center justify-between gap-4 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E7EDE4] flex items-center justify-center text-[#5B7358]">
                  <FileCode className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-medium text-[#343832]">Select calibration JSON file</p>
                  <p className="text-[11px] text-[#777D73]">Upload your camera matrix or rig parameters</p>
                </div>
              </div>
              <span className="text-xs text-[#777D73] underline">Browse</span>
            </div>
          )}

          <input
            ref={calibInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processCalibrationFile(file);
            }}
          />
        </div>

        {/* Collapsible Processing Settings */}
        <div className="bg-white rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-6 py-3.5 flex items-center justify-between text-left text-xs font-medium text-[#777D73] hover:text-[#343832] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>Processing settings</span>
            </div>
            {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showAdvanced && (
            <div className="px-6 pb-5 pt-2 border-t border-[#E8E5DC] space-y-3 text-xs">
              <div className="space-y-1.5">
                <label htmlFor="method-select" className="block font-medium text-[#343832]">
                  Reconstruction method
                </label>
                <select
                  id="method-select"
                  value={reconstructionMethod}
                  onChange={(e) => setReconstructionMethod(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-[#F8F7F2] border border-[#E8E5DC] rounded-lg text-[#343832] focus:outline-none focus:ring-1 focus:ring-[#9BAE98]"
                >
                  <option value="Automatic surface reconstruction">Automatic (Recommended for concrete and masonry)</option>
                  <option value="Classical stereo reconstruction">Classical stereo matching (Block correlation)</option>
                  <option value="Learned stereo reconstruction">Learned deep correlation (If supported by server)</option>
                </select>
                <p className="text-[11px] text-[#777D73] leading-relaxed">
                  The automatic method selects optimal disparity parameters based on the image resolution and contrast.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* General Form Error Callout */}
        {formError && (
          <div className="p-4 rounded-lg bg-[#F9EFEA] border border-[#E8C9BD] text-xs text-[#8F543E] flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-[#777D73] hover:text-[#343832] cursor-pointer"
          >
            Cancel
          </button>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isSubmitting}
            disabled={!leftImage || !rightImage || Boolean(dimensionMismatch)}
          >
            {isSubmitting
              ? mode === 'backend'
                ? 'Uploading to pipeline...'
                : 'Starting demo...'
              : mode === 'backend'
              ? 'Start backend inspection'
              : 'Start inspection (Demo)'}
          </Button>
        </div>
      </form>
    </div>
  );
};
