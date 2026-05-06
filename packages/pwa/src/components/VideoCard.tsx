import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from './Icon.js';

interface VideoData {
  thumbnailUrl: string;
  playlistUrl: string;
  alt?: string;
  aspectRatio?: { width: number; height: number };
}

export function VideoCard({ thumbnailUrl, playlistUrl, alt, aspectRatio }: VideoData) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);

  // Set up HLS when playback starts (playing transitions to true).
  // <video> is always in DOM (hidden via CSS), so videoRef.current is always available.
  useEffect(() => {
    if (!playing || !videoRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const { default: Hls } = await import('hls.js');
        if (cancelled) return;

        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(playlistUrl);
          hls.attachMedia(videoRef.current!);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              videoRef.current?.play().catch(() => {
                if (!cancelled) setError(true);
              });
            }
          });

          // Only fatal errors should disable the player permanently
          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (!cancelled && data.fatal) {
              setError(true);
            }
          });
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current!.src = playlistUrl;
          if (!cancelled) {
            videoRef.current!.play().catch(() => {
              if (!cancelled) setError(true);
            });
          }
        } else {
          if (!cancelled) setError(true);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [playing, playlistUrl]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    setError(false);
  }, []);

  const handleRetry = useCallback(() => {
    setPlaying(false);
    setError(false);
    if (videoRef.current) {
      videoRef.current.src = '';
    }
  }, []);

  const containerStyle: React.CSSProperties = {
    maxHeight: '560px',
    width: '100%',
    ...(aspectRatio && aspectRatio.width && aspectRatio.height
      ? { aspectRatio: `${aspectRatio.width}/${aspectRatio.height}` }
      : {}),
  };

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-border relative bg-black" style={containerStyle}>
      {/*
        <video> is always in DOM (hidden when idle) to ensure videoRef is never null.
        HLS setup happens in useEffect after React re-renders with playing=true.
      */}
      <video
        ref={videoRef}
        controls
        playsInline
        className={`w-full h-full ${playing ? '' : 'hidden'}`}
        poster={thumbnailUrl}
        preload="metadata"
      />

      {!playing && (
        <>
          <img
            src={thumbnailUrl}
            alt={alt || 'Video thumbnail'}
            className="w-full h-full object-contain"
            loading="lazy"
          />
          <button
            onClick={handlePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
            aria-label="Play video"
          >
            <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg hover:bg-white transition-colors">
              <Icon name="video" size={24} className="text-gray-800 ml-1" />
            </div>
          </button>
        </>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <span className="text-white text-sm px-4 text-center">Video playback failed</span>
          <button
            onClick={handleRetry}
            className="text-blue-400 text-sm underline hover:text-blue-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

export { type VideoData };
