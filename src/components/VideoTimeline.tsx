import { useState, useRef, useCallback, useEffect } from "react";

interface VideoTimelineProps {
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
  markers?: { time: number; label: string }[];
}

const VideoTimeline = ({
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onTrimChange,
  onSeek,
  markers = [],
}: VideoTimelineProps) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "playhead" | null>(null);

  const getTimeFromX = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * duration;
    },
    [duration]
  );

  const handlePointerDown = useCallback(
    (type: "start" | "end" | "playhead", e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(type);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const time = getTimeFromX(e.clientX);

      if (dragging === "start") {
        onTrimChange(Math.min(time, trimEnd - 1), trimEnd);
      } else if (dragging === "end") {
        onTrimChange(trimStart, Math.max(time, trimStart + 1));
      } else if (dragging === "playhead") {
        onSeek(time);
      }
    },
    [dragging, getTimeFromX, trimStart, trimEnd, onTrimChange, onSeek]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (dragging) return;
      const time = getTimeFromX(e.clientX);
      onSeek(time);
    },
    [dragging, getTimeFromX, onSeek]
  );

  const toPercent = (time: number) => (duration > 0 ? (time / duration) * 100 : 0);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full select-none">
      {/* Time labels */}
      <div className="flex justify-between text-xs text-muted-foreground mb-1 px-1">
        <span>{formatTime(trimStart)}</span>
        <span className="text-primary font-medium">{formatTime(currentTime)}</span>
        <span>{formatTime(trimEnd)}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-12 bg-secondary/60 rounded-lg cursor-pointer overflow-hidden"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Inactive regions */}
        <div
          className="absolute top-0 left-0 h-full bg-background/70 z-10 pointer-events-none"
          style={{ width: `${toPercent(trimStart)}%` }}
        />
        <div
          className="absolute top-0 right-0 h-full bg-background/70 z-10 pointer-events-none"
          style={{ width: `${100 - toPercent(trimEnd)}%` }}
        />

        {/* Active region */}
        <div
          className="absolute top-0 h-full bg-primary/15 border-y-2 border-primary/40 z-10 pointer-events-none"
          style={{
            left: `${toPercent(trimStart)}%`,
            width: `${toPercent(trimEnd) - toPercent(trimStart)}%`,
          }}
        />

        {/* Markers */}
        {markers.map((m, i) => (
          <div
            key={i}
            className="absolute top-0 h-full w-0.5 bg-accent/60 z-20 pointer-events-none"
            style={{ left: `${toPercent(m.time)}%` }}
            title={m.label}
          />
        ))}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full w-0.5 bg-foreground z-30 pointer-events-none"
          style={{ left: `${toPercent(currentTime)}%` }}
        >
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-foreground rounded-full" />
        </div>

        {/* Start handle */}
        <div
          className="absolute top-0 h-full w-4 z-30 cursor-col-resize flex items-center justify-center group"
          style={{ left: `calc(${toPercent(trimStart)}% - 8px)` }}
          onPointerDown={(e) => handlePointerDown("start", e)}
        >
          <div className="w-1 h-8 bg-primary rounded-full group-hover:bg-primary/80 transition-colors" />
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 h-full w-4 z-30 cursor-col-resize flex items-center justify-center group"
          style={{ left: `calc(${toPercent(trimEnd)}% - 8px)` }}
          onPointerDown={(e) => handlePointerDown("end", e)}
        >
          <div className="w-1 h-8 bg-primary rounded-full group-hover:bg-primary/80 transition-colors" />
        </div>
      </div>

      {/* Duration label */}
      <div className="flex justify-between text-xs text-muted-foreground mt-1 px-1">
        <span>0:00</span>
        <span>Seleção: {formatTime(trimEnd - trimStart)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
};

export default VideoTimeline;
