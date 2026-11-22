import { useState, type ReactNode } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextProps, type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ChevronLeft, ChevronRight, Ellipsis, type LucideIcon } from "lucide-react-native";
import { color, control, font, radius, shadow, space, type } from "@/theme";
import { LANGS, LANG_NAME, MOBILE, type Lang } from "@content/catalogue";

// Pick the face by script: Hind Siliguri for Bengali, Noto Sans JP for Japanese, Inter (or DM Mono) otherwise.
const BN = /[ঀ-৿]/;
const JA = /[぀-ヿ㐀-鿿＀-￯]/;
const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : "";
export function familyFor(s: string, weight: 400 | 500 = 400, mono = false): string {
  if (BN.test(s)) return font.bn[weight];
  if (JA.test(s)) return font.ja[weight];
  return (mono ? font.mono : font.inter)[weight];
}

type Tone = "ink" | "body" | "muted" | "faint" | "alert" | "onPrimary";
const TONE_FOR: Record<keyof typeof type, Tone> = { h1: "ink", h2: "ink", body: "body", row: "ink", label: "body", small: "muted", code: "ink" };

export function T({ v = "body", tone, weight = 400, mono, style, children, ...rest }: TextProps & { v?: keyof typeof type; tone?: Tone; weight?: 400 | 500; mono?: boolean }) {
  return (
    <Text {...rest} style={[type[v], { color: color[tone ?? TONE_FOR[v]], fontFamily: familyFor(textOf(children), weight, mono || v === "code") }, style]}>
      {children}
    </Text>
  );
}

export function Icon({ icon: I, size = control.icon, tone = "ink" }: { icon: LucideIcon; size?: number; tone?: Tone }) {
  return <I size={size} strokeWidth={control.stroke} color={color[tone]} />;
}

type ButtonKind = "primary" | "secondary" | "ghost";
export function Button({ label, onPress, kind = "primary", disabled, busy, icon, block, style }: {
  label: string; onPress?: () => void; kind?: ButtonKind; disabled?: boolean; busy?: boolean; icon?: LucideIcon; block?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const primary = kind === "primary";
  const fg = primary ? "onPrimary" : "ink";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || busy) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: control.height, borderRadius: radius.control, paddingHorizontal: 14, paddingVertical: 8,
          flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
          backgroundColor: primary ? color.primary : kind === "secondary" ? (pressed ? color.selected : color.press) : pressed ? color.press : "transparent",
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
export const Toggle = ({ on, ...p }: { on: boolean } & Omit<Parameters<typeof Button>[0], "kind">) => <Button {...p} kind={on ? "primary" : "secondary"} />;

export function IconButton({ icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => ({ width: 32, height: 32, borderRadius: radius.control, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? color.press : "transparent" })}>
      <Icon icon={icon} size={18} />
    </Pressable>
  );
}

// Sidebar-style list row: 14px label, optional sub line, count pill or meta on the right.
export function Row({ label, sub, icon, count, meta, selected, chevron, onPress }: {
  label: string; sub?: ReactNode; icon?: LucideIcon; count?: number | string; meta?: string; selected?: boolean; chevron?: boolean; onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={label} onPress={onPress} disabled={!onPress}
      style={({ pressed }) => ({
        minHeight: control.rowHeight, paddingHorizontal: space.md, paddingVertical: 8, borderRadius: radius.control,
        flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: selected ? color.selected : pressed ? color.press : "transparent",
      })}>
      {icon && <Icon icon={icon} tone="body" />}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="row" numberOfLines={2}>{label}</T>
        {typeof sub === "string" ? <T v="small">{sub}</T> : sub}
      </View>
      {meta != null && <T v="small" mono>{meta}</T>}
      {count != null && <Pill>{count}</Pill>}
      {chevron && <Icon icon={ChevronRight} size={14} tone="faint" />}
    </Pressable>
  );
}

export const Pill = ({ children }: { children: ReactNode }) => (
  <View style={{ minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: color.press, alignItems: "center", justifyContent: "center" }}>
    <T v="small" mono tone="body">{children}</T>
  </View>
);

export function Tag({ label, value, tone }: { label?: string; value: ReactNode; tone?: "alert" | "solid" }) {
  const solid = tone === "solid";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
      backgroundColor: solid ? color.primary : color.press, borderWidth: tone === "alert" ? 1 : 0, borderColor: color.alert }}>
      {label ? <T v="small" tone={solid ? "onPrimary" : "muted"}>{label}</T> : null}
      <T v="small" weight={500} tone={solid ? "onPrimary" : tone === "alert" ? "alert" : "ink"}>{value}</T>
    </View>
  );
}

export function Card({ title, action, children, style }: { title?: ReactNode; action?: ReactNode; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md }, shadow, style]}>
      {(title || action) && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          {typeof title === "string" ? <T v="h2" style={{ flex: 1 }}>{title}</T> : <View style={{ flex: 1 }}>{title}</View>}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

// An inset block inside a card (original words, confirmed facts, previews).
export const Inset = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ backgroundColor: color.canvas, borderRadius: radius.control, padding: space.md, gap: 6 }, style]}>{children}</View>
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
            borderWidth: 1, borderColor: focus ? "rgba(0,0,0,0.3)" : color.line, borderRadius: radius.control,
            paddingHorizontal: space.md, paddingVertical: 9, minHeight: multiline ? 96 : 40, textAlignVertical: multiline ? "top" : "center",
          },
          style,
        ]}
      />
    </View>
  );
}

export function Notice({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return (
    <View style={{ backgroundColor: color.press, borderRadius: radius.control, padding: space.md, borderLeftWidth: tone === "alert" ? 2 : 0, borderLeftColor: color.alert }}>
      <T v="label" tone={tone === "alert" ? "alert" : "body"}>{children}</T>
    </View>
  );
}

export const Hairline = () => <View style={{ height: 1, backgroundColor: color.line }} />;

// The "···" menu: a bottom sheet of plain rows.
export function Menu({ label, items, closeLabel }: { label: string; closeLabel: string; items: { label: string; onPress: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <IconButton icon={Ellipsis} label={label} onPress={() => setOpen(true)} />
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable accessibilityLabel={closeLabel} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.2)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
          <SafeAreaView edges={["bottom"]} style={{ backgroundColor: color.surface, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, padding: space.sm }}>
            <T v="small" style={{ paddingHorizontal: space.md, paddingVertical: space.sm }}>{label}</T>
            {items.map((it) => <Row key={it.label} label={it.label} onPress={() => { setOpen(false); it.onPress(); }} />)}
          </SafeAreaView>
        </Pressable>
      </Modal>
    </>
  );
}

// Page frame: safe area, small top bar (back, eyebrow, actions), a 28px title, scrolling content with pull-to-refresh.
export function Screen({ title, eyebrow, right, back, backLabel, onRefresh, children }: {
  title?: string; eyebrow?: ReactNode; right?: ReactNode; back?: boolean; backLabel?: string; onRefresh?: () => void; children: ReactNode;
}) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: color.canvas }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, height: 44 }}>
          {back && <IconButton icon={ChevronLeft} label={backLabel ?? MOBILE.back.ja} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm }}>
            {typeof eyebrow === "string" ? <T v="label" numberOfLines={1}>{eyebrow}</T> : eyebrow}
          </View>
          {right}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 48, gap: space.lg }}
          refreshControl={onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await onRefresh(); setRefreshing(false); }} />
          ) : undefined}
        >
          {title ? <T v="h1">{title}</T> : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Brand = () => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
    <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: color.primary, alignItems: "center", justifyContent: "center" }}>
      <T v="small" weight={500} tone="onPrimary">一</T>
    </View>
    <T v="label" weight={500} tone="ink">ichido</T>
  </View>
);

// Two-column label / value, used for machine state and counts.
export function Fact({ label, value, tone }: { label: string; value: ReactNode; tone?: "alert" }) {
  return (
    <View style={{ gap: 2, minWidth: 88 }}>
      <T v="small">{label}</T>
      {typeof value === "string" || typeof value === "number" ? <T v="body" tone={tone ?? "ink"}>{value}</T> : value}
    </View>
  );
}

export function LangPicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="radiogroup">
      {LANGS.map((l) => <Toggle key={l} on={l === lang} label={LANG_NAME[l]} onPress={() => onChange(l)} style={{ flex: 1, paddingHorizontal: 6 }} />)}
    </View>
  );
}

export const Meter =({ value, max }: { value: number; max: number }) => (
  <View style={{ height: 6, borderRadius: 3, backgroundColor: color.press, overflow: "hidden" }}>
    <View style={{ width: `${Math.max(2, (value / Math.max(1, max)) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: color.primary }} />
  </View>
);
