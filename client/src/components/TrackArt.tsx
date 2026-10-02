import { useRef, useState, useEffect } from "react";

interface TrackArtProps {
  artworkUrl?: string;
  previewUrl?: string;
  spotifyUri?: string;
  title: string;
  size?: "sm" | "md";
  /** Shared ref — when a new preview starts, any other playing audio should stop */
  sharedAudio?: { current: HTMLAudioElement | null };
}

/**
 * Album art that optionally shows a ▶/⏸ preview button and/or a Spotify deep-link.
 * Falls back to a placeholder ♫ icon when no art is available.
 */
export default function TrackArt({
  artworkUrl,
  previewUrl,
  spotifyUri,
  title,
  size = "md",
  sharedAudio,
}: TrackArtProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function togglePreview(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }

    // Stop whatever else is playing
    if (sharedAudio?.current && sharedAudio.current !== audioRef.current) {
      sharedAudio.current.pause();
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(previewUrl);
      audioRef.current.addEventListener("ended", () => setPlaying(false));
    }

    if (sharedAudio) sharedAudio.current = audioRef.current;

    audioRef.current.currentTime = 0;
    audioRef.current.play().then(() => setPlaying(true)).catch(() => {});
  }

  const cls = `track-art track-art--${size}`;
  const hasPreview = Boolean(previewUrl);
  const hasLink = Boolean(spotifyUri);

  const inner = artworkUrl ? (
    <img src={artworkUrl} alt={title} className="track-art__img" />
  ) : (
    <span className="track-art__placeholder">♫</span>
  );
  const previewBtn = hasPreview && (
    <button
      className={`track-art__preview${playing ? " track-art__preview--playing" : ""}`}
      onClick={togglePreview}
      title={playing ? "Pause preview" : "Play 30s preview"}
    >
      {playing ? "⏸" : "▶"}
    </button>
  );

  // If there's a Spotify URI but no preview, the whole art becomes a link
  if (!hasPreview && hasLink) {
    return (
      <a
        href={`https://open.spotify.com/track/${spotifyUri?.replace("spotify:track:", "")}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
        title="Open in Spotify"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
        <span className="track-art__spotify-hint">↗</span>
      </a>
    );
  }

  return (
    <div className={cls}>
      {inner}
      {previewBtn}
    </div>
  );
}
