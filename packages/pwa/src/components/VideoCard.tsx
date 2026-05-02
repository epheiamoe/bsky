import React, { useState, useRef, useCallback } from 'react';
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
  const hlsRef = useRef<unknown>(null);

  const handlePlay = useCallback(async () => {
    setPlaying(true);
    setError(false);

    if (!videoRef.current) return;

    try {
      const Hls = (await import('hls.js')).default;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(playlistUrl);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.ERROR, () => setError(true));
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = playlistUrl;
      } else {
        setError(true);
        return;
      }

      await videoRef.current.play();
    } catch {
      setError(true);
    }
  }, [playlistUrl]);

  const containerStyle: React.CSSProperties = {
    maxHeight: '560px',
    width: '100%',
    ...(aspectRatio && aspectRatio.width && aspectRatio.height
      ? { aspectRatio: `${aspectRatio.width}/${aspectRatio.height}` }
      : {}),
  };

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-border relative bg-black" style={containerStyle}>
      {!playing ? (
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
      ) : (
        <video
          ref={videoRef}
          controls
          playsInline
          className="w-full h-full"
          poster={thumbnailUrl}
          preload="metadata"
        />
      )}
      {error && playing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <span className="text-white text-sm px-4 text-center">Video playback failed</span>
        </div>
      )}
    </div>
  );
}

export { type VideoData };
