import Link from "next/link";
import { CalendarClock, CircleDot, Landmark, Languages, Timer, UserRound, type LucideIcon } from "lucide-react";
import { Pill, SegBar } from "@/components/charts";
import { CASES, DESK, INSIGHTS, NAV } from "@/content/staff";
import { firstReplySeconds, replySegments, type HistoryRow } from "./history";

const columns: [LucideIcon, string][] = [
  [Landmark, DESK.facts.atm], [Timer, CASES.firstReply], [CircleDot, CASES.status],
  [Languages, CASES.language], [UserRound, CASES.operator], [CalendarClock, DESK.facts.at],
];
const received = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" });

export function CaseTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={NAV.cases} className="w-full whitespace-nowrap text-left text-[13px] [&_td]:px-4 [&_th]:px-4">
        <thead className="border-b bg-secondary/60 text-[12px] text-muted-foreground">
          <tr>{columns.map(([Icon, title]) => (
            <th scope="col" key={title} className="h-9 font-normal">
              <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5 stroke-[1.5]" />{title}</span>
            </th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((row) => {
          const seconds = firstReplySeconds(row);
          const state = row.abandoned ? "abandoned" : row.finished_at ? "done" : "open";
          return (
            <tr key={row.id} className="relative h-12 border-b hover:bg-accent focus-within:bg-accent">
              <td>
                <Link href={`/operator#${row.id}`} prefetch={false}
                  className="flex flex-col items-start leading-tight after:absolute after:inset-0 focus-visible:underline">
                  <span className="text-[14px] text-foreground">{row.atm.label.ja}</span>
                  <span className="mono mt-0.5 text-muted-foreground">{row.station}</span>
                </Link>
              </td>
              <td><SegBar value={replySegments(seconds)} label={seconds === null ? CASES.missing : INSIGHTS.duration(seconds)} /></td>
              <td><Pill tone={row.abandoned ? "alert" : row.status}>{CASES.statuses[state]}</Pill></td>
              <td>{row.lang ? CASES.languages[row.lang] : CASES.missing}</td>
              <td>{row.case_event[0]?.actor_name || CASES.missing}</td>
              <td className="num text-muted-foreground"><time dateTime={row.created_at}>{received.format(new Date(row.created_at))}</time></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
