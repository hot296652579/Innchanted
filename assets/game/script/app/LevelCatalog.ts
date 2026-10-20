import { ConfigManager } from "../../../framework/config/ConfigManager";

export type LevelDef = {
    id: number;
    duration: number;
    stars: number[];
};

const FALLBACK: LevelDef[] = [
    { id: 1, duration: 180, stars: [20, 40, 70] },
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
