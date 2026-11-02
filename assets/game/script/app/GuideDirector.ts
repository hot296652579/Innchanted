import { Camera } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { isCoin } from "../domain/ItemStack";
import { StationRegistry } from "../sim/StationRegistry";
import { GuideView } from "../view/GuideView";
import { ClickHit } from "./ClickPicker";
import { GuestLoop } from "./GuestLoop";
import { GuideStepDef, GuideWait } from "./LevelCatalog";

const TIP_SEC = 4;

/** 关卡引导：卡住倒计时和客人，只让玩家点当前箭头目标。 */
export class GuideDirector {
    private readonly _view: GuideView;
    private _steps: GuideStepDef[] = [];
    private _index = -1;
    private _tableId: string | null = null;
    private _tipLeft = 0;
    private _registry: StationRegistry | null = null;
    private _guests: GuestLoop | null = null;

    constructor(camera: Camera | null) {
        this._view = new GuideView(camera);
    }

    get active(): boolean {
        return this._index >= 0 && this._index < this._steps.length;
    }

    /** 前三步冻住客人；上菜及之后放客人走动。 */
    get allowsGuests(): boolean {
        const wait = this.step()?.wait;
        return !!wait && wait !== "pulp" && wait !== "fill" && wait !== "drink";
    }

    async load(): Promise<void> {
        await this._view.load();
    }

    start(steps: GuideStepDef[] | undefined, registry: StationRegistry, guests: GuestLoop): void {
        this.clear();
        this._registry = registry;
        this._guests = guests;
        this._steps = steps ?? [];
        if (this._steps.length === 0) {
            return;
        }
        const events = EventManager.getInstance();
        events.on(GameEvent.BARREL_DONE, this.onBarrelDone, this);
        events.on(GameEvent.ORDER_SHOWN, this.onOrderShown, this);
        events.on(GameEvent.GUEST_SERVED, this.onServed, this);
        events.on(GameEvent.STATION_SLOT_CHANGED, this.onSlotChanged, this);
        events.on(GameEvent.SHELL_BANKED, this.onBanked, this);
        this.showStep(0);
        console.log(`[Guide] 开始 ${this._steps.length} 步`);
    }

    allowsClick(hit: ClickHit): boolean {
        if (!this.active) {
            return true;
        }
        const step = this.step();
        if (!step || step.wait === "tip") {
            return false;
        }
        if (hit.target.kind !== "place") {
            return false;
        }
        if (step.wait === "serve" || step.wait === "coin") {
            return !!this._tableId && hit.target.stationId === this._tableId;
        }
        return hit.target.stationId === step.target;
    }

    /** 温馨提示：点任意处结束该步。 */
    consumeClick(): boolean {
        if (this.step()?.wait !== "tip") {
            return false;
        }
        this.showStep(this._index + 1);
        return true;
    }

    update(dt: number): void {
        if (!this.active) {
            return;
        }
        this._view.update(dt);
        const step = this.step();
        if (step?.wait === "serve" && !this._tableId) {
            this.tryPointGuest();
        }
        if (step?.wait === "tip" && this._tipLeft > 0) {
            this._tipLeft -= dt;
            if (this._tipLeft <= 0) {
                this.showStep(this._index + 1);
            }
        }
    }

    clear(): void {
        this.unbind();
        this._view.clear();
        this._steps = [];
        this._index = -1;
        this._tableId = null;
        this._tipLeft = 0;
        this._registry = null;
        this._guests = null;
    }

    private step(): GuideStepDef | null {
        if (this._index < 0 || this._index >= this._steps.length) {
            return null;
        }
        return this._steps[this._index];
    }

    private showStep(index: number): void {
        if (index >= this._steps.length) {
            this.finish();
            return;
        }
        const keepTable = this._tableId;
        this._index = index;
        this._tipLeft = 0;
        const step = this._steps[index];
        this._view.showText(step.text);
        if (step.wait === "serve") {
            this._tableId = null;
            this.tryPointGuest();
            console.log(`[Guide] 第 ${index + 1} 步`, step.wait);
            return;
        }
        if (step.wait === "coin") {
            this._tableId = keepTable;
            const node = (keepTable ? this._registry?.get(keepTable)?.node : null)
                ?? this._guests?.seatedFollow()?.node
                ?? null;
            if (!this._tableId) {
                this.tryPointGuest();
            } else {
                this._view.pointAt(node);
            }
            console.log(`[Guide] 第 ${index + 1} 步`, "coin", this._tableId);
            return;
        }
        this._tableId = null;
        if (step.wait === "tip") {
            this._view.pointAt(null);
            this._tipLeft = step.duration && step.duration > 0 ? step.duration : TIP_SEC;
            console.log(`[Guide] 第 ${index + 1} 步`, "tip");
            return;
        }
        const binding = this._registry?.get(step.target) ?? null;
        this._view.pointAt(binding?.node ?? null);
        console.log(`[Guide] 第 ${index + 1} 步`, step.target, step.wait);
    }

    private onBarrelDone(stationId: string, kind: GuideWait): void {
        const step = this.step();
        if (!step || step.wait !== kind || step.target !== stationId) {
            return;
        }
        this.showStep(this._index + 1);
    }

    private onOrderShown(): void {
        if (this.step()?.wait === "serve") {
            this.tryPointGuest();
        }
    }

    private onServed(): void {
        if (this.step()?.wait === "serve") {
            this.showStep(this._index + 1);
        }
    }

    private onSlotChanged(stationId: string): void {
        const step = this.step();
        if (!step || step.wait !== "coin" || stationId !== this._tableId) {
            return;
        }
        const slot = this._registry?.get(stationId)?.station.slot;
        if (slot && !slot.empty && isCoin(slot.itemId)) {
            return;
        }
        this.showStep(this._index + 1);
    }

    private onBanked(): void {
        if (this.step()?.wait === "bank") {
            this.showStep(this._index + 1);
        }
    }

    private tryPointGuest(): void {
        const seated = this._guests?.seatedFollow() ?? null;
        if (!seated) {
            this._view.pointAt(null);
            return;
        }
        this._tableId = seated.tableId;
        this._view.pointAt(seated.node);
    }

    private finish(): void {
        console.log("[Guide] 结束");
        this.unbind();
        this._view.hide();
        this._index = this._steps.length;
        this._tableId = null;
        this._tipLeft = 0;
    }

    private unbind(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.BARREL_DONE, this.onBarrelDone, this);
        events.off(GameEvent.ORDER_SHOWN, this.onOrderShown, this);
        events.off(GameEvent.GUEST_SERVED, this.onServed, this);
        events.off(GameEvent.STATION_SLOT_CHANGED, this.onSlotChanged, this);
        events.off(GameEvent.SHELL_BANKED, this.onBanked, this);
    }
}
