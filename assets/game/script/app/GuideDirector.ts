import { Camera } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ClickHit } from "./ClickPicker";
import { GuestLoop } from "./GuestLoop";
import { GuideStepDef, GuideWait } from "./LevelCatalog";
import { StationRegistry } from "../sim/StationRegistry";
import { GuideView } from "../view/GuideView";

/** 关卡引导：卡住倒计时和客人，只让玩家点当前箭头目标。 */
export class GuideDirector {
    private readonly _view: GuideView;
    private _steps: GuideStepDef[] = [];
    private _index = -1;
    private _serveTableId: string | null = null;
    private _registry: StationRegistry | null = null;
    private _guests: GuestLoop | null = null;

    constructor(camera: Camera | null) {
        this._view = new GuideView(camera);
    }

    get active(): boolean {
        return this._index >= 0 && this._index < this._steps.length;
    }

    /** 上菜步才放客人走动、入座。 */
    get allowsGuests(): boolean {
        return this.step()?.wait === "serve";
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
        this.showStep(0);
        console.log(`[Guide] 开始 ${this._steps.length} 步`);
    }

    allowsClick(hit: ClickHit): boolean {
        if (!this.active) {
            return true;
        }
        const step = this.step();
        if (!step) {
            return true;
        }
        if (hit.target.kind !== "place") {
            return false;
        }
        if (step.wait === "serve") {
            return !!this._serveTableId && hit.target.stationId === this._serveTableId;
        }
        return hit.target.stationId === step.target;
    }

    update(dt: number): void {
        if (!this.active) {
            return;
        }
        this._view.update(dt);
        if (this.step()?.wait === "serve" && !this._serveTableId) {
            this.tryPointGuest();
        }
    }

    clear(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.BARREL_DONE, this.onBarrelDone, this);
        events.off(GameEvent.ORDER_SHOWN, this.onOrderShown, this);
        events.off(GameEvent.GUEST_SERVED, this.onServed, this);
        this._view.clear();
        this._steps = [];
        this._index = -1;
        this._serveTableId = null;
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
        this._index = index;
        const step = this._steps[index];
        this._view.showText(step.text);
        this._serveTableId = null;
        if (step.wait === "serve") {
            this.tryPointGuest();
            return;
        }
        const binding = this._registry?.get(step.target) ?? null;
        this._view.pointAt(binding?.node ?? null);
        console.log(`[Guide] 第 ${index + 1} 步`, step.target, step.wait);
    }

    private onBarrelDone(stationId: string, kind: GuideWait): void {
        const step = this.step();
        if (!step || step.wait !== kind) {
            return;
        }
        if (step.target !== stationId) {
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

    private tryPointGuest(): void {
        const seated = this._guests?.seatedFollow() ?? null;
        if (!seated) {
            this._view.pointAt(null);
            return;
        }
        this._serveTableId = seated.tableId;
        this._view.pointAt(seated.node);
    }

    private finish(): void {
        console.log("[Guide] 结束");
        const events = EventManager.getInstance();
        events.off(GameEvent.BARREL_DONE, this.onBarrelDone, this);
        events.off(GameEvent.ORDER_SHOWN, this.onOrderShown, this);
        events.off(GameEvent.GUEST_SERVED, this.onServed, this);
        this._view.hide();
        this._index = this._steps.length;
        this._serveTableId = null;
    }
}
