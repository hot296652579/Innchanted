import { CookState } from "../domain/CookProcess";
import { ItemStack } from "../domain/ItemStack";
import { StationType } from "../domain/Station";
import { findCookRecipe } from "./Recipe";

export type ActionKind =
    | "None"
    | "MoveOnly"
    | "Cancel"
    | "Place"
    | "Take"
    | "Stack"
    | "RefuseSwap";

export type ActionTargetKind = "ground" | "self" | "place";

export interface ActionContext {
    hand: ItemStack | null;
    target: ActionTargetKind;
    slot: ItemStack | null;
    stationType?: StationType;
    cookState?: CookState;
}

/** 到达后默认动作。纯函数，可单测。 */
export function resolveDefaultAction(ctx: ActionContext): ActionKind {
    if (ctx.target === "self") {
        return "Cancel";
    }
    if (ctx.target === "ground") {
        return "MoveOnly";
    }
    if (ctx.target !== "place") {
        return "None";
    }
    if (ctx.stationType === "cook") {
        return resolveCookAction(ctx);
    }

    const hand = ctx.hand && !ctx.hand.empty ? ctx.hand : null;
    const slot = ctx.slot && !ctx.slot.empty ? ctx.slot : null;

    if (!hand && slot) {
        return "Take";
    }
    if (hand && !slot) {
        return "Place";
    }
    if (hand && slot && hand.itemId === slot.itemId) {
        return "Stack";
    }
    if (hand && slot && hand.itemId !== slot.itemId) {
        return "RefuseSwap";
    }
    return "MoveOnly";
}

function resolveCookAction(ctx: ActionContext): ActionKind {
    const hand = ctx.hand && !ctx.hand.empty ? ctx.hand : null;
    const state = ctx.cookState ?? "idle";

    if (state === "cooking") {
        return "MoveOnly";
    }
    if (state === "ready") {
        return hand ? "MoveOnly" : "Take";
    }
    if (!hand) {
        return "MoveOnly";
    }
    if (findCookRecipe(hand.itemId)) {
        return "Place";
    }
    return "RefuseSwap";
}
