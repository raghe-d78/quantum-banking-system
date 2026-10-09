// Minimal inline SVG icon set (no external font). Usage: <Icon name="send" size={18} />
const PATHS = {
  home:     "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  send:     "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  receipt:  "M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5",
  clock:    "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  user:     "M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  chevronL: "m15 18-6-6 6-6",
  chevronR: "m9 18 6-6-6-6",
  check:    "M20 6 9 17l-5-5",
  alert:    "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  shield:   "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  zap:      "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  arrowUp:  "M12 19V5M5 12l7-7 7 7",
  arrowDn:  "M12 5v14M19 12l-7 7-7-7",
  bolt:     "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  wifi:     "M5 12.5a11 11 0 0 1 14 0M8.5 16a6 6 0 0 1 7 0M12 20h.01M2 8.8a16 16 0 0 1 20 0",
  cart:     "M3 3h2l2.6 12.4a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L22 7H6M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM19 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  cash:     "M2 7h20v10H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01",
  copy:     "M8 8h12v12H8zM4 16V4h12",
  refresh:  "M21 12a9 9 0 1 1-3-6.7M21 3v6h-6",
  search:   "M21 21l-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z",
  download: "M12 3v12M6 11l6 6 6-6M4 21h16",
  lock:     "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  plus:     "M12 5v14M5 12h14",
  x:        "M18 6 6 18M6 6l12 12",
};

export default function Icon({ name, size = 18, stroke = 1.8, style, className }) {
  const d = PATHS[name] || PATHS.alert;
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
