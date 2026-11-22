import { ListFilter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CASES, INSIGHTS } from "@/content/staff";
import type { Filters } from "./history";

function FilterSelect<T extends string>({ label, options, value, change }: {
  label: string; options: Record<T, string>; value: T; change: (value: T) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => { if (v !== null) change(v); }}>
      <SelectTrigger size="sm" aria-label={label} className="text-[13px]">
        <SelectValue>{value === "all" ? label : options[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>{Object.entries<string>(options).map(([key, name]) => <SelectItem key={key} value={key}>{name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function CaseFilters({ filters, change }: { filters: Filters; change: (filters: Filters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-5">
      <span className="mr-1 inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <ListFilter className="size-3.5 stroke-[1.5]" />{CASES.filter}
      </span>
      <FilterSelect label={CASES.status} value={filters.status} options={{ all: CASES.all, ...CASES.statuses }} change={(status) => change({ ...filters, status })} />
      <FilterSelect label={CASES.language} value={filters.lang} options={{ all: CASES.all, ...CASES.languages }} change={(lang) => change({ ...filters, lang })} />
      <FilterSelect label={INSIGHTS.range} value={filters.period} options={{ all: CASES.all, ...CASES.days }} change={(period) => change({ ...filters, period })} />
      <label className="relative w-full sm:ml-auto sm:w-52">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 stroke-[1.5] text-muted-foreground" />
        <Input type="search" aria-label={CASES.search} placeholder={CASES.search} value={filters.search} onChange={(e) => change({ ...filters, search: e.target.value })}
          className="h-7 pl-7 text-[13px]" />
      </label>
    </div>
  );
}
