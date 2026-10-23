import { colorFromItemId, isMagicDrink, isPulp } from "../domain/Barrel";
import { ITEM_STACK_CAP, isCoin, ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";
import { findCombineRecipe } from "./Combine";
import { findCookRecipe } from "./Recipe";

export type ActionKind =
    | "None"
    | "MoveOnly"
    | "Cancel"
    | "Place"
    | "Take"
    | "Stack"
    | "Serve"
    | "Bank"
    | "RefuseSwap"
    | "AcceptPulp"
    | "AcceptFill"
    | "AcceptDrink"
    | "Combine";

type StationResolver = (
    hand: ItemStack | null,
    station: Station,
    wantedItemId?: string | null,
) => ActionKind;

/** 加新台子：写 resolveXxx，登记到这张表。漏登记会编译报错。 */
const STATION_RESOLVERS: Record<StationType, StationResolver> = {
    [StationType.Cook]: resolveCook,
    [StationType.Table]: resolveTable,
    [StationType.RoundTable]: resolveTable,
    [StationType.Place]: resolvePlace,
    [StationType.Chest]: resolveChest,
    [StationType.OriginalBarrel]: resolveOriginalBarrel,
    [StationType.MagicBarrel]: resolveMagicBarrel,
    [StationType.ItemStand]: resolveItemStand,
    [StationType.MagicJar]: resolveMagicJar,
};

/** 到达台子后该做什么。纯函数：手 + 台子 → 动作名。 */
export function resolveDefaultAction(
    hand: ItemStack | null,
    station: Station,
    wantedItemId?: string | null,
): ActionKind {
    return STATION_RESOLVERS[station.type](hand, station, wantedItemId);
}

function resolveCook(hand: ItemStack | null, station: Station): ActionKind {
    if (station.locked) {
        return "RefuseSwap";
    }
    const held = nonempty(hand);
    const state = station.cook?.state ?? "idle";

    if (state === "cooking") {
        return "MoveOnly";
    }
    if (state === "ready") {
        if (!held) {
            return "Take";
        }
        return findCombineRecipe(held, station) ? "Combine" : "RefuseSwap";
    }
    if (!held) {
        return "MoveOnly";
    }
    if (findCookRecipe(held.itemId)) {
        return "Place";
    }
    return "RefuseSwap";
}

function resolveTable(
    hand: ItemStack | null,
    station: Station,
    wantedItemId?: string | null,
): ActionKind {
    const held = nonempty(hand);
    const slot = nonempty(station.slot);
    if (slot && isCoin(slot.itemId)) {
        return resolveCollect(hand, station.slot) ?? "RefuseSwap";
    }
    if (held && !slot && wantedItemId && held.itemId === wantedItemId) {
        return "Serve";
    }
    if (held && !slot) {
        return "RefuseSwap";
    }
    return resolvePlace(hand, station);
}

function resolveChest(hand: ItemStack | null): ActionKind {
    const held = nonempty(hand);
    if (!held) {
        return "MoveOnly";
    }
    return isCoin(held.itemId) ? "Bank" : "RefuseSwap";
}

function resolveOriginalBarrel(hand: ItemStack | null, station: Station): ActionKind {
    const tank = station.barrel;
    if (!tank || tank.accepting) {
        return "MoveOnly";
    }
    if (nonempty(hand)) {
        return "RefuseSwap";
    }
    return tank.color ? "AcceptPulp" : "MoveOnly";
}

function resolveMagicBarrel(hand: ItemStack | null, station: Station): ActionKind {
    const tank = station.barrel;
    if (!tank || tank.accepting) {
        return "MoveOnly";
    }
    const held = nonempty(hand);
    if (!held) {
        return tank.color && tank.charges > 0 ? "AcceptDrink" : "MoveOnly";
    }
    if (isPulp(held.itemId)) {
        const color = colorFromItemId(held.itemId);
        if (!color) {
            return "RefuseSwap";
        }
        if (tank.charges > 0) {
            return "RefuseSwap";
        }
        return "AcceptFill";
    }
    return "RefuseSwap";
}

function resolveItemStand(hand: ItemStack | null, station: Station): ActionKind {
    return resolveCollect(hand, station.slot) ?? "MoveOnly";
}

function resolveMagicJar(hand: ItemStack | null, station: Station): ActionKind {
    const held = nonempty(hand);
    const slot = nonempty(station.slot);
    if (!held && slot) {
        return "Take";
    }
    if (held && !isMagicDrink(held.itemId)) {
        return "RefuseSwap";
    }
    if (held && !slot) {
        return "Place";
    }
    if (held && slot && findCombineRecipe(held, station)) {
        return "Combine";
    }
    if (held && slot) {
        return "RefuseSwap";
    }
    return "MoveOnly";
}

function resolvePlace(hand: ItemStack | null, station: Station): ActionKind {
    const held = nonempty(hand);
    const slot = nonempty(station.slot);
    const collect = resolveCollect(hand, station.slot);
    if (collect) {
        return collect;
    }
    if (held && !slot) {
        return "Place";
    }
    return "MoveOnly";
}

/** 空手才能拿。只有手里已是金币时，才能再叠台上的金币。 */
function resolveCollect(hand: ItemStack | null, slot: ItemStack | null): ActionKind | null {
    const goods = nonempty(slot);
    if (!goods) {
        return null;
    }
    const held = nonempty(hand);
    if (!held) {
        return "Take";
    }
    if (isCoin(held.itemId) && isCoin(goods.itemId)) {
        return held.count < ITEM_STACK_CAP ? "Take" : "RefuseSwap";
    }
    return "RefuseSwap";
}

function nonempty(stack: ItemStack | null): ItemStack | null {
    return stack && !stack.empty ? stack : null;
}
