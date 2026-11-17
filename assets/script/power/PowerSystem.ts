import { StorageUtil } from "../../framework/utils/StorageUtil";

/** 体力上限。 */
export const POWER_MAX = 30;
/** 新号初始体力。 */
export const POWER_INIT = 30;
/** 进入一次关卡消耗。 */
export const POWER_ENTER_COST = 5;
/** 恢复 1 点所需毫秒。 */
export const POWER_RECOVER_MS = 3 * 60 * 1000;

const STORAGE_KEY = "player.power";

type PowerSave = {
    value: number;
    /** 不满体力时，从这一刻起计算下一点的恢复。 */
    tickAt: number;
};

/** 本地体力。离线时间也会按 1 点 / 3 分钟补上，不超过上限。 */
export class PowerSystem {
    /** 当前体力。读取时先结算恢复。 */
    static get current(): number {
        return this.settle().value;
    }

    static get max(): number {
        return POWER_MAX;
    }

    /** 增加体力，不超过上限。给每日任务用。返回增加后的值。 */
    static add(amount: number): number {
        const gain = Math.floor(amount);
        const data = this.settle();
        if (gain <= 0) {
            return data.value;
        }
        data.value = Math.min(POWER_MAX, data.value + gain);
        if (data.value >= POWER_MAX) {
            data.tickAt = Date.now();
        }
        this.save(data);
        return data.value;
    }

    /**
     * 减少体力。不够则不扣，返回 false。
     * 给每日任务或进关消耗用。
     */
    static reduce(amount: number): boolean {
        const cost = Math.floor(amount);
        if (cost <= 0) {
            return true;
        }
        const data = this.settle();
        if (data.value < cost) {
            return false;
        }
        const wasFull = data.value >= POWER_MAX;
        data.value -= cost;
        if (wasFull) {
            data.tickAt = Date.now();
        }
        this.save(data);
        return true;
    }

    /** 进入关卡，扣 5 点。体力不够返回 false。 */
    static enterLevel(): boolean {
        return this.reduce(POWER_ENTER_COST);
    }

    private static settle(): PowerSave {
        const data = this.load();
        if (data.value >= POWER_MAX) {
            data.value = POWER_MAX;
            return data;
        }
        const elapsed = Date.now() - data.tickAt;
        if (elapsed < POWER_RECOVER_MS) {
            return data;
        }
        const gained = Math.floor(elapsed / POWER_RECOVER_MS);
        data.value = Math.min(POWER_MAX, data.value + gained);
        data.tickAt = data.value >= POWER_MAX ? Date.now() : data.tickAt + gained * POWER_RECOVER_MS;
        this.save(data);
        return data;
    }

    private static load(): PowerSave {
        const saved = StorageUtil.get<PowerSave | null>(STORAGE_KEY, null);
        if (!saved || !Number.isFinite(saved.value) || !Number.isFinite(saved.tickAt)) {
            const fresh: PowerSave = { value: POWER_INIT, tickAt: Date.now() };
            this.save(fresh);
            return fresh;
        }
        const value = Math.max(0, Math.min(POWER_MAX, Math.floor(saved.value)));
        return { value, tickAt: saved.tickAt };
    }

    private static save(data: PowerSave): void {
        StorageUtil.set(STORAGE_KEY, data);
    }
}
