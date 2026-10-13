import { Camera, Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { ItemStack } from "../domain/ItemStack";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { ProcessorView } from "../view/ProcessorView";
import { findCookRecipe, isCookedOutput } from "./Recipe";

/** 加工台计时 + 进度条。配方仍走 Recipe 纯函数。 */
export class ProcessorSystem {
    private readonly _view: ProcessorView;

    constructor(
        camera: Camera | null,
        private readonly registry: StationRegistry,
    ) {
        this._view = new ProcessorView(camera);
    }

    async load(): Promise<void> {
        await this._view.load();
    }

    update(): void {
        this._view.update();
    }

    tick(dt: number): void {
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            const cook = binding.station.cook;
            if (!cook || cook.state !== "cooking") {
                continue;
            }
            if (cook.update(dt) !== "ready") {
                continue;
            }
            binding.station.slot = new ItemStack(cook.outputId, 1);
            this._view.showReady(binding, cook.outputId);
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
        }
        EventManager.getInstance().emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        return true;
    }

    startFromHand(actor: Actor, binding: StationBinding): boolean {
        const hand = actor.hand;
        const cook = binding.station.cook;
        if (!hand || !cook || cook.state !== "idle") {
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
        console.log("[Cook] 开始烘培", recipe.input, "→", recipe.output, recipe.duration, "s");
        return true;
    }
}
