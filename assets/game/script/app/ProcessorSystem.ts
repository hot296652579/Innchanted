import { Camera, Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { ItemStack } from "../domain/ItemStack";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { BrokenView } from "../view/BrokenView";
import { FxView } from "../view/FxView";
import { LockView } from "../view/LockView";
import { ProcessorView } from "../view/ProcessorView";
import { findCookRecipe, isCookedOutput } from "./Recipe";

/** 加工台计时 + 进度条。配方仍走 Recipe 纯函数。 */
export class ProcessorSystem {
    private readonly _view: ProcessorView;
    private readonly _locks: LockView;
    private readonly _broken: BrokenView;

    constructor(
        camera: Camera | null,
        private readonly registry: StationRegistry,
        private readonly fx: FxView,
    ) {
        this._view = new ProcessorView(camera);
        this._locks = new LockView(camera);
        this._broken = new BrokenView(camera);
    }

    async load(): Promise<void> {
        await this._view.load();
        await this._locks.load();
        await this._broken.load();
    }

    update(): void {
        this._view.update();
        this._locks.update();
        this._broken.update();
    }

    /** 砸坏操作台并在上方持续显示警告。成功返回 true。 */
    markBroken(binding: StationBinding): boolean {
        if (!binding.station.tryBreak()) {
            return false;
        }
        this._locks.hide(binding.station.id);
        this._broken.show(binding);
        return true;
    }

    clearBroken(): void {
        this._broken.clear();
        for (let i = 0; i < this.registry.all.length; i++) {
            this.registry.all[i].station.broken = false;
        }
    }

    /** 从未上锁的灶炉里锁 max 个（默认 1）。返回新锁上的数量。 */
    lockUnlocked(seconds: number, max = 1): number {
        const candidates: StationBinding[] = [];
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            if (!binding.station.locked && !binding.station.broken && !binding.station.winded && binding.station.cook) {
                candidates.push(binding);
            }
        }
        let n = 0;
        const take = Math.min(max, candidates.length);
        for (let i = 0; i < take; i++) {
            const pick = Math.floor(Math.random() * candidates.length);
            const binding = candidates[pick];
            candidates.splice(pick, 1);
            if (!binding.station.tryLock(seconds)) {
                continue;
            }
            this._locks.show(binding);
            n += 1;
        }
        return n;
    }

    clearLocks(): void {
        this._locks.clear();
        for (let i = 0; i < this.registry.all.length; i++) {
            this.registry.all[i].station.lockRemain = 0;
        }
    }

    tick(dt: number): void {
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            if (binding.station.tickLock(dt)) {
                this._locks.hide(binding.station.id);
            }
            if (binding.station.locked || binding.station.winded || binding.station.broken) {
                continue;
            }
            const cook = binding.station.cook;
            if (!cook || cook.state !== "cooking") {
                continue;
            }
            if (cook.update(dt) !== "ready") {
                continue;
            }
            binding.station.slot = new ItemStack(cook.outputId, 1);
            this._view.showReady(binding, cook.outputId);
            this.fx.attach(binding.station.id, binding.node, "smoke", binding.holdPoint);
            EventManager.getInstance().emit(GameEvent.PROCESSOR_READY, binding.station.id, cook.outputId);
            EventManager.getInstance().emit(GameEvent.STATION_SLOT_CHANGED, binding.station.id);
            console.log("[Cook] 完成", binding.station.id, cook.outputId);
        }
    }

    hideBar(binding: StationBinding): void {
        this._view.hideBar(binding);
    }

    /** 成品订单：灶炉 ready，或台面上的烘培输出。同一台 count>1 会重复出现。 */
    listCooked(max: number): StationBinding[] {
        const ready: StationBinding[] = [];
        const extra: StationBinding[] = [];
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            const slot = binding.station.slot;
            const cook = binding.station.cook;
            if (!slot || slot.empty || !isCookedOutput(slot.itemId)) {
                continue;
            }
            if (cook?.state === "cooking") {
                continue;
            }
            const copies = cook?.state === "ready" ? ready : extra;
            const n = Math.max(1, slot.count);
            for (let k = 0; k < n; k++) {
                copies.push(binding);
            }
        }
        return ready.concat(extra).slice(0, Math.max(0, max));
    }

    /** 从台子拿走 1 份成品，挂到小偷 HoldPoint。 */
    takeCooked(binding: StationBinding, thiefHold: Node): boolean {
        const station = binding.station;
        const slot = station.slot;
        if (!slot || slot.empty || !isCookedOutput(slot.itemId)) {
            return false;
        }
        if (station.cook?.state === "cooking") {
            return false;
        }
        const kids = binding.holdPoint.children.filter((child) => child.isValid);
        if (kids.length === 0) {
            return false;
        }
        const food = kids[kids.length - 1];
        thiefHold.addChild(food);
        food.setPosition(0, 0, 0);
        slot.count -= 1;
        if (slot.empty) {
            station.slot = null;
            station.cook?.reset();
            this._view.hideBar(binding);
            this.fx.stop(station.id);
        }
        EventManager.getInstance().emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        return true;
    }

    startFromHand(actor: Actor, binding: StationBinding): boolean {
        const hand = actor.hand;
        const cook = binding.station.cook;
        if (!hand || !cook || cook.state !== "idle" || binding.station.locked || binding.station.winded || binding.station.broken) {
            return false;
        }
        const recipe = findCookRecipe(hand.itemId);// 查找烘培配方
        if (!recipe) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这个不能放进炉灶");
            return false;
        }
        binding.station.slot = new ItemStack(hand.itemId, 1);
        hand.count -= 1;
        if (hand.empty) {
            actor.hand = null;
        }
        cook.start(recipe.input, recipe.output, recipe.duration);
        this._view.begin(binding);
        this.fx.attach(binding.station.id, binding.node, "fire", binding.holdPoint);
        console.log("[Cook] 开始烘培", recipe.input, "→", recipe.output, recipe.duration, "s");
        return true;
    }
}
