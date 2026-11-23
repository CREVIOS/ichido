"use client";
import Link from "next/link";
import { AppShell, Panel } from "@/components/kit";
import { MeFooter, StaffGate, navFor } from "@/components/StaffGate";
import { buttonVariants } from "@/components/ui/button";
import { FIRST_SHIFT, STAFF } from "@/content/catalogue";
import { PushPanel } from "../push";

export default function FirstShift() {
  return <StaffGate title={FIRST_SHIFT.title}>{(me) =>
    <AppShell title={FIRST_SHIFT.title} nav={navFor(me.role)} footer={<MeFooter me={me} />}>
      <div className="mx-auto flex max-w-xl flex-col gap-4 p-5">
        <Panel title={me.name + " · " + STAFF.roleName[me.role]}>
          <Link className={buttonVariants()} href={FIRST_SHIFT.desk[me.role]}>{FIRST_SHIFT.open}</Link>
          {me.role === "operator" && <Link className={buttonVariants({ variant:"secondary" })} href="/training">{FIRST_SHIFT.training}</Link>}
        </Panel>
        {["operator","field","manager"].includes(me.role) && <PushPanel />}
      </div>
    </AppShell>}
  </StaffGate>;
}
