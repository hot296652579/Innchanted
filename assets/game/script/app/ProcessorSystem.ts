import { Camera } from "cc";
import { GameEvent } from "../../../framework/event/EventName";
import { EventManager } from "../../../framework/event/EventManager";
import { Actor } from "../domain/Actor";
import { ItemStack } from "../domain/ItemStack";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { ProcessorView } from "../view/ProcessorView";
import { findCookRecipe } from "./Recipe";

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

    startFromHand(actor: Actor, binding: StationBinding): boolean {
        const hand = actor.hand;
        const cook = binding.station.cook;
        if (!hand || !cook || cook.state !== "idle") {
            return false;
        }
        const recipe = findCookRecipe(hand.itemId);
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
