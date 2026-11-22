// Design tokens, matching web/app/globals.css (Lightfield look): off-white canvas, white surfaces, hairlines,
// near-black actions. Colour is reserved for state (a dot, a tinted pill, a chart series), never decoration.
// The web defines these in oklch; React Native needs sRGB, so each value below is the web token converted.
export const color = {
  canvas: "#F5F5F5",
  surface: "#FFFFFF",
  line: "rgba(0,0,0,0.08)",
  ink: "rgba(0,0,0,0.85)",
  body: "rgba(0,0,0,0.6)",
  muted: "rgba(0,0,0,0.5)",
  faint: "rgba(0,0,0,0.32)",
  press: "rgba(0,0,0,0.04)",
  selected: "rgba(0,0,0,0.05)",
  track: "rgba(0,0,0,0.1)",
  primary: "#0A0A0A",
  onPrimary: "#FFFFFF",
  // State colours: --warn, --info, --ok, --alert and the field dot.
  warn: "#DC932E",
  info: "#3A84CA",
  ok: "#349D62",
  alert: "#DB423C",
  violet: "#725EC2",
  // Selected metric card ring (oklch 0.8 0.07 255).
  focus: "#A0C0EB",
} as const;

// Chart series, as web/components/charts.tsx BLUE and GREEN.
export const chart = { blue: "#5294E6", green: "#5BBE62" } as const;

// Tinted status pills (web/components/charts.tsx TINT): background and text per state.
export const tint = {
  received: { bg: "#FFF3DB", fg: "#875814" },
  review: { bg: "#E6F4FF", fg: "#285E9F" },
  field: { bg: "#F3EEFF", fg: "#644B9E" },
  guided: { bg: "#E0FAE4", fg: "#236436" },
  alert: { bg: "#FFECE9", fg: "#AF3C3A" },
  warn: { bg: "#FFF2E0", fg: "#7D460B" },
  info: { bg: "#EBF7FF", fg: "#194F81" },
  neutral: { bg: "rgba(0,0,0,0.04)", fg: "rgba(0,0,0,0.6)" },
} as const;
export type TintKey = keyof typeof tint;

// Status dot (web .dot[data-s]) and segmented-bar tiers (web SegBar).
export const dot: Record<string, string> = { received: color.warn, review: color.info, field: color.violet, guided: color.ok, alert: color.alert };
export const tier = { high: "#4CB86A", mid: "#E7B643", low: "#EF6661" } as const;

export const radius = { control: 6, chip: 5, card: 12, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  inter: { 400: "Inter_400Regular", 500: "Inter_500Medium" },
  ja: { 400: "NotoSansJP_400Regular", 500: "NotoSansJP_500Medium" },
  bn: { 400: "HindSiliguri_400Regular", 500: "HindSiliguri_500Medium" },
  mono: { 400: "DMMono_400Regular", 500: "DMMono_500Medium" },
} as const;

// Headings are Inter 400 with −3% tracking; numbers use DM Mono.
export const type = {
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.84 },
  h2: { fontSize: 17, lineHeight: 24, letterSpacing: -0.51 },
  big: { fontSize: 40, lineHeight: 44, letterSpacing: -1.6 },
  body: { fontSize: 15, lineHeight: 22 },
  row: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, lineHeight: 18 },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 11, lineHeight: 14 },
  code: { fontSize: 30, lineHeight: 38, letterSpacing: 4 },
} as const;

export const control = { height: 36, rowHeight: 40, icon: 16, stroke: 1.5 } as const;

// web .surface: 0 1px 2px oklch(0 0 0 / 0.03).
export const shadow = {
  shadowColor: "#000",
  shadowOpacity: 0.03,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
