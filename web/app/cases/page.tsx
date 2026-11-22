"use client";
import { useCallback, useState } from "react";
import { Download, Table } from "lucide-react";
import { toast } from "sonner";
import { AppShell, Chip, Notice, Panel } from "@/components/kit";
import { StaffGate, MeFooter, navFor, type Me } from "@/components/StaffGate";
import { Button } from "@/components/ui/button";
import { CASES, NAV } from "@/content/staff";
import { useLive } from "@/lib/live";
import { sb } from "@/lib/supabase";
import { CaseFilters } from "./filters";
import { allCases, historyCsv, PAGE_SIZE, readHistory, type Filters, type HistoryRow } from "./history";
import { CaseTable } from "./table";

export default function CasesPage() {
  return <StaffGate need="case:read" title={NAV.cases}>{(me) => <History me={me} />}</StaffGate>;
}

function History({ me }: { me: Me }) {
  const [filters, setFilters] = useState(allCases);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [result, setResult] = useState<{ rows: HistoryRow[]; limit: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const rows = await readHistory(sb(), filters, limit + 1, signal);
      if (signal.aborted) return;
      setResult({ rows, limit });
      setFailed(false);
    } catch {
      if (signal.aborted) return;
      setFailed(true);
    }
  }, [filters, limit]);
  useLive(["desk", "case_event", "reply"], load);

  function filter(next: Filters) {
    setFilters(next);
    setLimit(PAGE_SIZE);
    setResult(null);
    setFailed(false);
  }

  async function download() {
    setExporting(true);
    try {
      const rows = await readHistory(sb(), filters, Infinity);
      const url = URL.createObjectURL(new Blob([historyCsv(rows)], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = CASES.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error(CASES.exportError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <AppShell nav={navFor(me.role)} footer={<MeFooter me={me} />}
      title={<span className="flex items-center gap-3">{NAV.cases}<Chip><Table className="size-3 stroke-[1.5]" />{CASES.all}</Chip></span>}
      actions={<Button variant="outline" size="sm" onClick={download} disabled={exporting}><Download />{CASES.export}</Button>}>
      <Panel className="gap-0">
        <CaseFilters filters={filters} change={filter} />
        {failed && <div className="p-4" role="alert"><Notice tone="warn">{CASES.loadError}</Notice></div>}
        <CaseTable rows={result?.rows.slice(0, result.limit) ?? []} />
        {!failed && !result?.rows.length && <p role="status" className="py-12 text-center text-[14px] text-muted-foreground">{result ? CASES.empty : CASES.loading}</p>}
        {result && result.rows.length > result.limit && (
          <div className="flex justify-center py-4">
            <Button variant="outline" size="sm" disabled={limit !== result.limit && !failed} onClick={() => setLimit(result.limit + PAGE_SIZE)}>{CASES.more}</Button>
          </div>
        )}
      </Panel>
    </AppShell>
  );
}
