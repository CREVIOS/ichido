// Design tokens. Quiet, precise, monochrome: one canvas, white surfaces, hairlines, near-black actions.
export const color = {
  canvas: "#F5F5F5",
  surface: "#FFFFFF",
  line: "rgba(0,0,0,0.08)",
  ink: "rgba(0,0,0,0.85)",
  body: "rgba(0,0,0,0.6)",
  muted: "rgba(0,0,0,0.5)",
  faint: "rgba(0,0,0,0.25)",
  press: "rgba(0,0,0,0.04)",
  selected: "rgba(0,0,0,0.06)",
  primary: "#0A0A0A",
  onPrimary: "#FFFFFF",
  // The only accent: alerts that need a person (fault, wants a human, withheld text).
  alert: "#B42318",
} as const;

export const radius = { control: 6, card: 10, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const font = {
  inter: { 400: "Inter_400Regular", 500: "Inter_500Medium" },
  ja: { 400: "NotoSansJP_400Regular", 500: "NotoSansJP_500Medium" },
  bn: { 400: "HindSiliguri_400Regular", 500: "HindSiliguri_500Medium" },
  mono: { 400: "DMMono_400Regular", 500: "DMMono_500Medium" },
} as const;

export const type = {
  h1: { fontSize: 28, lineHeight: 34, letterSpacing: -0.84 },
  h2: { fontSize: 17, lineHeight: 24, letterSpacing: -0.34 },
  body: { fontSize: 15, lineHeight: 22 },
  row: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, lineHeight: 18 },
  small: { fontSize: 12, lineHeight: 16 },
  code: { fontSize: 30, lineHeight: 38, letterSpacing: 4 },
} as const;

export const control = { height: 36, rowHeight: 40, icon: 16, stroke: 1.5 } as const;

export const shadow = {
  shadowColor: "#000",
  shadowOpacity: 0.04,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
} as const;
