import { Building2, Hospital, Landmark, Tent, TrainFront, type LucideIcon } from "lucide-react";
import type { PackId } from "@/content/catalogue";

// One icon per scenario pack (content/packs), on the map, the stations list and the landing page.
export const PACK_ICON: Record<PackId, LucideIcon> = { atm: Landmark, hospital: Hospital, city_office: Building2, transit: TrainFront, shelter: Tent };
