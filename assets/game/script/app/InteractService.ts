import { GameEvent } from "../../../framework/event/EventName";
import { EventManager } from "../../../framework/event/EventManager";
import { Actor } from "../domain/Actor";
import { StationType } from "../domain/Station";
import { StationBinding } from "../sim/StationRegistry";
import { ItemHoldView } from "../view/ItemHoldView";
import { ActionKind } from "./DefaultAction";
import { GuestLoop } from "./GuestLoop";
import { ProcessorSystem } from "./ProcessorSystem";

/** 到达后执行 DefaultAction，不负责寻路。 */
export class InteractService {
    constructor(
        private readonly actor: Actor,
        private readonly holds: ItemHoldView,
        private readonly processors: ProcessorSystem,
        private readonly guests: GuestLoop,
    ) {}

    apply(action: ActionKind, binding: StationBinding): void {
        const actor = this.actor;
        const station = binding.station;
        const events = EventManager.getInstance();
        switch (action) {
            case "Take":
                actor.hand = station.slot;
                station.slot = null;
                station.cook?.reset();
                this.holds.take(station.id);
                this.processors.hideBar(binding);
                break;
            case "Place":
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
            case "Serve":
                this.dropHand(binding);
                if (!this.tryServe(binding)) {
                    events.emit(GameEvent.SHOW_TIPS, "这不是客人要的");
                    return;
                }
                break;
            case "Stack":
                if (actor.hand && station.slot) {
                    const moved = actor.hand.count - station.slot.absorb(actor.hand);
                    if (actor.hand.empty) {
                        actor.hand = null;
                    }
                    this.holds.stack(station.id, moved);
                }
                break;
            case "RefuseSwap":
                const tip = station.type === StationType.Cook ? "这个不能放进炉灶" : "不能和台上的交换";
                events.emit(GameEvent.SHOW_TIPS, tip);
                console.warn("[Player]", tip);
                return;
            default:
                return;
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
        const order = this.guests.seatedOrder();
        const slot = binding.station.slot;
        if (order && slot && slot.itemId !== order) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这不是客人要的");
        }
        return false;
    }
}
