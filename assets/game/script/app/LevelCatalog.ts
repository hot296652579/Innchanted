import { ConfigManager } from "../../../framework/config/ConfigManager";

/** 一关里某种客人的订单：一维是随机池，二维是多道菜（每道再随机）。 */
export type LevelGuestOrderSlots = string[] | string[][];

export type LevelDef = {
    id: number;
    duration: number;
    stars: number[];
    eventIds?: string[];
    guests?: string[];
    guestOrders?: Record<string, LevelGuestOrderSlots>;
    delay?: number;
    guestInterval?: number;
    map?: number;
};

const FALLBACK: LevelDef[] = [
    {
        id: 1,
        duration: 180,
        stars: [20, 40, 70],
        eventIds: ["lock", "thief", "whirlwind"],
        guests: ["soldierguest", "mageguest", "regularguest", "regularguest", "gourmetguest"],
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

/** 场景预设：1/2/3 对应 Level1/2/3。没写 map 时按关卡号，超过 3 用 Level3。 */
export function mapOf(level: LevelDef): number {
    const n = level.map ?? level.id;
    if (n === 2 || n === 3) {
        return n;
    }
    return 1;
}

/** 入箱金币对照星级线。0～3。结算时再用。 */
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
