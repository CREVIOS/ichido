import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  AccessibilityInfo, ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { router } from "expo-router";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Ellipsis, Languages, type LucideIcon } from "lucide-react-native";
import { color, control, dot, font, radius, shadow, space, tier, tint, type, type TintKey } from "@/theme";
import { LANGS, LANG_NAME, MOBILE, UI, type Lang } from "@content/catalogue";
import { BUBBLE, ICHI } from "@/components/mark";

// Pick the face by script: Hind Siliguri for Bengali, Noto Sans Devanagari for Nepali, Noto Sans JP for Japanese,
// Inter (or DM Mono) otherwise; Inter covers Vietnamese and Indonesian.
const BN = /[ঀ-৿]/;
const NE = /[ऀ-ॿ]/;
const JA = /[぀-ヿ㐀-鿿＀-￯]/;
const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "";
export function familyFor(s: string, weight: 400 | 500 = 400, mono = false): string {
  if (BN.test(s)) return font.bn[weight];
  if (NE.test(s)) return font.ne[weight];
  if (JA.test(s)) return font.ja[weight];
  return (mono ? font.mono : font.inter)[weight];
}

type Tone = "ink" | "body" | "muted" | "faint" | "alert" | "warn" | "ok" | "info" | "onPrimary";
const TONE_FOR: Record<keyof typeof type, Tone> = { h1: "ink", h2: "ink", big: "ink", body: "body", row: "ink", label: "body", small: "muted", tiny: "muted", code: "ink" };

// The caller's "large text" setting scales every T below it.
export const TextScale = createContext(1);

export function LiveText({ children }: { children:string }) {
  useEffect(() => {
    if (children && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(children);
  }, [children]);
  return <T accessibilityLiveRegion="polite">{children}</T>;
}

export function T({ v = "body", tone, weight = 400, mono, style, children, ...rest }: TextProps & { v?: keyof typeof type; tone?: Tone; weight?: 400 | 500; mono?: boolean }) {
  const k = useContext(TextScale);
  const base: TextStyle = type[v];
  const scaled = k === 1 ? base : { ...base, fontSize: (base.fontSize ?? 15) * k, lineHeight: base.lineHeight && base.lineHeight * k };
  return (
    <Text {...rest} style={[scaled, { color: color[tone ?? TONE_FOR[v]], fontFamily: familyFor(textOf(children), weight, mono || v === "code" || v === "big") }, style]}>
      {children}
    </Text>
  );
}

export function Icon({ icon: I, size = control.icon, tone = "ink" }: { icon: LucideIcon; size?: number; tone?: Tone }) {
  return <I size={size} strokeWidth={control.stroke} color={color[tone]} />;
}

// The Ichido mark: a speech bubble holding one brush stroke, 一. Same paths as web/components/mark.tsx.
export function Mark({ size = 18, fill = color.ink }: { size?: number; fill?: string }) {
  return (
    <Svg width={size} height={(size * 17) / 20} viewBox="0 0 20 17" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={BUBBLE} fill="none" stroke={fill} strokeWidth={1.5} strokeLinejoin="round" />
      <Path d={ICHI} fill={fill} />
    </Svg>
  );
}

export const Brand = () => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel="Ichido">
    <Mark />
    <Text style={{ fontFamily: font.inter[400], fontSize: 17, lineHeight: 20, letterSpacing: -0.6, color: color.ink }}>Ichido</Text>
  </View>
);

type ButtonKind = "primary" | "secondary" | "ghost";
export function Button({ label, accessibilityLabel, onPress, kind = "primary", disabled, busy, selected, icon, block, style }: {
  label: string; accessibilityLabel?: string; onPress?: () => void; kind?: ButtonKind; disabled?: boolean; busy?: boolean; selected?:boolean; icon?: LucideIcon; block?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const primary = kind === "primary";
  const fg = primary ? "onPrimary" : "ink";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || busy), selected }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: control.height, borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          backgroundColor: primary ? color.primary : kind === "secondary" ? (pressed ? color.press : color.surface) : pressed ? color.press : "transparent",
          borderWidth: kind === "secondary" ? 1 : 0, borderColor: color.line,
          opacity: disabled ? 0.35 : primary && pressed ? 0.85 : 1,
        },
        block && { alignSelf: "stretch" },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={color[fg]} /> : icon ? <Icon icon={icon} size={14} tone={fg} /> : null}
      <T v="label" weight={500} tone={fg} style={{ textAlign: "center", flexShrink: 1 }}>{label}</T>
    </Pressable>
  );
}

// A choice that stays visibly selected (yes / no / not sure, wait / leave, periods).
export const Toggle = ({ on, ...p }: { on: boolean } & Omit<Parameters<typeof Button>[0], "kind">) => <Button {...p} selected={on} kind={on ? "primary" : "secondary"} />;

// Small segmented control (periods): a hairline track with the selected segment on white.
export function Segments<K extends string | number>({ value, options, onChange }: { value: K; options: { key: K; label: string }[]; onChange: (k: K) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: "row", padding: 2, gap: 2, borderRadius: radius.control + 2, backgroundColor: color.press, borderWidth: 1, borderColor: color.line }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => onChange(o.key)}
            style={[{ flex: 1, height: 28, alignItems: "center", justifyContent: "center", borderRadius: radius.control }, on && { backgroundColor: color.surface, ...shadow }]}>
            <T v="label" tone={on ? "ink" : "muted"}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.control, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.press : "transparent" })}>
      <Icon icon={icon} size={18} tone="body" />
    </Pressable>
  );
}

// Status dot, as in the web sidebar list.
export const Dot = ({ s }: { s: string }) => <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot[s] ?? color.faint }} />;

// Sidebar-style list row: optional dot or icon, 14px label, optional sub line, count or meta on the right.
export function Row({ label, sub, icon, status, count, meta, metaTone, selected, chevron, onPress }: {
  label: string; sub?: ReactNode; icon?: LucideIcon; status?: string; count?: number | string; meta?: string; metaTone?: Tone; selected?: boolean; chevron?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label} accessibilityState={{selected}} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({
        minHeight: control.rowHeight, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.control,
        flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: selected ? color.selected : pressed ? color.press : "transparent",
      })}>
      {icon && <Icon icon={icon} tone="body" />}
      {status && <Dot s={status} />}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="row" numberOfLines={2}>{label}</T>
        {typeof sub === "string" ? <T v="small">{sub}</T> : sub}
      </View>
      {meta != null && <T v="tiny" mono tone={metaTone ?? "muted"}>{meta}</T>}
      {count != null && <Count>{count}</Count>}
      {chevron && <Icon icon={ChevronRight} size={14} tone="faint" />}
    </Pressable>
  );
}

export const Count = ({ children }: { children: ReactNode }) => (
  <View style={{ minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 4, backgroundColor: color.press, alignItems: "center", justifyContent: "center" }}>
    <T v="tiny" mono>{children}</T>
  </View>
);

// Tinted status pill: colour carries the state, the word carries the meaning.
export const Pill = ({ tone = "neutral", children }: { tone?: TintKey | string; children: ReactNode }) => {
  const t = tint[tone as TintKey] ?? tint.neutral;
  return (
    <View style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.control, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}>
      <T v="label" style={{ color: t.fg }} numberOfLines={1}>{children}</T>
    </View>
  );
};

// Small grey token for metadata (web Chip), with an optional muted label.
export function Tag({ label, value }: { label?: string; value: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", height: 20, paddingHorizontal: 6, borderRadius: radius.chip, backgroundColor: color.press }}>
      {label ? <T v="small" tone="muted">{label}</T> : null}
      <T v="small" tone="body">{value}</T>
    </View>
  );
}

// Segmented score bar: filled segments out of `of`, coloured by tier (web SegBar).
export function SegBar({ value, of = 6, label }: { value: number; of?: number; label?: ReactNode }) {
  const c = value / of >= 0.8 ? tier.high : value / of >= 0.5 ? tier.mid : tier.low;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 3 }} accessibilityElementsHidden>
        {Array.from({ length: of }, (_, i) => <View key={i} style={{ height: 3, width: 10, borderRadius: 2, backgroundColor: i < value ? c : color.track }} />)}
      </View>
      {label != null && <T v="label" mono tone="muted">{label}</T>}
    </View>
  );
}

// A white surface; the title is a quiet 13px label, as in the web Panel.
export function Card({ title, action, children, style }: { title?: ReactNode; action?: ReactNode; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: color.surface, borderRadius: radius.card, padding: space.lg, gap: space.md }, style]}>
      {(title || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 24 }}>
          {typeof title === "string" ? <T v="row" weight={500} style={{ flex: 1 }}>{title}</T> : <View style={{ flex: 1 }}>{title}</View>}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

// An inset block inside a card (original words, confirmed facts, previews).
export const Inset = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: color.canvas, borderRadius: radius.control + 2, padding: space.md, gap: 6 }, style]}>{children}</View>
);

export function Section({ label, right, children }: { label: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <T v="small">{label}</T>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Input({ label, value, mono, multiline, style, ...rest }: TextInputProps & { label?: string; mono?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? <T v="label">{label}</T> : null}
      <TextInput
        {...rest}
        value={value}
        multiline={multiline}
        accessibilityLabel={label ?? rest.accessibilityLabel}
        placeholderTextColor={color.faint}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[
          type.body,
          {
            fontFamily: familyFor(value || rest.placeholder || "", 400, mono), color: color.ink, backgroundColor: color.surface,
            borderWidth: 1, borderColor: focus ? "rgba(0,0,0,0.25)" : color.track, borderRadius: radius.control,
            paddingHorizontal: space.md, paddingVertical: 9, minHeight: multiline ? 96 : 40, textAlignVertical: multiline ? "top" : "center",
          },
          style,
        ]}
      />
    </View>
  );
}

// Quiet message block; alert / warn / info are tinted like the web Notice.
export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "alert" | "warn" | "info" }) {
  const t = tint[tone];
  return (
    <View style={{ backgroundColor: t.bg, borderRadius: radius.control + 2, paddingHorizontal: space.md, paddingVertical: 10 }}>
      <T v="row" style={{ color: t.fg }}>{children}</T>
    </View>
  );
}

export const Hairline = () => <View style={{ height: 1, backgroundColor: color.line }} />;

// The "···" menu: a bottom sheet of plain rows.
export function Menu({ label, items, closeLabel, icon = Ellipsis }: { label: string; closeLabel: string; icon?: LucideIcon; items: { label: string; selected?: boolean; onPress: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <IconButton icon={icon} label={label} onPress={() => setOpen(true)} />
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={closeLabel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.sm }}>
            <T v="small" style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>{label}</T>
            {items.map((it) => <Row key={it.label} label={it.label} selected={it.selected} icon={it.selected ? Check : undefined} onPress={() => { setOpen(false); it.onPress(); }} />)}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

// Page frame: safe area, a hairline top bar (back, eyebrow, actions), a 28px title, scrolling content with pull-to-refresh.
export function Screen({ title, eyebrow, right, pinned, back, backLabel, onRefresh, children, fixed }: {
  fixed?:boolean; title?: string; eyebrow?: ReactNode; right?: ReactNode; pinned?: ReactNode; back?: boolean; backLabel?: string; onRefresh?: () => void; children: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView edges={fixed ? ["top","bottom"] : ["top"]} style={{ flex: 1, backgroundColor: fixed ? color.surface : color.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, height: 48, borderBottomWidth: 1, borderBottomColor: color.line }}>
          {back && <IconButton icon={ChevronLeft} label={backLabel ?? MOBILE.back.ja} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm, paddingLeft: back ? 0 : 4 }}>
            {typeof eyebrow === "string" ? <T v="label" numberOfLines={1}>{eyebrow}</T> : eyebrow}
          </View>
          {right}
        </View>
        {pinned && <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>{pinned}</View>}
        {fixed ? children : <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: 48, gap: space.lg }}
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} />
          ) : undefined}
        >
          {title ? <T v="h1">{title}</T> : null}
          {children}
        </ScrollView>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Breadcrumb for the top bar: "Section / Page", the last part in ink.
export const Crumb = ({ parts }: { parts: string[] }) => (
  <T v="label" numberOfLines={1} tone="muted">
    {parts.map((p, i) => (i < parts.length - 1 ? `${p} / ` : null))}
    <T v="label" tone="ink">{parts.at(-1)}</T>
  </T>
);

// Label over value, used for machine state and counts.
export function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: Tone }) {
  return (
    <View style={{ gap: 2, minWidth: 88 }}>
      <T v="small">{label}</T>
      {typeof value === "string" || typeof value === "number" ? <T v="row" tone={tone ?? "ink"}>{value}</T> : value}
    </View>
  );
}

// One compact picker: the current language; tap to open the list, pick one, it closes. Names in their own script.
export function LangPicker({ lang, onChange, compact }: { lang: Lang; onChange: (l: Lang) => void; compact?:boolean }) {
  const [open, setOpen] = useState(false);
  if (compact) return <Menu label={UI.language[lang]} closeLabel={MOBILE.back[lang]} icon={Languages}
    items={LANGS.map(l => ({label:LANG_NAME[l],selected:l===lang,onPress:()=>onChange(l)}))}/>;
  return (
    <View style={{ alignSelf: "stretch" }}>
      <Pressable accessibilityRole="button" accessibilityLabel={UI.language[lang]} accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.control,
          backgroundColor: pressed ? color.press : color.surface, borderWidth: 1, borderColor: color.line })}>
        <Languages size={16} strokeWidth={1.5} color={color.muted} />
        <Text style={[type.body, { flex: 1, color: color.ink }]}>{LANG_NAME[lang]}</Text>
        <ChevronDown size={16} strokeWidth={1.5} color={color.muted} style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }} />
      </Pressable>
      {open && (
        <View accessibilityRole="radiogroup" style={{ marginTop: 6, borderRadius: radius.control, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface, overflow: "hidden" }}>
          {LANGS.map((l, i) => (
            <Pressable key={l} accessibilityRole="radio" accessibilityState={{ checked: l === lang }} onPress={() => { onChange(l); setOpen(false); }}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", height: control.height, paddingHorizontal: space.md,
                backgroundColor: pressed ? color.press : "transparent", borderTopWidth: i ? 1 : 0, borderTopColor: color.line })}>
              <Text style={[type.body, { flex: 1, color: color.ink }]}>{LANG_NAME[l]}</Text>
              {l === lang && <Check size={16} strokeWidth={1.5} color={color.ink} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export const Meter = ({ value, max, fill = color.ink }: { value: number; max: number; fill?: string }) => (
  <View style={{ height: 6, borderRadius: 3, backgroundColor: color.press, overflow: "hidden" }}>
    <View style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: fill, opacity: fill === color.ink ? 0.8 : 1 }} />
  </View>
);
