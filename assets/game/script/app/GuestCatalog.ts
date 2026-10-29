import { ConfigManager } from "../../../framework/config/ConfigManager";
import { allLevels, LevelGuestOrderSlots } from "./LevelCatalog";

export type GuestOrderDef = {
    orderId: string | string[];
};

export type GuestDef = {
    id: string;
    waitTime: number;
    orders?: GuestOrderDef[];
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

/** 关卡有配置用关卡的，否则用客人表默认订单。 */
export function ordersForGuest(def: GuestDef, levelSlots?: LevelGuestOrderSlots): GuestOrderDef[] {
    const fromLevel = normalizeOrderSlots(levelSlots);
    if (fromLevel.length) {
        return fromLevel;
    }
    return guestOrders(def);
}

/** 每个订单槽随机抽一个物品，多道菜仍按配置顺序。 */
export function pickGuestOrders(def: GuestDef, levelSlots?: LevelGuestOrderSlots): { orderId: string }[] {
    const picked: { orderId: string }[] = [];
    const orders = ordersForGuest(def, levelSlots);
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
    collectOrderIds(allGuestDefs().map((def) => guestOrders(def)), seen, ids);
    const levels = allLevels();
    for (let i = 0; i < levels.length; i++) {
        const map = levels[i].guestOrders;
        if (!map) {
            continue;
        }
        const types = Object.keys(map);
        for (let j = 0; j < types.length; j++) {
            collectOrderIds([normalizeOrderSlots(map[types[j]])], seen, ids);
        }
    }
    return ids;
}

/** 关卡里的 regularguest2 / soldierguest1 归一成客人类型。 */
export function resolveGuestType(id: string): string {
    const raw = (id || "").toLowerCase();
    if (findGuestDef(raw)) {
        return raw;
    }
    const type = guestTypeFromNode(raw);
    if (findGuestDef(type)) {
        return type;
    }
    return raw;
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
    return ConfigManager.getInstance().getTable<GuestDef>("guests") ?? [];
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

function normalizeOrderSlots(slots?: LevelGuestOrderSlots | GuestOrderDef[]): GuestOrderDef[] {
    if (!slots || !slots.length) {
        return [];
    }
    if (typeof slots[0] === "string") {
        return [{ orderId: (slots as string[]).filter((id) => !!id) }];
    }
    const orders: GuestOrderDef[] = [];
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (Array.isArray(slot)) {
            orders.push({ orderId: slot.filter((id) => !!id) });
        } else if (slot && typeof slot === "object") {
            orders.push(slot);
        }
    }
    return orders;
}

function collectOrderIds(groups: GuestOrderDef[][], seen: Set<string>, ids: string[]): void {
    for (let i = 0; i < groups.length; i++) {
        const orders = groups[i];
        for (let j = 0; j < orders.length; j++) {
            const items = orderItemIds(orders[j]);
            for (let k = 0; k < items.length; k++) {
                const id = items[k];
                if (!id || seen.has(id)) {
                    continue;
                }
                seen.add(id);
                ids.push(id);
            }
        }
    }
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
