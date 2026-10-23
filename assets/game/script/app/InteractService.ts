import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { ITEM_STACK_CAP, isCoin, ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";
import { stackFromHoldPoint, StationBinding } from "../sim/StationRegistry";
import { FxView } from "../view/FxView";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";
import { WhirlwindView } from "../view/WhirlwindView";
import { BarrelSystem } from "./BarrelSystem";
import {
    CombineCatalog,
    findCombineRecipe,
    handNeedOf,
    inputCount,
    outputCount,
    stationNeedOf,
} from "./Combine";
import { ActionKind, resolveDefaultAction } from "./DefaultAction";
import { GuestLoop, ServeResult } from "./GuestLoop";
import { findItemDef, isDrinkable, itemEffects } from "./ItemCatalog";
import { ProcessorSystem } from "./ProcessorSystem";

/** 到达台子后：先决策再执行。不负责寻路。 */
export class InteractService {
    constructor(
        private readonly actor: Actor,
        private readonly holds: ItemHoldView,
        private readonly processors: ProcessorSystem,
        private readonly barrels: BarrelSystem,
        private readonly combines: CombineCatalog,
        private readonly guests: GuestLoop,
        private readonly playerView: PlayerView,
        private readonly fx: FxView,
        private readonly winds: WhirlwindView,
    ) { }

    /** 点自身：喝掉手里的药剂。新药只改 items.json 的 use / effects。 */
    useSelf(): boolean {
        const hand = this.actor.hand;
        const drinkable = !!hand && !hand.empty && isDrinkable(hand.itemId);
        console.log("[Drink] useSelf", "hand", hand, "drinkable", drinkable, "def", hand ? findItemDef(hand.itemId) : null);
        if (!drinkable || !hand) {
            return false;
        }
        const itemId = hand.itemId;
        const def = findItemDef(itemId);
        hand.count -= 1;
        this.holds.removeFromPlayer(1);
        if (hand.empty) {
            this.actor.hand = null;
        }
        this.playerView.playDrink();
        const drinkAt = this.playerView.node.getChildByName("HoldPoint") ?? this.playerView.node;
        this.fx.burst(this.playerView.node, "drink", 1, drinkAt);
        const events = EventManager.getInstance();
        events.emit(GameEvent.ITEM_HELD_CHANGED, this.actor.id, this.actor.hand);
        const effects = itemEffects(itemId);
        for (let i = 0; i < effects.length; i++) {
            if (effects[i] === "thaw") {
                events.emit(GameEvent.GROUND_ICE_THAW, 1);
            }
        }
        events.emit(GameEvent.SHOW_TIPS, `喝了${def?.displayName ?? "药剂"}`);
        console.log("[Player] 喝药", itemId, effects);
        return true;
    }

    arrive(binding: StationBinding): void {
        this.syncSlot(binding);
        const action = resolveDefaultAction(
            this.actor.hand,
            binding.station,
            this.guests.wantedAt(binding.station.id, this.actor.hand?.itemId),
        );
        console.log("[Player] 到达", binding.station.id, action);
        if (this.blockEmptyTable(action, binding)) {
            return;
        }
        this.apply(action, binding);
    }

    /** 餐桌只能上客人当前要的东西；没客人不能放菜。 */
    private blockEmptyTable(action: ActionKind, binding: StationBinding): boolean {
        const type = binding.station.type;
        if (type !== StationType.Table && type !== StationType.RoundTable) {
            return false;
        }
        const held = this.actor.hand && !this.actor.hand.empty;
        const slot = binding.station.slot && !binding.station.slot.empty;
        if (!held || slot || action === "Serve") {
            return false;
        }
        const events = EventManager.getInstance();
        if (this.guests.asleepAt(binding.station.id)) {
            events.emit(GameEvent.SHOW_TIPS, "客人睡着了");
            return true;
        }
        events.emit(
            GameEvent.SHOW_TIPS,
            this.guests.hasGuestAt(binding.station.id) ? "这不是客人要的" : "没有客人，不能上菜",
        );
        return true;
    }

    apply(action: ActionKind, binding: StationBinding): void {
        const actor = this.actor;
        const station = binding.station;
        const events = EventManager.getInstance();
        switch (action) {
            case "Take"://拿取物品
                if (!this.take(binding)) {
                    return;
                }
                break;
            case "Place":// 灶炉：开烘培；其他台：空手台才能放
                if (this.occupied(binding) && station.type !== StationType.Cook) {
                    events.emit(GameEvent.SHOW_TIPS, "台上已经有东西了");
                    return;
                }
                if (station.type === StationType.Cook) {
                    if (!this.processors.startFromHand(actor, binding)) {
                        return;
                    }
                    this.holds.place(station.id, 1);
                    break;
                }
                this.dropHand(binding);
                if (station.type === StationType.Place) {
                    this.fx.burst(binding.node, "place", 0.5, binding.holdPoint);
                }
                if (station.type === StationType.Table) {
                    this.tryServe(binding);
                }
                break;
            case "Serve":// 上菜
                this.dropHand(binding);
                this.playerView.playThrow();
                if (!this.tryServe(binding)) {
                    events.emit(GameEvent.SHOW_TIPS, "这不是客人要的");
                    return;
                }
                break;
            case "Combine":
                if (!this.combine(binding)) {
                    return;
                }
                break;
            case "UnlockWind":
                if (!this.unlockWind(binding)) {
                    return;
                }
                break;
            case "AcceptPulp":
            case "AcceptFill":
            case "AcceptDrink":
                this.barrels.begin(action, binding);
                return;
            case "Bank":// 金币存宝箱
                if (!actor.hand || !isCoin(actor.hand.itemId)) {
                    return;
                }
                {
                    const count = actor.hand.count;
                    actor.hand = null;
                    this.holds.bankInto(station.id);
                    this.fx.burst(binding.node, "bank", 1, binding.holdPoint);
                    events.emit(GameEvent.SHELL_BANKED, count);
                    events.emit(GameEvent.SHOW_TIPS, "金币已存入宝箱");
                }
                break;
            case "Stack":
                events.emit(GameEvent.SHOW_TIPS, "台上已经有东西了");
                return;
            case "RefuseSwap":// 拒绝交换
                const tip = refuseTip(station, actor.hand);
                events.emit(GameEvent.SHOW_TIPS, tip);
                console.warn("[Player]", tip);
                return;
            default:
                return;
        }
        if (action === "Take" || action === "Place" || action === "Combine" || action === "UnlockWind") {
            this.playerView.playThrow();
        }
        events.emit(GameEvent.ITEM_HELD_CHANGED, actor.id, actor.hand);
        events.emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        console.log("[Player]", action, "手", actor.hand, "台", station.slot);
    }

    private unlockWind(binding: StationBinding): boolean {
        const hand = this.actor.hand;
        if (!hand || hand.empty) {
            return false;
        }
        const itemId = hand.itemId;
        if (!this.winds.unlock(binding, itemId)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "需要红色药剂才能解开旋风");
            return false;
        }
        hand.count -= 1;
        this.holds.removeFromPlayer(1);
        if (hand.empty) {
            this.actor.hand = null;
        }
        EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "旋风解开了");
        console.log("[Wind] 解开", binding.station.id, itemId);
        return true;
    }

    private combine(binding: StationBinding): boolean {
        const hand = this.actor.hand;
        const slot = binding.station.slot;
        if (!hand || !slot) {
            return false;
        }
        const recipe = findCombineRecipe(hand, binding.station);
        const handNeed = recipe ? handNeedOf(recipe, hand) : null;
        const stationNeed = recipe ? stationNeedOf(recipe, slot) : null;
        if (!recipe || !handNeed || !stationNeed) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这两种不能合成");
            return false;
        }
        const takeHand = inputCount(handNeed);
        const takeStation = inputCount(stationNeed);
        const made = outputCount(recipe);
        const prefab = this.combines.prefab(recipe.output.itemId);
        if (!prefab) {
            console.warn("[Combine] 没有成品预设", recipe.output.itemId);
            return false;
        }

        hand.count -= takeHand;
        this.holds.removeFromPlayer(takeHand);
        if (hand.empty) {
            this.actor.hand = null;
        }
        slot.count -= takeStation;
        this.holds.removeFromStation(binding.station.id, takeStation);
        if (slot.empty) {
            binding.station.slot = null;
        }

        const result = new ItemStack(recipe.output.itemId, made);
        const toHand = recipe.output.to === "hand" || !!binding.station.slot;
        if (toHand) {
            this.actor.hand = result;
            this.holds.spawnOnPlayer(prefab, made);
        } else {
            binding.station.slot = result;
            this.holds.spawnOnStation(binding.station.id, prefab, made);
        }
        EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "合成完成");
        console.log("[Combine]", recipe.id, "→", result.itemId, "x", result.count, toHand ? "手上" : "台上");
        return true;
    }

    private take(binding: StationBinding): boolean {
        if (binding.station.type === StationType.ItemStand) {
            return this.takeFromStand(binding);
        }
        const slot = binding.station.slot;
        if (!slot || slot.empty) {
            return false;
        }
        const hand = this.actor.hand;
        if (hand && !hand.empty) {
            if (!isCoin(hand.itemId) || !isCoin(slot.itemId)) {
                EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "先把手里的东西放下再拿");
                return false;
            }
            const before = hand.count;
            hand.absorb(slot);
            const moved = hand.count - before;
            if (moved <= 0) {
                EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "金币拿满了");
                return false;
            }
            if (slot.empty) {
                binding.station.slot = null;
                this.holds.take(binding.station.id);
            }
            return true;
        }
        this.actor.hand = slot;
        binding.station.slot = null;
        binding.station.cook?.reset();
        this.holds.take(binding.station.id);
        this.processors.hideBar(binding);
        this.fx.stop(binding.station.id);
        return true;
    }

    private takeFromStand(binding: StationBinding): boolean {
        const src = binding.station.slot;
        const hand = this.actor.hand;
        if (!src || src.empty || (hand && !hand.empty)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "先把手里的东西放下再拿");
            return false;
        }
        this.actor.hand = new ItemStack(src.itemId, 1);
        this.holds.copyToPlayer(binding.station.id, 1);
        return true;
    }

    private dropHand(binding: StationBinding): void {
        binding.station.slot = this.actor.hand;
        this.actor.hand = null;
        this.holds.place(binding.station.id);
    }

    /** HoldPoint 上已有模型时补回 slot，避免看起来有货、逻辑却当成空台。 */
    private syncSlot(binding: StationBinding): void {
        const slot = binding.station.slot;
        if (slot && !slot.empty) {
            return;
        }
        binding.station.slot = stackFromHoldPoint(binding.holdPoint);
    }

    private occupied(binding: StationBinding): boolean {
        const slot = binding.station.slot;
        if (slot && !slot.empty) {
            return true;
        }
        return binding.holdPoint.children.length > 0;
    }

    private tryServe(binding: StationBinding): boolean {
        const result = this.guests.tryServe(binding);
        if (result === ServeResult.Done) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "客人吃完离开了");
            return true;
        }
        if (result === ServeResult.Next || result === ServeResult.Wake) {
            return true;
        }
        const slot = binding.station.slot;
        if (slot && this.guests.hasSeated(binding.station.id) && !this.guests.wantedAt(binding.station.id, slot.itemId)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这不是客人要的");
        }
        return false;
    }
}

function refuseTip(station: Station, hand?: ItemStack | null): string {
    if (station.broken) {
        return "操作台被砸坏了";
    }
    if (station.winded) {
        return "需要红色药剂才能解开旋风";
    }
    if (station.locked) {
        return "灶炉被锁住了";
    }
    const held = hand && !hand.empty ? hand : null;
    const slot = station.slot && !station.slot.empty ? station.slot : null;
    if (held && slot) {
        if (isCoin(held.itemId) && isCoin(slot.itemId) && held.count >= ITEM_STACK_CAP) {
            return "金币拿满了";
        }
        if (station.type === StationType.ItemStand) {
            return "材料架上的东西不能换，空手来拿";
        }
        return "先把手里的东西放下再拿";
    }
    if (station.type === StationType.Cook) {
        return "这个不能放进炉灶";
    }
    if (station.type === StationType.Chest) {
        return "只有金币才能存进宝箱";
    }
    if (station.type === StationType.OriginalBarrel) {
        return "空手才能接原浆";
    }
    if (station.type === StationType.MagicBarrel) {
        if (station.barrel && station.barrel.charges > 0) {
            return "桶里还有饮料，先接完再灌";
        }
        return "只有原浆才能灌进魔法桶";
    }
    if (station.type === StationType.ItemStand) {
        return "材料架上的东西不能换，空手来拿";
    }
    if (station.type === StationType.MagicJar) {
        return "融合罐只放魔法饮料，两种饮料才能融合";
    }
    if (station.type === StationType.Table || station.type === StationType.RoundTable) {
        return "没有客人，不能上菜";
    }
    if (isCoin(station.slot?.itemId)) {
        return "先拿走金币才能上菜";
    }
    if (station.slot && !station.slot.empty) {
        return "台上已经有东西了";
    }
    return "不能和台上的交换";
}
