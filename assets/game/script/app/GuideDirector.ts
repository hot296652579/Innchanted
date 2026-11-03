import { Camera, Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { isCoin } from "../domain/ItemStack";
import { StationRegistry } from "../sim/StationRegistry";
import { GuideView } from "../view/GuideView";
import { resolveGuestType } from "./GuestCatalog";
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
    private _enemy: Node | null = null;
    private _hovering = false;
    private _queued = -1;
    private _clickLock = 0;

    constructor(camera: Camera | null) {
        this._view = new GuideView(camera);
    }

    get active(): boolean {
        return this._index >= 0 && this._index < this._steps.length;
    }

    /** 等客人入座 / 等蝙蝠出现时不冻局；真正出引导文案时才停倒计时。 */
    get pausing(): boolean {
        const wait = this.step()?.wait;
        return this.active && wait !== "seat" && wait !== "thief";
    }

    /** 等入座、上菜、拾金币、存箱、等蝙蝠时客人照常动。 */
    get allowsGuests(): boolean {
        const wait = this.step()?.wait;
        return wait === "seat" || wait === "serve" || wait === "coin" || wait === "bank" || wait === "thief";
    }

    /** 蝙蝠飞向食物、被赶走飞回时事件继续走；停在食物上后冻住。 */
    get allowsEvents(): boolean {
        const wait = this.step()?.wait;
        if (wait === "chase") {
            return !this._hovering;
        }
        return wait === "tip" && !!this._enemy?.isValid;
    }

    /** 蝙蝠还在飞，点击先吞掉不提示。 */
    get waitingHover(): boolean {
        return this.step()?.wait === "chase" && !this._hovering;
    }

    /** 已停在食物上，点击蝙蝠立刻驱赶。 */
    get lockingEnemy(): boolean {
        return this.step()?.wait === "chase" && this._hovering;
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
        events.on(GameEvent.EVENT_THIEF_APPEAR, this.onThiefAppear, this);
        events.on(GameEvent.EVENT_THIEF_HOVER, this.onThiefHover, this);
        events.on(GameEvent.EVENT_THIEF_SCARE, this.onThiefScare, this);
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
        if (step.wait === "seat" || step.wait === "thief") {
            return true;
        }
        if (step.wait === "chase") {
            return this._hovering && hit.target.kind === "enemy" && !!this._enemy && hit.target.enemyId === this._enemy.uuid;
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
        if (this._clickLock > 0 || this._queued >= 0) {
            return true;
        }
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
        if (this._clickLock > 0) {
            this._clickLock -= dt;
        }
        if (this._queued >= 0) {
            const index = this._queued;
            this._queued = -1;
            this.showStep(index);
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
        this._enemy = null;
        this._hovering = false;
        this._queued = -1;
        this._clickLock = 0;
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
        this._hovering = false;
        if (step.wait === "seat" || step.wait === "thief") {
            this._tableId = null;
            this._view.hide();
            console.log(`[Guide] 第 ${index + 1} 步 等待`, step.wait, step.target);
            return;
        }
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
        if (step.wait === "tip") {
            this._tableId = keepTable;
            const stationNode = step.target ? this._registry?.get(step.target)?.node ?? null : null;
            const enemyNode = this._enemy?.isValid ? this._enemy : null;
            const guestNode = keepTable ? this._guests?.guestNodeAt(keepTable) ?? null : null;
            const tableNode = keepTable ? this._registry?.get(keepTable)?.node ?? null : null;
            this._view.pointAt(stationNode ?? enemyNode ?? guestNode ?? tableNode);
            this._tipLeft = step.duration && step.duration > 0 ? step.duration : TIP_SEC;
            this._clickLock = 0.35;
            console.log(`[Guide] 第 ${index + 1} 步`, "tip", step.target);
            return;
        }
        if (step.wait === "chase") {
            this._tableId = null;
            this._view.pointAt(this._enemy);
            console.log(`[Guide] 第 ${index + 1} 步`, "chase");
            return;
        }
        this._tableId = null;
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

    private onOrderShown(guestId: string): void {
        const step = this.step();
        if (!step) {
            return;
        }
        if (step.wait === "seat") {
            if (step.target && resolveGuestType(guestId) !== step.target) {
                return;
            }
            const follow = this._guests?.seatedFollowById(guestId);
            if (follow) {
                this._tableId = follow.tableId;
            }
            this.showStep(this._index + 1);
            return;
        }
        if (step.wait === "serve") {
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

    private onThiefAppear(node: Node): void {
        if (node?.isValid) {
            this._enemy = node;
        }
        if (this.step()?.wait === "thief") {
            this.showStep(this._index + 1);
        }
    }

    private onThiefHover(node: Node): void {
        if (node?.isValid) {
            this._enemy = node;
        }
        if (this.step()?.wait !== "chase") {
            return;
        }
        this._hovering = true;
        this._view.pointAt(this._enemy);
        console.log("[Guide] 点击蝙蝠驱赶");
    }

    private onThiefScare(): void {
        if (this.step()?.wait !== "chase") {
            return;
        }
        this._queued = this._index + 1;
        this._clickLock = 0.35;
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
        this._enemy = null;
        this._hovering = false;
        this._queued = -1;
        this._clickLock = 0;
    }

    private unbind(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.BARREL_DONE, this.onBarrelDone, this);
        events.off(GameEvent.ORDER_SHOWN, this.onOrderShown, this);
        events.off(GameEvent.GUEST_SERVED, this.onServed, this);
        events.off(GameEvent.STATION_SLOT_CHANGED, this.onSlotChanged, this);
        events.off(GameEvent.SHELL_BANKED, this.onBanked, this);
        events.off(GameEvent.EVENT_THIEF_APPEAR, this.onThiefAppear, this);
        events.off(GameEvent.EVENT_THIEF_HOVER, this.onThiefHover, this);
        events.off(GameEvent.EVENT_THIEF_SCARE, this.onThiefScare, this);
    }
}
