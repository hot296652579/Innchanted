import { Camera, Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { BarrelAcceptKind, BarrelColor, colorFromItemId, drinkItemId, isPulp, pulpItemId } from "../domain/Barrel";
import { ItemStack } from "../domain/ItemStack";
import { StationType } from "../domain/Station";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { BarrelView } from "../view/BarrelView";
import { PlayerView } from "../view/PlayerView";
import { ActionKind } from "./DefaultAction";

/** 原浆桶 / 魔法桶：1 秒接取与灌装。 */
export class BarrelSystem {
    private readonly _view: BarrelView;
    private _active: StationBinding | null = null;

    constructor(
        camera: Camera | null,
        private readonly registry: StationRegistry,
        private readonly actor: Actor,
        playerHold: Node,
        private readonly playerView: PlayerView,
    ) {
        this._view = new BarrelView(camera, playerHold);
    }

    async load(): Promise<void> {
        await this._view.load();
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            if (binding.station.type === StationType.MagicBarrel) {
                this._view.syncVolumes(binding);
            }
        }
    }

    isAccepting(stationId: string): boolean {
        return this._active?.station.id === stationId && !!this._active.station.barrel?.accepting;
    }

    begin(action: ActionKind, binding: StationBinding): boolean {
        const tank = binding.station.barrel;
        if (!tank) {
            return false;
        }
        const started = this.startAccept(action, binding);
        if (!started) {
            return false;
        }
        this.cancelOther(binding.station.id);
        this._active = binding;
        this._view.begin(binding, tank.acceptColor ?? tank.color ?? BarrelColor.Brown);
        console.log("[Barrel] 开始", action, binding.station.id, tank.acceptColor);
        return true;
    }

    /** 从有饮料的魔法桶抽走 count 份，返回实际偷到的数量。 */
    stealCharges(count: number): number {
        let took = 0;
        let left = Math.max(0, Math.floor(count));
        while (left > 0) {
            const binding = this.fullestMagic();
            const tank = binding?.station.barrel;
            if (!binding || !tank || !tank.draw()) {
                break;
            }
            this._view.syncVolumes(binding);
            took += 1;
            left -= 1;
        }
        return took;
    }

    cancel(): void {
        const active = this._active;
        if (!active) {
            return;
        }
        active.station.barrel?.cancelAccept();
        this._view.hide(active);
        this._active = null;
    }

    tick(dt: number): void {
        const active = this._active;
        const tank = active?.station.barrel;
        if (!active || !tank) {
            return;
        }
        const done = tank.tick(dt);
        this._view.setProgress(active, done ? 1 : tank.progress);
        if (!done) {
            return;
        }
        this._view.hide(active);
        this._active = null;
        this.finish(active, done.kind, done.color);
    }

    private fullestMagic(): StationBinding | null {
        let best: StationBinding | null = null;
        let bestCharges = 0;
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            const tank = binding.station.barrel;
            if (binding.station.type !== StationType.MagicBarrel || !tank || tank.charges <= 0) {
                continue;
            }
            if (tank.charges > bestCharges) {
                best = binding;
                bestCharges = tank.charges;
            }
        }
        return best;
    }

    private startAccept(action: ActionKind, binding: StationBinding): boolean {
        const tank = binding.station.barrel;
        if (!tank) {
            return false;
        }
        if (action === "AcceptPulp") {
            return !!tank.color && tank.beginAccept("pulp", tank.color);
        }
        if (action === "AcceptFill") {
            const color = this.actor.hand ? colorFromItemId(this.actor.hand.itemId) : null;
            return !!color && tank.beginAccept("fill", color);
        }
        if (action === "AcceptDrink") {
            return !!tank.color && tank.charges > 0 && tank.beginAccept("drink", tank.color);
        }
        return false;
    }

    private cancelOther(keepId: string): void {
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            if (binding.station.id === keepId) {
                continue;
            }
            if (binding.station.barrel?.accepting) {
                binding.station.barrel.cancelAccept();
                this._view.hide(binding);
            }
        }
    }

    private finish(binding: StationBinding, kind: BarrelAcceptKind, color: BarrelColor): void {
        if (kind === "pulp") {
            this.givePulp(color);
        } else if (kind === "fill") {
            this.fillTank(binding, color);
        } else {
            this.giveDrink(binding, color);
        }
        this.playerView.playThrow();
        EventManager.getInstance().emit(GameEvent.ITEM_HELD_CHANGED, this.actor.id, this.actor.hand);
        EventManager.getInstance().emit(GameEvent.STATION_SLOT_CHANGED, binding.station.id);
    }

    private givePulp(color: BarrelColor): void {
        if (this.actor.hand && !this.actor.hand.empty) {
            return;
        }
        this.actor.hand = new ItemStack(pulpItemId(color), 1);
        this._view.putPulp(color);
        console.log("[Barrel] 接到原浆", color);
    }

    private fillTank(binding: StationBinding, color: BarrelColor): void {
        const hand = this.actor.hand;
        const tank = binding.station.barrel;
        if (!tank || !hand || !isPulp(hand.itemId) || colorFromItemId(hand.itemId) !== color) {
            return;
        }
        hand.count -= 1;
        if (hand.empty) {
            this.actor.hand = null;
        }
        this._view.clearHand();
        tank.fill(color);
        this._view.syncVolumes(binding);
        console.log("[Barrel] 灌满", binding.station.id, color);
    }

    private giveDrink(binding: StationBinding, color: BarrelColor): void {
        const tank = binding.station.barrel;
        if (!tank || (this.actor.hand && !this.actor.hand.empty)) {
            return;
        }
        const drawn = tank.draw();
        if (!drawn) {
            return;
        }
        this.actor.hand = new ItemStack(drinkItemId(drawn), 1);
        this._view.putDrink(drawn);
        this._view.syncVolumes(binding);
        console.log("[Barrel] 接到饮料", drawn, "剩余", tank.charges);
        if (drawn !== color) {
            console.warn("[Barrel] 颜色不一致", color, drawn);
        }
    }
}
