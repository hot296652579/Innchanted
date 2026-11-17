import { BundlesEnum } from "../../define/BundlesEnum";
import { ConfigManager } from "../../framework/config/ConfigManager";
import { EventManager } from "../../framework/event/EventManager";
import { GameEvent } from "../../framework/event/EventName";
import { StorageUtil } from "../../framework/utils/StorageUtil";
import { PowerSystem } from "../power/PowerSystem";

/** 每日随机抽出的任务数。 */
const DAILY_COUNT = 5;
const STORAGE_KEY = "player.dailyTask";

/** 击退任意一只怪物都算的事件。 */
const MONSTERS = ["thief", "skeleton", "fuelthief", "threaten", "raider"];
/** 美食家、一次性客人、睡觉客人。 */
const SPECIAL_GUESTS = ["gourmetguest", "onetimeguest", "sleepguest"];
const POTIONS = ["medicinebottle_olivegreen", "medicinebottle_yellow", "medicinebottle_red"];

const TASK_SERVE = 1;
const TASK_REPEL = 2;
const TASK_STATION = 3;
const TASK_GOLD_THIEF = 4;
const TASK_SPECIAL = 5;
const TASK_LEVEL = 6;
const TASK_POTION = 7;
const TASK_WIND = 8;
const TASK_FUEL = 9;
const TASK_ICE = 10;
const TASK_BANK = 11;

export type DailyTaskDef = {
    id: number;
    name: string;
    desc: string;
    target: number;
    rewardStamina: number;
    icon: string;
};

export type DailyTaskView = DailyTaskDef & {
    progress: number;
};

type DailySave = {
    day: string;
    ids: number[];
    progress: Record<string, number>;
    rewarded: number[];
};

/** 本地每日任务。每天从配置里随机抽 5 个，完成时发体力。 */
export class DailyTaskSystem {
    private static _ready = false;
    private static _loading: Promise<void> | null = null;
    private static _pending: Array<() => void> = [];
    private static _watch: (() => void) | null = null;
    private static readonly _host = {};

    /** 开局监听玩法事件。框架初始化之后调用。 */
    static boot(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.GUEST_SERVED, DailyTaskSystem.onServed, DailyTaskSystem._host);
        events.off(GameEvent.EVENT_HANDLED, DailyTaskSystem.onHandled, DailyTaskSystem._host);
        events.off(GameEvent.LEVEL_CLEARED, DailyTaskSystem.onCleared, DailyTaskSystem._host);
        events.off(GameEvent.ITEM_COMBINED, DailyTaskSystem.onCombined, DailyTaskSystem._host);
        events.off(GameEvent.SHELL_BANKED, DailyTaskSystem.onBanked, DailyTaskSystem._host);
        events.on(GameEvent.GUEST_SERVED, DailyTaskSystem.onServed, DailyTaskSystem._host);
        events.on(GameEvent.EVENT_HANDLED, DailyTaskSystem.onHandled, DailyTaskSystem._host);
        events.on(GameEvent.LEVEL_CLEARED, DailyTaskSystem.onCleared, DailyTaskSystem._host);
        events.on(GameEvent.ITEM_COMBINED, DailyTaskSystem.onCombined, DailyTaskSystem._host);
        events.on(GameEvent.SHELL_BANKED, DailyTaskSystem.onBanked, DailyTaskSystem._host);
        DailyTaskSystem._ready = false;
        DailyTaskSystem._loading = null;
        void DailyTaskSystem.prepare();
    }

    /** 面板打开时刷新。同一时间只保留最后一次监听。 */
    static watch(fn: () => void): void {
        DailyTaskSystem._watch = fn;
    }

    static async list(): Promise<DailyTaskView[]> {
        await DailyTaskSystem.prepare();
        if (DailyTaskSystem.defs().length === 0) {
            DailyTaskSystem._ready = false;
            DailyTaskSystem._loading = null;
            await DailyTaskSystem.prepare();
        }
        const save = DailyTaskSystem.touch();
        const views: DailyTaskView[] = [];
        for (let i = 0; i < save.ids.length; i++) {
            const def = DailyTaskSystem.find(save.ids[i]);
            if (!def) {
                continue;
            }
            views.push({
                ...def,
                progress: Math.min(def.target, save.progress[String(def.id)] ?? 0),
            });
        }
        return views;
    }

    private static onServed(_guestId?: string, _orderId?: string, guestType?: string): void {
        DailyTaskSystem.push(() => {
            if (!guestType) {
                return;
            }
            const ids = [TASK_SERVE];
            if (SPECIAL_GUESTS.indexOf(guestType) >= 0) {
                ids.push(TASK_SPECIAL);
            }
            DailyTaskSystem.add(ids);
        });
    }

    private static onHandled(id?: string, detail?: string): void {
        DailyTaskSystem.push(() => {
            if (!id) {
                return;
            }
            const ids: number[] = [];
            if (MONSTERS.indexOf(id) >= 0) {
                ids.push(TASK_REPEL);
            }
            if (id === "raider" && detail === "station") {
                ids.push(TASK_STATION);
            }
            if (id === "skeleton") {
                ids.push(TASK_GOLD_THIEF);
            }
            if (id === "fuelthief") {
                ids.push(TASK_FUEL);
            }
            if (id === "whirlwind") {
                ids.push(TASK_WIND);
            }
            if (id === "ice") {
                ids.push(TASK_ICE);
            }
            DailyTaskSystem.add(ids);
        });
    }

    private static onCleared(result?: { stars?: number }): void {
        DailyTaskSystem.push(() => {
            const stars = Math.floor(Number(result?.stars) || 0);
            if (stars < 1) {
                return;
            }
            DailyTaskSystem.add([TASK_LEVEL]);
        });
    }

    private static onCombined(itemId?: string): void {
        DailyTaskSystem.push(() => {
            if (!itemId || POTIONS.indexOf(itemId.toLowerCase()) < 0) {
                return;
            }
            DailyTaskSystem.add([TASK_POTION]);
        });
    }

    private static onBanked(): void {
        DailyTaskSystem.push(() => DailyTaskSystem.add([TASK_BANK]));
    }

    private static push(fn: () => void): void {
        if (!DailyTaskSystem._ready) {
            DailyTaskSystem._pending.push(fn);
            void DailyTaskSystem.prepare();
            return;
        }
        fn();
    }

    private static prepare(): Promise<void> {
        if (DailyTaskSystem._ready) {
            return Promise.resolve();
        }
        if (!DailyTaskSystem._loading) {
            DailyTaskSystem._loading = DailyTaskSystem.load().catch((err) => {
                DailyTaskSystem._loading = null;
                console.error("[DailyTask] 加载失败", err);
            });
        }
        return DailyTaskSystem._loading;
    }

    private static async load(): Promise<void> {
        const loaded = await ConfigManager.getInstance().loadTable("daytask", BundlesEnum.Table);
        if (!loaded) {
            DailyTaskSystem._loading = null;
            console.warn("[DailyTask] 任务表加载失败");
            return;
        }
        DailyTaskSystem.touch();
        DailyTaskSystem._ready = true;
        const pending = DailyTaskSystem._pending.splice(0);
        for (let i = 0; i < pending.length; i++) {
            pending[i]();
        }
    }

    private static touch(): DailySave {
        const today = DailyTaskSystem.today();
        const saved = StorageUtil.get<DailySave | null>(STORAGE_KEY, null);
        if (saved && saved.day === today && Array.isArray(saved.ids) && saved.ids.length > 0) {
            return {
                day: today,
                ids: saved.ids,
                progress: saved.progress ?? {},
                rewarded: saved.rewarded ?? [],
            };
        }
        const rolled = DailyTaskSystem.roll(today);
        DailyTaskSystem.save(rolled);
        return rolled;
    }

    private static roll(day: string): DailySave {
        const defs = DailyTaskSystem.defs();
        const ids = defs.map((def) => def.id);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const swap = ids[i];
            ids[i] = ids[j];
            ids[j] = swap;
        }
        return {
            day,
            ids: ids.slice(0, Math.min(DAILY_COUNT, ids.length)),
            progress: {},
            rewarded: [],
        };
    }

    private static add(taskIds: number[]): void {
        if (taskIds.length === 0) {
            return;
        }
        const save = DailyTaskSystem.touch();
        let changed = false;
        for (let i = 0; i < taskIds.length; i++) {
            const taskId = taskIds[i];
            if (save.ids.indexOf(taskId) < 0) {
                continue;
            }
            const def = DailyTaskSystem.find(taskId);
            if (!def) {
                continue;
            }
            const key = String(taskId);
            const current = save.progress[key] ?? 0;
            if (current >= def.target) {
                continue;
            }
            const next = current + 1;
            save.progress[key] = next;
            changed = true;
            if (next >= def.target && save.rewarded.indexOf(taskId) < 0) {
                save.rewarded.push(taskId);
                PowerSystem.add(def.rewardStamina);
                console.log(`[DailyTask] 完成 ${def.name} 体力+${def.rewardStamina}`);
            }
        }
        if (!changed) {
            return;
        }
        DailyTaskSystem.save(save);
        DailyTaskSystem._watch?.();
    }

    private static defs(): DailyTaskDef[] {
        return ConfigManager.getInstance().getTable<DailyTaskDef>("daytask") ?? [];
    }

    private static find(id: number): DailyTaskDef | null {
        const defs = DailyTaskSystem.defs();
        for (let i = 0; i < defs.length; i++) {
            if (defs[i].id === id) {
                return defs[i];
            }
        }
        return null;
    }

    private static save(data: DailySave): void {
        StorageUtil.set(STORAGE_KEY, data);
    }

    private static today(): string {
        const date = new Date();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const mm = month < 10 ? `0${month}` : `${month}`;
        const dd = day < 10 ? `0${day}` : `${day}`;
        return `${date.getFullYear()}-${mm}-${dd}`;
    }
}
