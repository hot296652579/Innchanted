import { ConfigManager } from "../../../framework/config/ConfigManager";

/** 一条突发事件配置。新 kind 在 INCIDENT_FACTORY 登记即可。 */
export type EventDef = {
    id: string;
    kind: string;
    category?: string;
    delay: number;
    duration: number;
    stealCount?: number;
    stealGold?: number;
    freezeTime?: number;
    slowScale?: number;
    actorName?: string;
    spawnName?: string;
    prefab?: string;
    flySpeed?: number;
    hoverTime?: number;
    warnText?: string;
    failText?: string;
};

const FALLBACK: EventDef[] = [
    {
        id: "skeleton",
        kind: "skeleton",
        category: "attack",
        delay: 0,
        duration: 8,
        stealCount: 5,
        stealGold: 5,
        actorName: "Skeleton",
        spawnName: "SwapnPoint",
        prefab: "prefab/enemys/Skeleton",
        flySpeed: 0.9,
        hoverTime: 1,
        warnText: "骷髅小偷冲向宝箱！",
        failText: "骷髅偷走了金币！",
    },
    {
        id: "thief",
        kind: "thief",
        category: "attack",
        delay: 25,
        duration: 20,
        stealCount: 2,
        actorName: "Bat",
        prefab: "prefab/enemys/Bat",
        flySpeed: 6,
        hoverTime: 2,
        warnText: "小偷来袭！20秒后会偷走成品！",
        failText: "蝙蝠偷走了成品！",
    },
    {
        id: "fuelthief",
        kind: "fuelthief",
        category: "raid",
        delay: 10,
        duration: 12,
        stealCount: 1,
        actorName: "FuelThief",
        spawnName: "FuelSwapnPoint",
        prefab: "prefab/enemys/FuelThief",
        flySpeed: 1.4,
        hoverTime: 2,
        warnText: "有人来偷魔法饮料了！",
        failText: "小偷偷走了魔法饮料！",
    },
    {
        id: "threaten",
        kind: "threaten",
        category: "raid",
        delay: 6,
        duration: 12,
        actorName: "Threaten",
        spawnName: "ThreatenPoint",
        prefab: "prefab/enemys/Threaten",
        flySpeed: 4.5,
        warnText: "恐吓怪来了！",
        failText: "客人被吓跑了！",
    },
    {
        id: "lock",
        kind: "lock",
        category: "status",
        delay: 8,
        duration: 0,
        freezeTime: 5,
        failText: "未上锁的灶炉被锁住 5 秒！",
    },
    {
        id: "ice",
        kind: "ice",
        category: "status",
        delay: 12,
        duration: 0,
        freezeTime: 1,
        slowScale: 0.4,
        actorName: "Dragon",
        prefab: "prefab/enemys/Dragon",
        flySpeed: 5,
        warnText: "冰龙来袭！",
        failText: "地面被冻结了！",
    },
];

export function allEventDefs(): EventDef[] {
    return ConfigManager.getInstance().getTable<EventDef>("events") ?? FALLBACK;
}
