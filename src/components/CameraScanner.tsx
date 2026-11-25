import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  Play,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CapturedImage, ScanStage } from '../types/medilens';
import {
  captureVideoFrame,
  createSampleLabelImage,
  ImageCaptureError,
  resizeImageFile,
} from '../utils/sampleImages';

type CameraState =
  | 'loading'
  | 'live'
  | 'permission_denied'
  | 'playback_blocked'
  | 'not_found'
  | 'in_use'
  | 'insecure_context'
  | 'unavailable';

interface CameraScannerProps {
  capturedImage: CapturedImage | null;
  onImageSelected: (image: CapturedImage | null) => void;
  onRunScan: (image: CapturedImage) => void;
  isScanning: boolean;
  isImageProcessed: boolean;
  onError: (message: string, stage: ScanStage) => void;
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  capturedImage,
  onImageSelected,
  onRunScan,
  isScanning,
  isImageProcessed,
  onError,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraState, setCameraState] = useState<CameraState>('loading');
  const [cameraErrorDetail, setCameraErrorDetail] = useState<string | null>(null);

  const stopActiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const attachAndPlayStream = useCallback(async (stream: MediaStream): Promise<boolean> => {
    const video = videoRef.current;
    if (!video) return false;

    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.srcObject = stream;

    await new Promise<void>((resolve) => {
      if (video.readyState >= 1) {
        resolve();
        return;
      }
      const onLoaded = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      };
      video.addEventListener('loadedmetadata', onLoaded);
      setTimeout(() => {
        video.removeEventListener('loadedmetadata', onLoaded);
        resolve();
      }, 1500);
    });

    try {
      await video.play();
      setCameraState('live');
      setCameraErrorDetail(null);
      return true;
    } catch (playErr) {
      const errName = playErr instanceof Error ? playErr.name : '';
      if (errName === 'NotAllowedError' || errName === 'AbortError') {
        setCameraState('playback_blocked');
        setCameraErrorDetail(
          'Mobile browser paused automatic video playback. Tap Start Preview to activate the viewfinder.'
        );
      } else {
        setCameraState('unavailable');
        setCameraErrorDetail(
          playErr instanceof Error ? playErr.message : 'Unable to play live camera stream.'
        );
      }
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopActiveStream();

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setCameraState('insecure_context');
      setCameraErrorDetail(
        'Open on localhost or https to use the camera. You can still upload a photo instead or try a sample below.'
      );
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('unavailable');
      setCameraErrorDetail('Camera API is not supported in this browser.');
      return;
    }

    setCameraState('loading');
    setCameraErrorDetail(null);

    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (constraintErr) {
        const name = constraintErr instanceof Error ? constraintErr.name : '';
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw constraintErr;
        }
      }

      streamRef.current = stream;
      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          setCameraState('unavailable');
          setCameraErrorDetail('Camera stream stopped by the device. Tap Retry Camera.');
        };
      }

      await attachAndPlayStream(stream);
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraState('permission_denied');
        setCameraErrorDetail(
          'Camera permission was denied. Allow camera access in your browser settings and tap Retry Camera, or upload a photo instead.'
        );
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setCameraState('not_found');
        setCameraErrorDetail('No camera was detected on this device. Upload a photo instead or try a sample below.');
      } else if (name === 'NotReadableError' || name === 'TrackStartError') {
        setCameraState('in_use');
        setCameraErrorDetail(
          'Camera is currently in use by another app or tab. Close it and tap Retry Camera, or upload a photo instead.'
        );
      } else {
        setCameraState('unavailable');
        setCameraErrorDetail(
          err instanceof Error
            ? `${err.message} You can upload a photo instead.`
            : 'Unable to start camera preview. You can upload a photo instead.'
        );
      }
    }
  }, [attachAndPlayStream, stopActiveStream]);

  useEffect(() => {
    startCamera();
    return () => {
      stopActiveStream();
    };
  }, [startCamera, stopActiveStream]);

  const handleResumePlayback = async () => {
    if (streamRef.current && videoRef.current) {
      const ok = await attachAndPlayStream(streamRef.current);
      if (ok) return;
    }
    await startCamera();
  };

  const handleClearImage = () => {
    onImageSelected(null);
    const hasLiveTrack = streamRef.current?.getVideoTracks().some((t) => t.readyState === 'live');
    if (hasLiveTrack && videoRef.current) {
      videoRef.current.play().catch(() => {
        setCameraState('playback_blocked');
      });
    } else if (cameraState === 'live' || cameraState === 'playback_blocked') {
      startCamera();
    }
  };

  const handlePrimaryScan = () => {
    if (capturedImage) {
      onRunScan(capturedImage);
      return;
    }
    if (videoRef.current && cameraState === 'live') {
      try {
        const frame = captureVideoFrame(videoRef.current);
        onImageSelected(frame);
        onRunScan(frame);
        return;
      } catch (err) {
        const stage = err instanceof ImageCaptureError ? err.stage : 'camera_capture';
        onError(
          err instanceof Error ? err.message : 'Failed to capture frame from live camera.',
          stage
        );
        return;
      }
    }

    onError(
      cameraErrorDetail ||
        'No live camera frame is ready. Tap Retry Camera, upload a photo, or run a test sample below.',
      'camera_capture'
    );
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const img = await resizeImageFile(file);
      onImageSelected(img);
      onRunScan(img);
    } catch (err) {
      const stage = err instanceof ImageCaptureError ? err.stage : 'image_transmission';
      onError(
        err instanceof Error ? err.message : 'Unable to process the selected photo.',
        stage
      );
    }
  };

  const handleSample = (variant: 'clear' | 'blurry') => {
    try {
      const sample = createSampleLabelImage(variant);
      onImageSelected(sample);
      onRunScan(sample);
    } catch (err) {
      const stage = err instanceof ImageCaptureError ? err.stage : 'camera_capture';
      onError(err instanceof Error ? err.message : 'Could not create test sample.', stage);
    }
  };

  const statusHeadline =
    cameraState === 'loading'
      ? 'Requesting rear camera access...'
      : cameraState === 'permission_denied'
        ? 'Camera permission denied'
        : cameraState === 'playback_blocked'
          ? 'Tap to start live camera preview'
          : cameraState === 'not_found'
            ? 'No camera found on this device'
            : cameraState === 'in_use'
              ? 'Camera is busy in another app'
              : cameraState === 'insecure_context'
                ? 'Open on localhost or https to use the camera'
                : 'Camera preview unavailable in this browser';

  return (
    <section
      id="scanner"
      className="bg-[#0b1f19] text-slate-100 rounded-2xl p-4 sm:p-5 border border-emerald-950/60 shadow-sm"
    >
      {/* Viewfinder */}
      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#05100d] border border-white/10">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${capturedImage ? 'hidden' : 'block'}`}
        />

        {capturedImage ? (
          <img
            src={capturedImage.previewUrl}
            alt={capturedImage.label}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover block"
          />
        ) : (
          cameraState !== 'live' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-[#081a14] to-[#040c0a]">
              <Camera className="w-9 h-9 text-emerald-400/80 mb-2" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-200 max-w-xs">{statusHeadline}</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                {cameraErrorDetail ||
                  'Tap Photo to upload a medicine label or test with a sample strip below.'}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {cameraState === 'playback_blocked' ? (
                  <button
                    type="button"
                    onClick={handleResumePlayback}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    Start Preview
                  </button>
                ) : (
                  cameraState !== 'loading' &&
                  cameraState !== 'not_found' &&
                  cameraState !== 'insecure_context' && (
                    <button
                      type="button"
                      onClick={startCamera}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#16362c] hover:bg-[#1d4539] border border-white/15 text-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Retry Camera
                    </button>
                  )
                )}

                {cameraState !== 'loading' && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isScanning}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" />
                    Upload Photo Instead
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {/* Framing Reticle */}
        {!capturedImage && !isScanning && cameraState === 'live' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[12%] border-2 border-dashed border-emerald-400/65 rounded-xl"
          />
        )}

        {/* Animated Scanning Overlay Effect */}
        {isScanning && (
          <div className="absolute inset-0 bg-[#07130f]/75 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 overflow-hidden">
            <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_#34d399] animate-scan-laser" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
            <div className="bg-black/85 px-4 py-2.5 rounded-xl border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center gap-2 shadow-2xl animate-pulse">
              <ScanLine className="w-4 h-4 animate-spin text-emerald-400" aria-hidden="true" />
              <span>Reading printed label &amp; verifying details...</span>
            </div>
          </div>
        )}

        {/* Measured top scrim status caption */}
        <div className="absolute inset-x-0 top-0 p-3 bg-gradient-to-b from-black/75 via-black/35 to-transparent flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-emerald-100 tracking-wide truncate">
            {capturedImage
              ? capturedImage.label
              : cameraState === 'live'
                ? 'Live rear camera · Align printed label inside frame'
                : 'Photo upload & sample scanner ready'}
          </span>

          {capturedImage && (
            <button
              type="button"
              onClick={handleClearImage}
              disabled={isScanning}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-black/55 hover:bg-black/75 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Primary Scan & Photo Actions */}
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2.5">
        <button
          type="button"
          onClick={handlePrimaryScan}
          disabled={isScanning}
          className={`min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
            capturedImage && !isScanning && !isImageProcessed
              ? 'ring-4 ring-emerald-400/50 animate-pulse'
              : ''
          }`}
        >
          <ScanLine className="w-4 h-4" aria-hidden="true" />
          {isScanning ? 'Scanning Label...' : 'Scan Medicine'}
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isScanning}
          className="min-h-[48px] px-4 py-3 rounded-xl bg-[#16362c] hover:bg-[#1d4539] border border-white/15 text-emerald-50 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <ImagePlus className="w-4 h-4" aria-hidden="true" />
          Photo
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Built-in Test Samples */}
      <div className="mt-3 pt-3 border-t border-white/10">
        <p className="text-xs text-slate-300 mb-2 font-medium">Test Samples</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSample('clear')}
            disabled={isScanning}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-[#143128] hover:bg-[#1a4035] border border-white/10 text-emerald-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="truncate">Azithromycin 500mg</span>
          </button>

          <button
            type="button"
            onClick={() => handleSample('blurry')}
            disabled={isScanning}
            className="min-h-[44px] px-3 py-2 rounded-lg bg-[#143128] hover:bg-[#1a4035] border border-white/10 text-amber-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-55 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" aria-hidden="true" />
            <span className="truncate">Blurry Label (Safety Check)</span>
          </button>
        </div>
      </div>
    </section>
  );
};
