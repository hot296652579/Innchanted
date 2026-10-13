import { ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";
import { findCookRecipe } from "./Recipe";

export type ActionKind =
    | "None"
    | "MoveOnly"
    | "Cancel"
    | "Place"
    | "Take"
    | "Stack"
    | "Serve"
    | "RefuseSwap";

type StationResolver = (
    hand: ItemStack | null,
    station: Station,
    wantedItemId?: string | null,
) => ActionKind;

/** 加新台子：写 resolveXxx，登记到这张表。漏登记会编译报错。 */
const STATION_RESOLVERS: Record<StationType, StationResolver> = {
    [StationType.Cook]: resolveCook,
    [StationType.Table]: resolveTable,
    [StationType.Place]: resolvePlace,
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
    const held = nonempty(hand);
    const state = station.cook?.state ?? "idle";

    if (state === "cooking") {
        return "MoveOnly";
    }
    if (state === "ready") {
        return held ? "MoveOnly" : "Take";
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
    const held = nonempty(hand); // 手上有没有货物
    const slot = nonempty(station.slot);// 台子上有没有货物
    if (held && !slot && wantedItemId && held.itemId === wantedItemId) {
        return "Serve";
    }
    return resolvePlace(hand, station);
}

function resolvePlace(hand: ItemStack | null, station: Station): ActionKind {
    const held = nonempty(hand);
    const slot = nonempty(station.slot);
    if (!held && slot) {
        return "Take";
    }
    if (held && !slot) {
        return "Place";
    }
    if (held && slot && held.itemId === slot.itemId) {
        return "Stack";
    }
    if (held && slot) {
        return "RefuseSwap";
    }
    return "MoveOnly";
}

function nonempty(stack: ItemStack | null): ItemStack | null {
    return stack && !stack.empty ? stack : null;
}
