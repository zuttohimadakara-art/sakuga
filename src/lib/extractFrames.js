// extractFrames.js — pull PNG/JPEG frames out of an HTMLVideoElement
// at a target FPS, optionally within a frame range, and pack them into a ZIP.
//
// The video element must already be loaded (have readyState >= HAVE_METADATA
// and a known duration). We pause it before extraction starts and never
// resume — the user can re-press play if they want.

import JSZip from 'jszip';

/**
 * @typedef {Object} ExtractOptions
 * @property {number} fps          Target frames per second. <=0 means "every source frame".
 * @property {number} [startFrame] 1-based inclusive start. Defaults to 1.
 * @property {number} [endFrame]   1-based inclusive end. Defaults to total source frames.
 * @property {'png'|'jpeg'} [format]
 * @property {number} [jpegQuality] 0..1, default 0.92
 * @property {1|0.5|0.25} [size]     Scale factor. 1 = original.
 * @property {(progress: {done: number, total: number}) => void} [onProgress]
 * @property {AbortSignal} [signal]
 *
 * @returns {Promise<{ zip: Blob, fileCount: number, fpsActual: number }>}
 */
export async function extractFrames(video, options = {}) {
  const {
    fps = 12,
    startFrame,
    endFrame,
    format = 'png',
    jpegQuality = 0.92,
    size = 1,
    onProgress = () => {},
    signal,
  } = options;

  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('extractFrames: video must be an HTMLVideoElement');
  }
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    throw new Error('Video has no known duration. Wait for metadata to load.');
  }

  // Probe the source FPS by counting frames in the first second.
  // requestVideoFrameCallback is the most reliable way; if it's missing we
  // fall back to a best-guess of 24fps.
  const sourceFps = await probeSourceFps(video);
  const totalSourceFrames = Math.max(1, Math.round(sourceFps * video.duration));

  const startF = Math.max(1, startFrame ?? 1);
  const endF = Math.min(totalSourceFrames, endFrame ?? totalSourceFrames);
  if (endF < startF) {
    throw new Error('End frame must be after start frame.');
  }

  // The actual FPS we'll extract at. fps <= 0 means "every source frame" (source rate).
  const effectiveFps = fps > 0 ? fps : sourceFps;

  // Convert source-frame range to time range (in seconds).
  // Source frame N lives at time (N - 0.5) / sourceFps (center of its interval).
  const startTime = (startF - 0.5) / sourceFps;
  const endTime = (endF + 0.5) / sourceFps;
  const rangeDuration = Math.max(0, endTime - startTime);

  // Number of frames to extract, based on the EFFECTIVE fps (not source fps).
  // This is the actual count the user gets in the ZIP.
  const totalToExtract = Math.max(1, Math.round(rangeDuration * effectiveFps));

  // Video dimensions, scaled
  const w = Math.max(1, Math.round((video.videoWidth || 1280) * size));
  const h = Math.max(1, Math.round((video.videoHeight || 720) * size));

  // Canvas we'll draw to
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not get 2D canvas context.');

  // Pause and mute (we never want audio during seek-frames)
  video.pause();
  video.muted = true;

  const zip = new JSZip();
  const folder = zip.folder('frames');
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  // Pad filenames to the larger of (total source frames) and (total output frames)
  // so a 24fps source extracted at 60fps doesn't produce frame_0001.png for both.
  const padDigits = String(Math.max(totalSourceFrames, totalToExtract)).length;

  // Frame loop — iterate by time at the target FPS.
  // Each output frame is at time t = startTime + (i + 0.5) / effectiveFps.
  // The source frame at that time is round(t * sourceFps) + 1 (1-based).
  let extractedCount = 0;
  const filenames = [];

  for (let i = 0; i < totalToExtract; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const t = startTime + (i + 0.5) / effectiveFps;
    if (t > video.duration) break;
    if (t < 0) continue;

    // Source frame number for the filename (1-based)
    const sourceFrameIdx = Math.max(1, Math.round(t * sourceFps) + 1);

    // Seek and wait for the frame to be ready
    await seekTo(video, t);

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, w, h);

    // Convert to blob
    const blob = await canvasToBlob(canvas, mime, jpegQuality);

    // Filename: frame_00001.png
    const filename = `frame_${String(sourceFrameIdx).padStart(padDigits, '0')}.${ext}`;
    folder.file(filename, blob);
    filenames.push(`frames/${filename}`);

    extractedCount++;
    if (i % 5 === 0 || i === totalToExtract - 1) {
      onProgress({ done: i + 1, total: totalToExtract });
    }

    // Yield to the event loop so the UI can repaint
    if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
  }

  // Sidecar JSON with metadata about the extraction
  const meta = {
    sourceFile: video.currentSrc?.split('/').pop() || 'video',
    sourceDuration: video.duration,
    sourceFps,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    extractedAt: new Date().toISOString(),
    extract: {
      fps: effectiveFps,
      startFrame: startF,
      endFrame: endF,
      count: extractedCount,
      format,
      size: { width: w, height: h },
      jpegQuality: format === 'jpeg' ? jpegQuality : undefined,
    },
    filenames,
  };
  folder.file('metadata.json', JSON.stringify(meta, null, 2));

  // Generate the final zip
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { zip: zipBlob, fileCount: extractedCount, fpsActual: effectiveFps };
}

/**
 * Seek the video to time t and resolve when a frame at that time is ready to draw.
 *
 * Strategy: combine THREE signals so we never miss a frame:
 *   1. 'seeked' event — fires when the browser has finished seeking. Most reliable
 *      on paused local files. Wait for this first.
 *   2. requestVideoFrameCallback — fires when the next frame is presented. Used
 *      as a backup to confirm the frame is actually rendered at the target time
 *      (in case 'seeked' fires but the previous frame is still on screen).
 *   3. Timeout fallback — old default was 500ms, which was too short for HD
 *      video at later positions where the browser needs to seek + decode
 *      frames it hasn't touched yet. Bumped to 4s.
 */
function seekTo(video, t) {
  return new Promise((resolve) => {
    const target = Math.max(0, Math.min(video.duration || t, t));
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
    };
    const onSeeked = () => {
      if (done) return;
      // After 'seeked' fires, also wait for a frame to be presented at/after t
      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        let frameResolved = false;
        const onFrame = (now, meta) => {
          if (frameResolved) return;
          if (meta.mediaTime >= target - 0.05) {
            frameResolved = true;
            cleanup();
            resolve();
          }
        };
        video.requestVideoFrameCallback(onFrame);
        // Backup if no frame callback within 2s after 'seeked'
        setTimeout(() => {
          if (!done) { cleanup(); resolve(); }
        }, 2000);
      } else {
        cleanup();
        resolve();
      }
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    // Trigger the seek
    video.currentTime = target;
    // Ultimate backup: resolve after 4s no matter what
    setTimeout(() => {
      if (!done) { cleanup(); resolve(); }
    }, 4000);
  });
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))), mime, quality);
  });
}

/**
 * Probe the actual source FPS of a video by counting how many
 * distinct video frames are presented in 1 second. Uses
 * requestVideoFrameCallback where available, otherwise falls back to a
 * rough estimate based on `webkitDecodedFrameCount` or 24.
 */
async function probeSourceFps(video) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) {
    return 24;
  }
  // Capture the current state so we can restore it
  const wasPaused = video.paused;
  const restoreTime = video.currentTime;
  const restoreMuted = video.muted;
  const restorePlaybackRate = video.playbackRate;
  video.muted = true;
  video.playbackRate = 1.0;

  return new Promise((resolve) => {
    let count = 0;
    let done = false;
    let startTime = 0;
    let endTime = 0;

    const finish = (fallback = false) => {
      if (done) return;
      done = true;
      try {
        video.pause();
        video.currentTime = restoreTime;
        video.muted = restoreMuted;
        video.playbackRate = restorePlaybackRate;
        if (wasPaused) video.pause();
        else video.play().catch(() => {});
      } catch { /* ignore */ }
      if (fallback || endTime - startTime < 0.3 || count < 2) {
        resolve(24);
        return;
      }
      const fps = (count - 1) / (endTime - startTime);
      const common = [12, 15, 18, 20, 23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
      const nearest = common.reduce(
        (b, c) => Math.abs(c - fps) < Math.abs(b - fps) ? c : b,
        24
      );
      const final = Math.abs(nearest - fps) <= 0.5 ? nearest : Math.max(1, Math.round(fps));
      resolve(final);
    };

    const onFrame = (now, meta) => {
      if (done) return;
      if (count === 0) {
        startTime = meta.mediaTime;
      }
      count++;
      endTime = meta.mediaTime;
      if (endTime - startTime >= 1.0) {
        finish();
      } else {
        video.requestVideoFrameCallback(onFrame);
      }
    };

    // Safety timeout — if 4s pass and we haven't measured 1s of playback
    setTimeout(() => finish(true), 4000);

    // Seek to start, then start playing
    video.currentTime = 0;
    video.requestVideoFrameCallback(onFrame);
    video.play().catch(() => finish(true));
  });
}
