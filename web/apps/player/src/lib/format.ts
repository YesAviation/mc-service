/** Format seconds to mm:ss */
export function formatDuration(secs: number): string {
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Format seconds to h:mm:ss if over an hour, else mm:ss */
export function formatTime(secs: number): string {
  if (secs >= 3600) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = Math.floor(secs % 60);
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return formatDuration(secs);
}
