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
    private _guestId: string | null = null;
    private _hovering = false;
    private _queued = -1;
    private _clickLock = 0;
    private _windSeen = false;
    private _windTipShown = false;
    private _iceTipShown = false;
    private _resumeIndex = -1;
    private _seatedType: string | null = null;

    constructor(camera: Camera | null) {
        this._view = new GuideView(camera);
    }

    get active(): boolean {
        return this._index >= 0 && this._index < this._steps.length;
    }

    /** 接原浆/灌桶/接饮料冻局；等客人入座时不冻；客人坐下后再冻，强制点那一桌。 */
    get pausing(): boolean {
        const wait = this.step()?.wait;
        if (!this.active) {
            return false;
        }
        if (wait === "pulp" || wait === "fill" || wait === "drink" || wait === "tip" || wait === "chase"
            || wait === "escort" || wait === "roundseat") {
            return true;
        }
        return wait === "serve" && !!this._tableId;
    }

    /** 等入座、排队、引座、上菜、拾金币、存箱、等蝙蝠、驱赶蝙蝠时客人照常动。 */
    get allowsGuests(): boolean {
        const wait = this.step()?.wait;
        if (this._guests?.hasTutorialPending()) {
            return true;
        }
        return wait === "seat" || wait === "serve" || wait === "coin" || wait === "bank"
            || wait === "thief" || wait === "chase" || wait === "queue" || wait === "escort" || wait === "roundseat"
            || wait === "wind" || wait === "ice"
            || (wait === "tip" && !!this._enemy?.isValid);
    }

    /** 蝙蝠飞向食物、被赶走飞回时事件继续走；停在食物上后冻住。 */
    get allowsEvents(): boolean {
        const wait = this.step()?.wait;
        if (wait === "chase") {
            return !this._hovering;
        }
        return wait === "wind" || wait === "ice" || (wait === "tip" && !!this._enemy?.isValid);
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
        for (let i = 0; i < this._steps.length; i++) {
            const step = this._steps[i];
            if (step.wait === "queue" && step.target) {
                guests.reserveTutorial(step.target);
            }
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
        events.on(GameEvent.GUEST_WAIT_READY, this.onWaitReady, this);
        events.on(GameEvent.GUEST_ESCORT_CONFIRMED, this.onEscortConfirmed, this);
        events.on(GameEvent.GUEST_ESCORT_SEATED, this.onEscortSeated, this);
        events.on(GameEvent.EVENT_FAIL, this.onEventFail, this);
        events.on(GameEvent.GROUND_ICE_FREEZE, this.onIceFreeze, this);
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
        if (step.wait === "seat" || step.wait === "thief" || step.wait === "queue" || step.wait === "wind" || step.wait === "ice") {
            return true;
        }
        if (step.wait === "escort") {
            if (hit.target.kind === "guest") {
                return this.matchesGuest(hit.target.guestId);
            }
            if (hit.target.kind === "self") {
                const waiting = this._guests?.waitingEscort(step.target);
                return !!waiting && (this._guests?.nearForHold(waiting.guestId) ?? false);
            }
            return false;
        }
        if (step.wait === "roundseat") {
            return hit.target.kind === "place" && hit.target.stationId === step.target;
        }
        if (step.wait === "serve" && !this._tableId) {
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
        this.goNext();
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
        if (step?.wait === "queue") {
            this.tryAdvanceQueue();
        }
        if (step?.wait === "serve" && !this._tableId) {
            this.tryPointGuest();
        }
        if (step?.wait === "tip" && this._tipLeft > 0) {
            this._tipLeft -= dt;
            if (this._tipLeft <= 0) {
                this.goNext();
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
        this._guestId = null;
        this._hovering = false;
        this._queued = -1;
        this._clickLock = 0;
        this._windSeen = false;
        this._windTipShown = false;
        this._iceTipShown = false;
        this._resumeIndex = -1;
        this._seatedType = null;
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
        if (step.wait === "seat" || step.wait === "thief" || step.wait === "queue" || step.wait === "wind" || step.wait === "ice") {
            this._tableId = null;
            this._view.hide();
            console.log(`[Guide] 第 ${index + 1} 步 等待`, step.wait, step.target);
            if (step.wait === "seat" && this._seatedType === (step.target || this._seatedType)) {
                const follow = this._guests?.seatedFollow();
                if (follow) {
                    this._tableId = follow.tableId;
                }
                this._queued = index + 1;
            }
            if (step.wait === "wind" && this._windSeen) {
                this._queued = this._windTipShown ? index + 2 : index + 1;
            }
            return;
        }
        if (step.text) {
            this._view.showText(step.text);
        } else {
            this._view.hideText();
        }
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
            if (this.isWindTip(step) && this._windTipShown) {
                this.showStep(index + 1);
                return;
            }
            this._tableId = keepTable;
            if (this.isWindTip(step)) {
                this._windTipShown = true;
                this._view.pointAt(this.windedNode());
                this._tipLeft = step.duration && step.duration > 0 ? step.duration : TIP_SEC;
                this._clickLock = 0.35;
                console.log(`[Guide] 第 ${index + 1} 步`, "tip", step.target);
                return;
            }
            const stations = this.stationNodes(step.target);
            if (stations.length > 1) {
                this._view.pointAtMany(stations);
            } else if (step.target) {
                const stationNode = stations[0] ?? this._registry?.get(step.target)?.node ?? null;
                const enemyNode = this._enemy?.isValid ? this._enemy : null;
                const waitNode = this._guestId ? this._guests?.guestNodeById(this._guestId) ?? null : null;
                const guestNode = keepTable ? this._guests?.guestNodeAt(keepTable) ?? null : null;
                const tableNode = keepTable ? this._registry?.get(keepTable)?.node ?? null : null;
                this._view.pointAt(stationNode ?? enemyNode ?? waitNode ?? guestNode ?? tableNode ?? this.windedNode());
            } else {
                this._view.pointAt(null);
            }
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
        if (step.wait === "escort") {
            this._tableId = null;
            const waiting = this._guests?.waitingEscort(step.target);
            if (waiting) {
                this._guestId = waiting.guestId;
            }
            this._view.pointAt(this.guideGuestNode());
            console.log(`[Guide] 第 ${index + 1} 步`, "escort", step.target);
            return;
        }
        if (step.wait === "roundseat") {
            this._tableId = step.target;
            this._view.pointAt(this._registry?.get(step.target)?.node ?? null);
            console.log(`[Guide] 第 ${index + 1} 步`, "roundseat", step.target);
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
        const type = resolveGuestType(guestId);
        if (!this._seatedType) {
            this._seatedType = type;
        }
        if (type === "sleepguest") {
            this._seatedType = type;
        }
        const step = this.step();
        if (!step) {
            return;
        }
        if (step.wait === "seat") {
            if (step.target && type !== step.target) {
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

    private tryAdvanceQueue(): void {
        const step = this.step();
        if (step?.wait !== "queue") {
            return;
        }
        const found = this._guests?.waitingEscort(step.target || undefined);
        if (!found) {
            return;
        }
        this._guestId = found.guestId;
        this.showStep(this._index + 1);
    }

    private onWaitReady(guestId: string): void {
        const step = this.step();
        if (step?.wait !== "queue") {
            return;
        }
        if (step.target && resolveGuestType(guestId) !== step.target) {
            return;
        }
        this._guestId = guestId;
        this.showStep(this._index + 1);
    }

    private onEscortConfirmed(guestId: string): void {
        if (this.step()?.wait !== "escort" || !this.matchesGuest(guestId)) {
            return;
        }
        this.showStep(this._index + 1);
    }

    /** 冰龙第一次放出冰冻时，插入后面的文本提示。之后再结冰不再提示。 */
    private onIceFreeze(): void {
        if (this._iceTipShown || this.step()?.wait !== "ice") {
            return;
        }
        this._iceTipShown = true;
        this._queued = this._index + 1;
        console.log("[Guide] 冰冻触发，插入引导");
    }

    private onEventFail(id: string): void {
        if (id !== "whirlwind") {
            return;
        }
        this._windSeen = true;
        this.interruptWindTip();
    }

    private interruptWindTip(): void {
        if (this._windTipShown || !this.active) {
            return;
        }
        const tipIndex = this.findWindTipIndex();
        if (tipIndex < 0 || this._index === tipIndex) {
            return;
        }
        this._resumeIndex = this._index;
        this._queued = tipIndex;
        console.log("[Guide] 旋风触发，插入引导");
    }

    private findWindTipIndex(): number {
        for (let i = 0; i < this._steps.length; i++) {
            if (this.isWindTip(this._steps[i])) {
                return i;
            }
        }
        return -1;
    }

    private isWindTip(step: GuideStepDef | null): boolean {
        return !!step && step.wait === "tip" && step.target.split(",")[0].trim() === "whirlwind";
    }

    private goNext(): void {
        if (this.isWindTip(this.step()) && this._resumeIndex >= 0) {
            const resume = this._resumeIndex;
            this._resumeIndex = -1;
            this.showStep(resume);
            return;
        }
        this.showStep(this._index + 1);
    }

    private stationNodes(target: string): Node[] {
        const names = target.split(",").map((name) => name.trim()).filter((name) => !!name);
        const nodes: Node[] = [];
        for (let i = 0; i < names.length; i++) {
            const node = this._registry?.get(names[i])?.node;
            if (node?.isValid) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    private windedNode(): Node | null {
        const all = this._registry?.all ?? [];
        for (let i = 0; i < all.length; i++) {
            if (all[i].station.winded) {
                return all[i].node;
            }
        }
        return null;
    }

    private onEscortSeated(_guestId: string, tableId: string): void {
        const step = this.step();
        if (step?.wait !== "roundseat") {
            return;
        }
        if (step.target && tableId !== step.target) {
            return;
        }
        this.showStep(this._index + 1);
    }

    private matchesGuest(guestId: string): boolean {
        const step = this.step();
        if (!step) {
            return false;
        }
        if (this._guestId) {
            return guestId === this._guestId;
        }
        return !step.target || resolveGuestType(guestId) === step.target;
    }

    private guideGuestNode(): Node | null {
        if (this._guestId) {
            return this._guests?.guestNodeById(this._guestId) ?? null;
        }
        const step = this.step();
        return this._guests?.waitingEscort(step?.target || undefined)?.node ?? null;
    }

    private finish(): void {
        console.log("[Guide] 结束");
        this._guests?.releaseTutorial();
        this._guests?.resumeSpawn();
        this.unbind();
        this._view.hide();
        this._index = this._steps.length;
        this._tableId = null;
        this._tipLeft = 0;
        this._enemy = null;
        this._guestId = null;
        this._hovering = false;
        this._queued = -1;
        this._clickLock = 0;
        this._windSeen = false;
        this._windTipShown = false;
        this._iceTipShown = false;
        this._resumeIndex = -1;
        this._seatedType = null;
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
        events.off(GameEvent.GUEST_WAIT_READY, this.onWaitReady, this);
        events.off(GameEvent.GUEST_ESCORT_CONFIRMED, this.onEscortConfirmed, this);
        events.off(GameEvent.GUEST_ESCORT_SEATED, this.onEscortSeated, this);
        events.off(GameEvent.EVENT_FAIL, this.onEventFail, this);
        events.off(GameEvent.GROUND_ICE_FREEZE, this.onIceFreeze, this);
    }
}
