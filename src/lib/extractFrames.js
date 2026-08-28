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
 * Seek the video to time t and resolve when the frame is ready to draw.
 * Uses requestVideoFrameCallback if available (frame-accurate), else
 * falls back to the 'seeked' event (which fires when the video is at the
 * right time but the frame may be one off — close enough for most uses).
 */
function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      let done = false;
      const onFrame = (now, meta) => {
        if (done) return;
        // Only accept if we're at (or past) the target time
        if (meta.mediaTime >= t - 0.02) {
          done = true;
          video.cancelVideoFrameCallback(handle);
          resolve();
        }
      };
      const handle = video.requestVideoFrameCallback(onFrame);
      video.currentTime = Math.max(0, t);
      // Safety: resolve after 500ms if the callback never fires
      setTimeout(() => { if (!done) { done = true; resolve(); } }, 500);
    } else {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.currentTime = Math.max(0, t);
      setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      }, 500);
    }
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
    // Best-effort heuristic: look for common rates in container metadata.
    // Otherwise default to 24 (film) which is a safe middle ground.
    return 24;
  }
  return new Promise((resolve) => {
    const startTime = video.currentTime;
    let count = 0;
    let done = false;
    const onFrame = () => {
      if (done) return;
      count++;
      if (video.currentTime - startTime >= 1.0) {
        done = true;
        // Count includes the frame AT 1.0; subtract one for fence-post
        const fps = Math.max(1, Math.round(count - 1));
        // Snap to common rates if very close
        const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
        const nearest = common.reduce((best, c) =>
          Math.abs(c - fps) < Math.abs(best - fps) ? c : best
        , 24);
        // If within 2 of a common rate, use that
        const final = Math.abs(nearest - fps) <= 2 ? nearest : fps;
        video.currentTime = startTime;
        resolve(final);
      } else {
        video.requestVideoFrameCallback(onFrame);
        video.currentTime = Math.min(video.duration, startTime + (count * 0.5 / 30));
        // ^ advance time so we see NEW frames
      }
    };
    const handle = video.requestVideoFrameCallback(onFrame);
    video.currentTime = Math.min(video.duration, startTime + 0.001);
    // Safety timeout
    setTimeout(() => {
      if (!done) {
        done = true;
        resolve(24);
      }
    }, 5000);
  });
}
