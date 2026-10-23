import { ConfigManager } from "../../../framework/config/ConfigManager";

export type GuestOrderDef = {
    orderId: string;
    orderPrefab: string;
};

export type GuestDef = {
    id: string;
    waitTime: number;
    orders: GuestOrderDef[];
    escort?: boolean;
    confirmTime?: number;
    seatTime?: number;
    markPrefab?: string;
    hintTime?: number;
    hintPrefab?: string;
    sleepItemId?: string;
    sleepPrefab?: string;
};

export function guestOrders(def: GuestDef): GuestOrderDef[] {
    return def.orders ?? [];
}


/** Guest0 / Guest_1 / RegularGuest2 → guest / regularguest。 */
export function guestTypeFromNode(name: string): string {
    const id = (name || "").toLowerCase();
    if (!id) {
        return "guest";
    }
    const matched = id.match(/^(.*guest)(?:_\d+|\d+)?$/);
    if (matched) {
        return matched[1];
    }
    return id.replace(/_\d+$/, "");
}

export function isGuestNodeName(name: string): boolean {
    const type = guestTypeFromNode(name);
    return type === "guest" || type.endsWith("guest");
}

export function allGuestDefs(): GuestDef[] {
    return ConfigManager.getInstance().getTable<GuestDef>("guests");
}

export function findGuestDef(typeId: string): GuestDef | null {
    const table = allGuestDefs();
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === typeId) {
            return table[i];
        }
    }
    return null;
}

export function isEscortGuest(typeId: string): boolean {
    return !!findGuestDef(typeId)?.escort;
}
