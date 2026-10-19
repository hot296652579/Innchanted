import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { isCoin, ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";
import { StationBinding } from "../sim/StationRegistry";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";
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
import { GuestLoop } from "./GuestLoop";
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
    ) { }

    arrive(binding: StationBinding): void {
        const action = resolveDefaultAction(
            this.actor.hand,
            binding.station,
            this.guests.wantedAt(binding.station.id, this.actor.hand?.itemId),
        );
        console.log("[Player] 到达", binding.station.id, action);
        this.apply(action, binding);
    }

    apply(action: ActionKind, binding: StationBinding): void {
        const actor = this.actor;
        const station = binding.station;
        const events = EventManager.getInstance();
        switch (action) {
            case "Take"://拿取物品
                actor.hand = station.slot;
                station.slot = null;
                station.cook?.reset();
                this.holds.take(station.id);
                this.processors.hideBar(binding);
                break;
            case "Place":// 灶炉：开烘培；其他台：放手物品
                if (station.type === StationType.Cook) {
                    if (!this.processors.startFromHand(actor, binding)) {
                        return;
                    }
                    this.holds.place(station.id, 1);
                    break;
                }
                this.dropHand(binding);
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
                    events.emit(GameEvent.SHELL_BANKED, count);
                    events.emit(GameEvent.SHOW_TIPS, "金币已存入宝箱");
                }
                break;
            case "Stack":// 堆叠物品
                if (actor.hand && station.slot) {
                    const moved = actor.hand.count - station.slot.absorb(actor.hand);
                    if (actor.hand.empty) {
                        actor.hand = null;
                    }
                    this.holds.stack(station.id, moved);
                }
                break;
            case "RefuseSwap":// 拒绝交换
                const tip = refuseTip(station);
                events.emit(GameEvent.SHOW_TIPS, tip);
                console.warn("[Player]", tip);
                return;
            default:
                return;
        }
        if (action === "Take" || action === "Place" || action === "Stack" || action === "Combine") {
            this.playerView.playThrow();
        }
        events.emit(GameEvent.ITEM_HELD_CHANGED, actor.id, actor.hand);
        events.emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        console.log("[Player]", action, "手", actor.hand, "台", station.slot);
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

    private dropHand(binding: StationBinding): void {
        binding.station.slot = this.actor.hand;
        this.actor.hand = null;
        this.holds.place(binding.station.id);
    }

    private tryServe(binding: StationBinding): boolean {
        if (this.guests.tryServe(binding)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "客人吃完离开了");
            return true;
        }
        const slot = binding.station.slot;
        if (slot && this.guests.hasSeated(binding.station.id) && !this.guests.wantedAt(binding.station.id, slot.itemId)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这不是客人要的");
        }
        return false;
    }
}

function refuseTip(station: Station): string {
    if (station.locked) {
        return "灶炉被锁住了";
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
    if (isCoin(station.slot?.itemId)) {
        return "先拿走金币才能上菜";
    }
    return "不能和台上的交换";
}
