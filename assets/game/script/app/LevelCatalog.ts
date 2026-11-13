import { ConfigManager } from "../../../framework/config/ConfigManager";

/** 一关里某种客人的订单：一维是随机池，二维是多道菜（每道再随机）。 */
export type LevelGuestOrderSlots = string[] | string[][];

/** 引导一步：target 是台子名，guest 表示入座客人的桌子。 */
export type GuideWait = "pulp" | "fill" | "drink" | "serve" | "coin" | "bank" | "tip" | "seat" | "thief" | "chase" | "queue" | "escort" | "roundseat" | "wind" | "ice";

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
        stars: [55, 75, 90],
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

/** 结算时交给星级计算的本关结果。 */
export type StarReport = {
    /** 成功上完菜的客人数。 */
    served: number;
    /** 本关实际要接待的人数（不含教学客）。 */
    guestTotal: number;
    /** 已经过的秒数。 */
    elapsed: number;
    /** 是否在时间耗尽前把客人送走。 */
    cleared: boolean;
    /** 出现过的突发事件次数。锁炉不计入。 */
    eventStarted: number;
    /** 玩家处理掉的次数。 */
    eventHandled: number;
    /** 被偷走的金币。 */
    goldStolen: number;
    /** 被偷走的燃料份数。 */
    fuelStolen: number;
};

const GUEST_POINTS = 50;
const TIME_POINTS = 25;
const EVENT_POINTS = 25;
const PENALTY_CAP = 40;

/**
 * 满分 100，再对照关卡 stars 门槛得到 0～3 星。
 * 接待占 50，提前完成占 25，突发事件占 25。
 * 没配事件时突发分给满。被偷金币每枚扣 2 分，燃料每份扣 8 分，最多扣 40。
 */
export function starScore(level: LevelDef, report: StarReport): number {
    const guests = Math.max(0, report.guestTotal);
    const served = Math.max(0, Math.min(report.served, guests || report.served));
    const guestPart = guests > 0 ? GUEST_POINTS * (served / guests) : GUEST_POINTS;
    const duration = Math.max(1, level.duration);
    const remain = Math.max(0, duration - Math.max(0, report.elapsed));
    const timePart = report.cleared ? TIME_POINTS * (remain / duration) : 0;
    const started = Math.max(0, report.eventStarted);
    const handled = Math.max(0, report.eventHandled);
    const eventPart = started > 0 ? EVENT_POINTS * Math.min(1, handled / started) : EVENT_POINTS;
    const penalty = Math.min(
        PENALTY_CAP,
        Math.max(0, report.goldStolen) * 2 + Math.max(0, report.fuelStolen) * 8,
    );
    return Math.max(0, Math.min(100, guestPart + timePart + eventPart - penalty));
}

/** 分数对照 stars 门槛。0～3，超过 3 档也只记 3 星。 */
export function settleStars(level: LevelDef, report: StarReport): number {
    const score = starScore(level, report);
    const lines = level.stars ?? [];
    let stars = 0;
    const cap = Math.min(3, lines.length);
    for (let i = 0; i < cap; i++) {
        if (score + 1e-6 >= lines[i]) {
            stars = i + 1;
        }
    }
    console.log(
        `[Star] 分 ${score.toFixed(1)} 星 ${stars}`
        + ` 客 ${report.served}/${report.guestTotal}`
        + ` 用时 ${report.elapsed.toFixed(0)}/${level.duration}`
        + ` 事件 ${report.eventHandled}/${report.eventStarted}`
        + ` 丢金 ${report.goldStolen} 丢燃料 ${report.fuelStolen}`,
    );
    return stars;
}
