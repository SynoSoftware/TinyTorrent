export const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const formatSpeed = (bytes: number) => `${formatBytes(bytes)}/s`;

export const formatTime = (seconds: number) => {
  if (seconds < 0) return "�";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
};

export const formatDate = (timestamp: number) => {
  if (!timestamp || timestamp <= 0) return "-";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "2-digit" }).format(
    new Date(timestamp * 1000)
  );
};
