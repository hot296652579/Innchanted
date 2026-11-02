import { ConfigManager } from "../../../framework/config/ConfigManager";

/** 一关里某种客人的订单：一维是随机池，二维是多道菜（每道再随机）。 */
export type LevelGuestOrderSlots = string[] | string[][];

/** 引导一步：target 是台子名，guest 表示入座客人的桌子。 */
export type GuideWait = "pulp" | "fill" | "drink" | "serve" | "coin" | "bank" | "tip";

export type GuideStepDef = {
    target: string;
    text: string;
    wait: GuideWait;
    /** tip 步停留秒数，点任意处也可结束。 */
    duration?: number;
};

export type LevelDef = {
    id: number;
    duration: number;
    stars: number[];
    eventIds?: string[];
    guests?: string[] | string[][];
    guestOrders?: Record<string, LevelGuestOrderSlots>;
    delay?: number;
    guestInterval?: number;
    restTimes?: number[];
    restDuration?: number;
    guide?: GuideStepDef[];
    map?: number;
};

/** 关卡客人按波次。一维配置当成一整波。 */
export function guestWaves(guests?: string[] | string[][]): string[][] {
    if (!guests || guests.length === 0) {
        return [];
    }
    if (Array.isArray(guests[0])) {
        return guests as string[][];
    }
    return [guests as string[]];
}

const FALLBACK: LevelDef[] = [
    {
        id: 1,
        duration: 180,
        stars: [20, 40, 70],
        eventIds: ["lock", "thief", "whirlwind"],
        restTimes: [30, 60],
        restDuration: 5,
        guests: [
            ["soldierguest", "mageguest"],
            ["regularguest", "regularguest"],
            ["gourmetguest"],
        ],
    },
];

export function allLevels(): LevelDef[] {
    return ConfigManager.getInstance().getTable<LevelDef>("levels") ?? FALLBACK;
}

export function findLevel(levelId: number): LevelDef {
    const table = allLevels();
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === levelId) {
            return table[i];
        }
    }
    return table[0] ?? FALLBACK[0];
}

export function hasLevel(levelId: number): boolean {
    const table = allLevels();
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === levelId) {
            return true;
        }
    }
    return false;
}

/** 场景预设：map 几就用 Level几。没写 map 时按关卡号。 */
export function mapOf(level: LevelDef): number {
    const n = level.map ?? level.id;
    if (Number.isFinite(n) && n >= 1) {
        return Math.floor(n);
    }
    return 1;
}

/** 入箱金币对照星级线。0～3。星级算法待定，结算暂不调用。 */
export function starOfGold(level: LevelDef, gold: number): number {
    const stars = level.stars ?? [];
    let n = 0;
    for (let i = 0; i < stars.length; i++) {
        if (gold >= stars[i]) {
            n = i + 1;
        }
    }
    return n;
}

/** 关卡星级。算法待定，暂时返回 0。 */
export function settleStars(_level: LevelDef, _gold: number): number {
    return 0;
}
