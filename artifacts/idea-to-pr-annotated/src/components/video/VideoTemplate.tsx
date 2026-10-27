import { useEffect, useRef, useState } from 'react';
import { VideoCanvas, type VideoAspectRatio, useVideoPlayer, VideoPausedContext } from '@/lib/video';
import { motion, AnimatePresence } from 'framer-motion';

export const SCENE_DURATIONS = { context: 6500, ask: 5000, test: 8000, pr: 8600 };
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';
const KEYS = Object.keys(SCENE_DURATIONS);
const SCENE_START_SEC: Record<string, number> = {};
{ let c = 0; for (const [k, v] of Object.entries(SCENE_DURATIONS)) { SCENE_START_SEC[k] = c / 1000; c += v; } }

const STEPS = [
  { t: 'Get context from the codebase', d: 'The agent finds past patterns and precedents before touching code.' },
  { t: 'Ask for a change in plain language', d: 'Describe what you want. Paste a reference, quote the copy.' },
  { t: 'Test your change in the cloud', d: 'A live preview runs the change in a real environment.' },
  { t: 'High-quality pull request with video', d: 'The PR lands with a recording of it working.' },
];
// [start, end, step, x, y, w, h] in footage-normalized coords
const BOXES: [number, number, number, number, number, number, number][] = [
  [0.4, 3.7, 0, 0.15, 0.08, 0.216, 0.095],
  [6.6, 11.3, 1, 0.153, 0.365, 0.213, 0.28],
  [11.6, 19.3, 2, 0.374, 0.032, 0.448, 0.935],
  [19.6, 22.0, 3, 0.822, 0.37, 0.165, 0.11],
];

export default function VideoTemplate({ durations = SCENE_DURATIONS, loop = true, paused = false, muted = false, onSceneChange }: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean; muted?: boolean; onSceneChange?: (k: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  useEffect(() => { onSceneChange?.(currentSceneKey); }, [currentSceneKey, onSceneChange]);
  const base = currentSceneKey.replace(/_r[12]$/, '');
  const step = Math.max(0, KEYS.indexOf(base));
  const vRef = useRef<HTMLVideoElement | null>(null);
  const aRef = useRef<HTMLAudioElement | null>(null);
  const last = useRef<string | null>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const v = vRef.current, a = aRef.current;
    if (a) a.volume = 0.45;
    if (paused) { v?.pause(); a?.pause(); return; }
    if (last.current !== currentSceneKey) {
      last.current = currentSceneKey;
      const target = SCENE_START_SEC[base] ?? 0;
      for (const m of [v, a]) if (m && Math.abs(m.currentTime - target) > 0.18) m.currentTime = target;
    }
    v?.play().catch(() => {}); a?.play().catch(() => {});
  }, [currentSceneKey, base, paused, muted]);

  useEffect(() => {
    let id = 0;
    const tick = () => { if (vRef.current) setT(vRef.current.currentTime); id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  const box = BOXES.find((b) => t >= b[0] && t < b[1]);
  const bi = box ? BOXES.indexOf(box) : -1;

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#f4f2ee', fontFamily: 'Geist, sans-serif' }}>
        <div className="absolute inset-0 flex items-center" style={{ paddingLeft: '2.6%', paddingRight: '2.6%', gap: '2.6%' }}>
          <div className="relative overflow-hidden shrink-0" style={{ height: '86%', aspectRatio: '1920 / 1222', borderRadius: '1.1vmin', boxShadow: '0 2vmin 5vmin -2vmin rgba(40,30,20,.35), 0 0 0 1px rgba(40,30,20,.08)', background: '#1b1a22' }}>
            <video ref={vRef} src={`${import.meta.env.BASE_URL}raw.mp4`} muted playsInline autoPlay preload="auto" className="absolute inset-0 w-full h-full" style={{ objectFit: 'contain' }} />
            <AnimatePresence>
              {box && (
                <motion.div key={bi} className="absolute"
                  initial={{ opacity: 0, scale: 1.06 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                  style={{ left: `${box[3] * 100}%`, top: `${box[4] * 100}%`, width: `${box[5] * 100}%`, height: `${box[6] * 100}%`, borderRadius: '0.9vmin', boxShadow: '0 0 0 9999px rgba(28,24,30,.42)', outline: '0.32vmin solid #f2501d', outlineOffset: '0.2vmin' }}>
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 18, delay: 0.2 }}
                    className="absolute flex items-center justify-center text-white font-semibold"
                    style={{ left: '-1.7vmin', top: '-1.7vmin', width: '3.6vmin', height: '3.6vmin', borderRadius: '50%', background: '#f2501d', fontSize: '1.9vmin', boxShadow: '0 0 0 0.4vmin rgba(242,80,29,.25)' }}>
                    {box[2] + 1}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex flex-col flex-1 min-w-0" style={{ gap: '4.5vmin' }}>
            {STEPS.map((s, i) => (
              <motion.div key={i} animate={{ opacity: i === step ? 1 : 0.32, y: i === step ? 0 : 4 }} transition={{ duration: 0.4 }}>
                <div className="flex items-center justify-center text-white font-semibold" style={{ width: '3vmin', height: '3vmin', borderRadius: '50%', background: '#f2501d', fontSize: '1.6vmin' }}>{i + 1}</div>
                <div style={{ fontSize: '2.3vmin', fontWeight: 500, color: '#1d1a1f', marginTop: '1.3vmin', letterSpacing: '-0.01em' }}>{s.t}</div>
                <div style={{ fontSize: '1.6vmin', color: '#7a7470', marginTop: '0.5vmin', lineHeight: 1.35 }}>{s.d}</div>
              </motion.div>
            ))}
          </div>
        </div>
        <audio ref={aRef} src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`} preload="auto" autoPlay muted={muted} />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
