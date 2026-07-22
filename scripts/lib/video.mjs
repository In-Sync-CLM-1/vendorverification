// ffmpeg/ffprobe helpers (scoop install).
import { execFileSync } from 'child_process';

const FF = 'C:\\Users\\Admin\\scoop\\shims\\ffmpeg.exe';
const FP = 'C:\\Users\\Admin\\scoop\\shims\\ffprobe.exe';

export function duration(path) {
  return parseFloat(
    execFileSync(FP, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path])
      .toString().trim(),
  );
}

// Hold the last frame for `hold` seconds (silence) and fade video+audio to black
// over the last `fade` seconds — a graceful outro so the end card doesn't cut abruptly.
export function holdAndFade(src, dst, hold = 2.0, fade = 1.2) {
  const d0 = duration(src);
  const total = d0 + hold;
  const st = (total - fade).toFixed(2);
  const vf = `tpad=stop_mode=clone:stop_duration=${hold},fade=t=out:st=${st}:d=${fade}`;
  const af = `apad=pad_dur=${hold},afade=t=out:st=${st}:d=${fade}`;
  execFileSync(FF, ['-y', '-i', src, '-vf', vf, '-af', af,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart', dst]);
  return dst;
}
