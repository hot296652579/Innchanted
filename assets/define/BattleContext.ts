import { storage } from "../framework/resource/Storage";

export interface BattleState {
    levelId: number;
    levelName: string;
    shovels: number;
    maxShovels: number;
    refreshCount: number;
    revokeCount: number;
    canUndo: boolean;
}

const KEY_UNLOCKED_LEVEL = "progress.unlockedLevelId";

export class BattleContext {
    public static selectedLevelId = 1;
    /** 回到 Start 场景后要打开的窗口名，空则打开 StartWnd */
    public static pendingStartWindow: string | null = null;

    /** 已解锁的最高关卡，默认第 1 关 */
    public static getUnlockedLevelId(): number {
        const id = Number(storage.getItem(KEY_UNLOCKED_LEVEL, 1));
        return Number.isFinite(id) && id >= 1 ? Math.floor(id) : 1;
    }

    public static isLevelUnlocked(levelId: number): boolean {
        return levelId <= this.getUnlockedLevelId();
    }

    /** 通关后解锁下一关 */
    public static completeLevel(levelId: number): void {
        if (levelId < 1) {
            return;
        }
        const unlocked = this.getUnlockedLevelId();
        if (levelId >= unlocked) {
            storage.setItem(KEY_UNLOCKED_LEVEL, levelId + 1);
        }
    }
}
