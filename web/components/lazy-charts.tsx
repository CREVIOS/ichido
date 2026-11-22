"use client";
import dynamic from "next/dynamic";

// The chart library loads only when a marketing preview scrolls into use, not with the page's first paint.
const box = (h: string) => function Placeholder() { return <div className={`${h} w-full rounded-lg bg-secondary/60`} />; };
export const DailyArea = dynamic(() => import("@/components/insight-charts").then((m) => m.DailyArea), { ssr: false, loading: box("h-[96px]") });
export const ReplyLine = dynamic(() => import("@/components/insight-charts").then((m) => m.ReplyLine), { ssr: false, loading: box("h-[300px]") });
export const FunnelBars = dynamic(() => import("@/components/insight-charts").then((m) => m.FunnelBars), { ssr: false, loading: box("h-[280px]") });
export const Donut = dynamic(() => import("@/components/insight-charts").then((m) => m.Donut), { ssr: false, loading: box("h-[260px]") });
export const HourBars = dynamic(() => import("@/components/insight-charts").then((m) => m.HourBars), { ssr: false, loading: box("h-[260px]") });
