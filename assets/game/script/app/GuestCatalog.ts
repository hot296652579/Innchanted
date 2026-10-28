import { ConfigManager } from "../../../framework/config/ConfigManager";

export type GuestOrderDef = {
    orderId: string | string[];
};

export type GuestDef = {
    id: string;
    waitTime: number;
    orders: GuestOrderDef[];
    prefab?: string | string[];
    escort?: boolean;
    confirmTime?: number;
    seatTime?: number;
    markPrefab?: string;
    hintTime?: number;
    hintPrefab?: string;
    sleepItemId?: string;
    sleepPrefab?: string;
};

const PREFAB_PATHS: Record<string, string> = {
    guest: "prefab/guest/RegularGuest",
    regularguest: "prefab/guest/RegularGuest",
    sleepguest: "prefab/guest/SleepGuest",
    onetimeguest: "prefab/guest/OneTimeGuest",
    gourmetguest: "prefab/guest/GourmetGuest",
    soldierguest: "prefab/guest/soldier/SoldierGuest",
    mageguest: "prefab/guest/mage/MageGuest",
};

export function guestOrders(def: GuestDef): GuestOrderDef[] {
    return def.orders ?? [];
}

export function orderItemIds(order: GuestOrderDef): string[] {
    return asList(order.orderId);
}

export function guestPrefabPaths(def: GuestDef): string[] {
    const listed = asList(def.prefab);
    if (listed.length) {
        return listed;
    }
    const fallback = PREFAB_PATHS[def.id];
    return fallback ? [fallback] : [`prefab/guest/${def.id}`];
}

/** 每个订单槽随机抽一个物品，多道菜仍按配置顺序。 */
export function pickGuestOrders(def: GuestDef): { orderId: string }[] {
    const picked: { orderId: string }[] = [];
    const orders = guestOrders(def);
    for (let i = 0; i < orders.length; i++) {
        const orderId = pickOne(orderItemIds(orders[i]));
        if (orderId) {
            picked.push({ orderId });
        }
    }
    return picked;
}

export function allOrderItemIds(): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();
    const defs = allGuestDefs();
    for (let i = 0; i < defs.length; i++) {
        const orders = guestOrders(defs[i]);
        for (let j = 0; j < orders.length; j++) {
            const items = orderItemIds(orders[j]);
            for (let k = 0; k < items.length; k++) {
                const id = items[k];
                if (seen.has(id)) {
                    continue;
                }
                seen.add(id);
                ids.push(id);
            }
        }
    }
    return ids;
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

function asList(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) {
        return value.filter((item) => !!item);
    }
    return value ? [value] : [];
}

function pickOne(list: string[]): string | undefined {
    if (!list.length) {
        return undefined;
    }
    return list[Math.floor(Math.random() * list.length)];
}
