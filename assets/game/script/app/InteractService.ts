import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { isCoin } from "../domain/ItemStack";
import { StationType } from "../domain/Station";
import { StationBinding } from "../sim/StationRegistry";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";
import { ActionKind, resolveDefaultAction } from "./DefaultAction";
import { GuestLoop } from "./GuestLoop";
import { ProcessorSystem } from "./ProcessorSystem";

/** 到达台子后：先决策再执行。不负责寻路。 */
export class InteractService {
    constructor(
        private readonly actor: Actor,
        private readonly holds: ItemHoldView,
        private readonly processors: ProcessorSystem,
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
        if (action === "Take" || action === "Place" || action === "Stack") {
            this.playerView.playThrow();
        }
        events.emit(GameEvent.ITEM_HELD_CHANGED, actor.id, actor.hand);
        events.emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        console.log("[Player]", action, "手", actor.hand, "台", station.slot);
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

function refuseTip(station: { type: StationType; slot: { itemId: string } | null }): string {
    if (station.type === StationType.Cook) {
        return "这个不能放进炉灶";
    }
    if (station.type === StationType.Chest) {
        return "只有金币才能存进宝箱";
    }
    if (isCoin(station.slot?.itemId)) {
        return "先拿走金币才能上菜";
    }
    return "不能和台上的交换";
}
