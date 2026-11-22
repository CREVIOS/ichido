"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { STAFF } from "@/content/catalogue";
import type { NavItem } from "@/components/kit";

export type PaletteItem = { group: string; label: string; hint?: string; onSelect: () => void };

// ⌘K / Ctrl+K: jump to any page, open case or action from the keyboard.
export function Palette({ nav, items, open, onOpenChange }: { nav: NavItem[]; items: PaletteItem[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onOpenChange(!open); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);
  const groups = [...new Set(items.map((i) => i.group))];
  const run = (f: () => void) => { onOpenChange(false); f(); };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={STAFF.palette.title} description={STAFF.palette.hint}>
      <Command>
      <CommandInput placeholder={STAFF.palette.placeholder} />
      <CommandList>
        <CommandEmpty>{STAFF.palette.empty}</CommandEmpty>
        <CommandGroup heading={STAFF.palette.pages}>
          {nav.map((n) => <CommandItem key={n.href} onSelect={() => run(() => router.push(n.href))}><n.icon className="stroke-[1.5]" />{n.label}</CommandItem>)}
        </CommandGroup>
        {groups.map((g) => (
          <CommandGroup key={g} heading={g}>
            {items.filter((i) => i.group === g).map((i) => (
              <CommandItem key={`${g}-${i.label}`} onSelect={() => run(i.onSelect)}>{i.label}{i.hint && <CommandShortcut>{i.hint}</CommandShortcut>}</CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}

// Open state shared by the shell's search button and the keyboard shortcut.
export function usePalette() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
