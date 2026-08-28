'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { fetchVideoFromUrl, FetchError } from '@/lib/urlFetcher';
import { extractFrames } from '@/lib/extractFrames';

export default function FrameExtractor() {
  const t = useTranslations();
  const tCommon = useTranslations('common');
  const tInput = useTranslations('input');
  const tPlayer = useTranslations('player');
  const tExtract = useTranslations('extract');

  // Source video state
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoName, setVideoName] = useState('');
  const [videoMeta, setVideoMeta] = useState(null); // { duration, sourceFps, width, height, totalFrames }
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  // Input state
  const [inputMode, setInputMode] = useState('file');
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const fileInputRef = useRef(null);

  // Extract state
  const [fpsMode, setFpsMode] = useState('12');
  const [fpsCustom, setFpsCustom] = useState('');
  const [rangeMode, setRangeMode] = useState('all');
  const [rangeFrom, setRangeFrom] = useState(1);
  const [rangeTo, setRangeTo] = useState(1);
  const [format, setFormat] = useState('png');
  const [jpegQuality, setJpegQuality] = useState(0.92);
  const [sizeMode, setSizeMode] = useState('full');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
  const [zipBlob, setZipBlob] = useState(null);
  const [zipFileName, setZipFileName] = useState('');
  const [extractError, setExtractError] = useState('');
  const abortRef = useRef(null);

  // Cleanup object URLs on unmount or new upload
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  // Keyboard shortcuts when video is loaded
  useEffect(() => {
    if (!videoUrl) return;
    const onKey = (e) => {
      // Don't intercept if user is typing in an input/textarea
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === ',') {
        e.preventDefault();
        stepFrames(-1);
      } else if (e.key === 'ArrowRight' || e.key === '.') {
        e.preventDefault();
        stepFrames(1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        seekToFrame(1);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (videoMeta) seekToFrame(videoMeta.totalFrames);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [videoUrl, videoMeta]);

  // Derived values
  const currentFrame = useMemo(() => {
    if (!videoMeta) return 0;
    return Math.floor(currentTime * videoMeta.sourceFps) + 1;
  }, [currentTime, videoMeta]);

  const effectiveFps = useMemo(() => {
    if (fpsMode === 'source') return videoMeta?.sourceFps || 24;
    if (fpsMode === 'custom') return Math.max(1, Number(fpsCustom) || 24);
    return Number(fpsMode);
  }, [fpsMode, fpsCustom, videoMeta]);

  const estimatedFrames = useMemo(() => {
    if (!videoMeta) return 0;
    const startF = rangeMode === 'all' ? 1 : Math.max(1, rangeFrom);
    const endF = rangeMode === 'all'
      ? videoMeta.totalFrames
      : Math.min(videoMeta.totalFrames, rangeTo);
    if (endF < startF) return 0;
    const durationSec = (endF - startF + 1) / videoMeta.sourceFps;
    return Math.max(1, Math.round(durationSec * effectiveFps));
  }, [videoMeta, rangeMode, rangeFrom, rangeTo, effectiveFps]);

  // --- Handlers ---

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (!file.type.startsWith('video/') && !/\.(mp4|webm|mov|gif|m4v|ogv|mkv|avi)$/i.test(file.name)) {
      setUrlError('That file doesn\'t look like a video.');
      return;
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoName(file.name);
    setUrlError('');
    setExtractError('');
    setZipBlob(null);
    setCurrentTime(0);
  }, [videoUrl]);

  const onFileInput = (e) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drop-active');
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('drop-active');
  };
  const onDragLeave = (e) => {
    e.currentTarget.classList.remove('drop-active');
  };

  const loadFromUrl = async () => {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError('');
    try {
      const { blob, sourceUrl } = await fetchVideoFromUrl(urlInput);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      // Derive a filename from the URL
      let name = 'video.mp4';
      try {
        const u = new URL(sourceUrl);
        const last = u.pathname.split('/').pop();
        if (last) name = decodeURIComponent(last);
      } catch { /* keep default */ }
      setVideoName(name);
      setExtractError('');
      setZipBlob(null);
      setCurrentTime(0);
    } catch (e) {
      if (e instanceof FetchError) {
        // Map to a translation key
        const key = `urlError${e.code.charAt(0).toUpperCase() + e.code.slice(1)}`;
        setUrlError(tInput(key) !== key ? tInput(key) : tInput('urlError'));
      } else {
        setUrlError(tInput('urlError'));
      }
    } finally {
      setUrlLoading(false);
    }
  };

  // --- Video control ---

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else { v.pause(); setIsPlaying(false); }
  };

  const stepFrames = (n) => {
    const v = videoRef.current;
    if (!v || !videoMeta) return;
    v.pause();
    setIsPlaying(false);
    const frameDur = 1 / videoMeta.sourceFps;
    const newTime = Math.max(0, Math.min(v.duration, v.currentTime + n * frameDur));
    v.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const seekToFrame = (frame) => {
    const v = videoRef.current;
    if (!v || !videoMeta) return;
    const f = Math.max(1, Math.min(videoMeta.totalFrames, frame));
    const t = (f - 1) / videoMeta.sourceFps;
    v.currentTime = t;
    setCurrentTime(t);
  };

  const onTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const onLoadedMetadata = async () => {
    const v = videoRef.current;
    if (!v) return;
    // Probe source FPS by walking one second of frames
    const sourceFps = await probeFpsFromVideo(v);
    const totalFrames = Math.max(1, Math.round(sourceFps * v.duration));
    setVideoMeta({
      duration: v.duration,
      sourceFps,
      width: v.videoWidth,
      height: v.videoHeight,
      totalFrames,
    });
    setRangeTo(totalFrames);
  };

  // --- Extract ---

  const doExtract = async () => {
    if (!videoRef.current || !videoMeta) return;
    setExtractError('');
    setIsExtracting(true);
    setExtractProgress({ done: 0, total: estimatedFrames });
    setZipBlob(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const sizeMap = { full: 1, half: 0.5, quarter: 0.25 };
      const result = await extractFrames(videoRef.current, {
        fps: fpsMode === 'source' ? 0 : effectiveFps,
        startFrame: rangeMode === 'all' ? 1 : rangeFrom,
        endFrame: rangeMode === 'all' ? videoMeta.totalFrames : rangeTo,
        format,
        jpegQuality,
        size: sizeMap[sizeMode] || 1,
        signal: ac.signal,
        onProgress: (p) => setExtractProgress(p),
      });
      setZipBlob(result.zip);
      // Build a filename like "frames_<videoname>_24fps.zip"
      const base = videoName.replace(/\.[^.]+$/, '') || 'frames';
      const cleanBase = base.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fpsTag = fpsMode === 'source' ? `${Math.round(result.fpsActual)}fps` : `${effectiveFps}fps`;
      setZipFileName(`${cleanBase}_${fpsTag}.zip`);
    } catch (e) {
      if (e.name === 'AbortError') {
        setExtractError('');
      } else {
        setExtractError(e.message || tExtract('errorGeneric'));
      }
    } finally {
      setIsExtracting(false);
      abortRef.current = null;
    }
  };

  const cancelExtract = () => {
    abortRef.current?.abort();
  };

  const downloadZip = () => {
    if (!zipBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zipBlob);
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* INPUT AREA */}
      {!videoUrl && (
        <div className="bg-bg-raised border border-border rounded-lg p-1">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => { setInputMode('file'); setUrlError(''); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                inputMode === 'file' ? 'text-fg border-b-2 border-accent -mb-px' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {tInput('tabFile')}
            </button>
            <button
              type="button"
              onClick={() => { setInputMode('url'); setUrlError(''); }}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                inputMode === 'url' ? 'text-fg border-b-2 border-accent -mb-px' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {tInput('tabUrl')}
            </button>
          </div>

          {inputMode === 'file' && (
            <div
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              className="m-4 border-2 border-dashed border-border rounded-md py-16 px-6 text-center cursor-pointer hover:border-accent transition focus:outline-none focus-visible:border-accent"
            >
              <svg className="mx-auto mb-3 text-fg-subtle" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <p className="text-fg font-medium mb-1">{tInput('dropHere')}</p>
              <p className="text-fg-muted text-sm">{tInput('orClick')}</p>
              <p className="text-fg-subtle text-xs mt-3">{tInput('supportedFormats')}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={onFileInput}
                className="hidden"
              />
            </div>
          )}

          {inputMode === 'url' && (
            <div className="m-4 space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') loadFromUrl(); }}
                  placeholder={tInput('urlPlaceholder')}
                  className="flex-1 px-3 py-2.5 bg-bg border border-border rounded text-fg placeholder-fg-subtle text-sm focus:outline-none focus:border-accent"
                />
                <button
                  type="button"
                  onClick={loadFromUrl}
                  disabled={urlLoading || !urlInput.trim()}
                  className="px-5 py-2.5 bg-accent text-bg font-medium rounded text-sm hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {urlLoading ? tCommon('loading') : tInput('urlLoad')}
                </button>
              </div>
              {urlError && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{urlError}</p>
              )}
              <p className="text-xs text-fg-subtle">{tInput('supportedFormats')}</p>
            </div>
          )}
        </div>
      )}

      {/* PLAYER + EXTRACT (visible when video is loaded) */}
      {videoUrl && videoMeta && (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Player column */}
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onClick={togglePlay}
                className="w-full max-h-[60vh] object-contain"
                playsInline
                preload="auto"
              />
            </div>
            {/* Scrub bar */}
            <div className="space-y-2">
              <input
                type="range"
                min={1}
                max={videoMeta.totalFrames}
                value={currentFrame}
                onChange={(e) => seekToFrame(Number(e.target.value))}
                className="w-full"
                aria-label="Scrub video"
              />
              <div className="flex items-center justify-between text-xs font-mono text-fg-muted">
                <span>{tPlayer('frameLabel')} {currentFrame} {tPlayer('ofLabel')} {videoMeta.totalFrames}</span>
                <span>{formatTime(currentTime)} / {formatTime(videoMeta.duration)}</span>
                <span>~{Math.round(videoMeta.sourceFps)} fps</span>
              </div>
            </div>
            {/* Transport controls */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <CtrlButton onClick={() => seekToFrame(1)} title={tPlayer('jumpStart')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4l-12 8 12 8V4zM5 4h2v16H5V4z" /></svg>
              </CtrlButton>
              <CtrlButton onClick={() => stepFrames(-1)} title={tPlayer('stepBack')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4l-12 8 12 8V4z" /></svg>
              </CtrlButton>
              <CtrlButton onClick={togglePlay} primary title={isPlaying ? tPlayer('pause') : tPlayer('play')}>
                {isPlaying ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l14 8-14 8V4z" /></svg>
                )}
              </CtrlButton>
              <CtrlButton onClick={() => stepFrames(1)} title={tPlayer('stepForward')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l12 8-12 8V4z" /></svg>
              </CtrlButton>
              <CtrlButton onClick={() => seekToFrame(videoMeta.totalFrames)} title={tPlayer('jumpEnd')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l12 8-12 8V4zM17 4h2v16h-2V4z" /></svg>
              </CtrlButton>
              <button
                type="button"
                onClick={() => {
                  if (videoUrl) URL.revokeObjectURL(videoUrl);
                  setVideoUrl(null);
                  setVideoMeta(null);
                  setZipBlob(null);
                  setCurrentTime(0);
                }}
                className="ml-2 px-3 py-1.5 text-xs text-fg-muted hover:text-fg border border-white/10 hover:border-white/25 rounded transition"
              >
                {tCommon('cancel')}
              </button>
            </div>
            <p className="text-center text-xs text-fg-subtle">
              <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono">Space</kbd>{' '}
              {tPlayer('play').toLowerCase()} ·{' '}
              <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono">←</kbd>{' '}
              <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono">→</kbd>{' '}
              step
            </p>
          </div>

          {/* Extract controls */}
          <div className="space-y-4 bg-bg-raised border border-border rounded-lg p-4">
            <h2 className="font-display font-bold text-lg">{tExtract('title')}</h2>

            {/* FPS */}
            <Field label={tExtract('fpsLabel')} hint={tExtract('fpsHint')}>
              <select
                value={fpsMode}
                onChange={(e) => setFpsMode(e.target.value)}
                className="w-full px-3 py-2 bg-bg border border-border rounded text-fg text-sm focus:outline-none focus:border-accent"
              >
                <option value="12">{tExtract('preset12')}</option>
                <option value="24">{tExtract('preset24')}</option>
                <option value="30">{tExtract('preset30')}</option>
                <option value="60">{tExtract('preset60')}</option>
                <option value="source">{tExtract('presetSource')}</option>
                <option value="custom">Custom…</option>
              </select>
              {fpsMode === 'custom' && (
                <input
                  type="number"
                  min="1"
                  max="240"
                  step="1"
                  value={fpsCustom}
                  onChange={(e) => setFpsCustom(e.target.value)}
                  placeholder="24"
                  className="w-full mt-2 px-3 py-2 bg-bg border border-border rounded text-fg text-sm focus:outline-none focus:border-accent"
                />
              )}
            </Field>

            {/* Range */}
            <Field label={tExtract('rangeLabel')}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRangeMode('all')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    rangeMode === 'all' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {tExtract('rangeAll')}
                </button>
                <button
                  type="button"
                  onClick={() => setRangeMode('custom')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    rangeMode === 'custom' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {tExtract('rangeCustom')}
                </button>
              </div>
              {rangeMode === 'custom' && (
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="block">
                    <span className="text-xs text-fg-muted">{tExtract('rangeFrom')}</span>
                    <input
                      type="number"
                      min="1"
                      max={videoMeta.totalFrames}
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(Math.max(1, Math.min(videoMeta.totalFrames, Number(e.target.value) || 1)))}
                      className="w-full mt-1 px-3 py-2 bg-bg border border-border rounded text-fg text-sm focus:outline-none focus:border-accent"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-fg-muted">{tExtract('rangeTo')}</span>
                    <input
                      type="number"
                      min="1"
                      max={videoMeta.totalFrames}
                      value={rangeTo}
                      onChange={(e) => setRangeTo(Math.max(1, Math.min(videoMeta.totalFrames, Number(e.target.value) || 1)))}
                      className="w-full mt-1 px-3 py-2 bg-bg border border-border rounded text-fg text-sm focus:outline-none focus:border-accent"
                    />
                  </label>
                </div>
              )}
            </Field>

            {/* Format */}
            <Field label={tExtract('formatLabel')}>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFormat('png')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    format === 'png' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {tExtract('formatPng')}
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('jpeg')}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition ${
                    format === 'jpeg' ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg'
                  }`}
                >
                  {tExtract('formatJpg')}
                </button>
              </div>
              {format === 'jpeg' && (
                <div className="mt-2">
                  <label className="block text-xs text-fg-muted mb-1">
                    {tExtract('qualityLabel')} ({Math.round(jpegQuality * 100)}%)
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1"
                    step="0.01"
                    value={jpegQuality}
                    onChange={(e) => setJpegQuality(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
            </Field>

            {/* Size */}
            <Field label={tExtract('sizeLabel')}>
              <div className="grid grid-cols-3 gap-2">
                {['full', 'half', 'quarter'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSizeMode(s)}
                    className={`px-2 py-2 text-xs rounded border transition ${
                      sizeMode === s ? 'border-accent bg-accent/10 text-fg' : 'border-border text-fg-muted hover:text-fg'
                    }`}
                  >
                    {s === 'full' ? tExtract('sizeFull') : s === 'half' ? tExtract('sizeHalf') : tExtract('sizeQuarter')}
                  </button>
                ))}
              </div>
            </Field>

            {/* Estimate */}
            <div className="text-sm text-fg-muted bg-bg/50 rounded px-3 py-2">
              <p>
                {tExtract('estimated')}: <span className="text-fg font-mono">{estimatedFrames}</span>
              </p>
              {estimatedFrames > 1500 && (
                <p className="text-amber-400/80 text-xs mt-1">{tExtract('estimateOver')}</p>
              )}
            </div>

            {/* Action */}
            {!zipBlob ? (
              <button
                type="button"
                onClick={doExtract}
                disabled={isExtracting || estimatedFrames === 0}
                className="w-full px-4 py-3 bg-accent text-bg font-bold rounded hover:bg-accent-hover transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExtracting
                  ? tExtract('extractingProgress', { done: extractProgress.done, total: extractProgress.total })
                  : tExtract('extract', { count: estimatedFrames })}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="text-sm text-accent text-center">
                  ✓ {tExtract('ready', { count: extractProgress.done || estimatedFrames })}
                </div>
                <button
                  type="button"
                  onClick={downloadZip}
                  className="w-full px-4 py-3 bg-accent text-bg font-bold rounded hover:bg-accent-hover transition"
                >
                  {tExtract('downloadZip')} ({zipFileName})
                </button>
                <button
                  type="button"
                  onClick={() => setZipBlob(null)}
                  className="w-full px-3 py-2 text-sm text-fg-muted hover:text-fg border border-white/10 hover:border-white/25 rounded transition"
                >
                  {tExtract('title')}
                </button>
              </div>
            )}

            {isExtracting && (
              <button
                type="button"
                onClick={cancelExtract}
                className="w-full px-3 py-2 text-sm text-fg-muted hover:text-fg border border-white/10 hover:border-white/25 rounded transition"
              >
                {tCommon('cancel')}
              </button>
            )}

            {extractError && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2">{extractError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CtrlButton({ children, onClick, title, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`min-w-[40px] h-10 px-3 inline-flex items-center justify-center rounded border transition ${
        primary
          ? 'bg-accent text-bg border-accent hover:bg-accent-hover'
          : 'bg-bg-raised text-fg border-border hover:border-accent/40'
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-fg-muted mb-1.5 uppercase tracking-wider">{label}</label>
      {children}
      {hint && <p className="text-xs text-fg-subtle mt-1.5">{hint}</p>}
    </div>
  );
}

function formatTime(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

// Probe source FPS using requestVideoFrameCallback (frame-accurate) or fallback to 24
async function probeFpsFromVideo(video) {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return 24;
  return new Promise((resolve) => {
    const start = video.currentTime || 0;
    let count = 0;
    let done = false;
    const onFrame = () => {
      if (done) return;
      count++;
      if (video.currentTime - start >= 1.0) {
        done = true;
        const observed = count - 1;
        const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60];
        const nearest = common.reduce((b, c) => Math.abs(c - observed) < Math.abs(b - observed) ? c : b, 24);
        video.currentTime = start;
        resolve(Math.abs(nearest - observed) <= 2 ? nearest : Math.max(1, Math.round(observed)));
      } else {
        video.requestVideoFrameCallback(onFrame);
        video.currentTime = Math.min(video.duration, start + count * 0.05);
      }
    };
    video.requestVideoFrameCallback(onFrame);
    video.currentTime = Math.min(video.duration, start + 0.001);
    setTimeout(() => { if (!done) { done = true; resolve(24); } }, 4000);
  });
}
