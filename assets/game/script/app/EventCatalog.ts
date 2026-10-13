import { ConfigManager } from "../../../framework/config/ConfigManager";

/** 一条突发事件配置。新 kind 在 INCIDENT_FACTORY 登记即可。 */
export type EventDef = {
    id: string;
    kind: string;
    category?: string;
    delay: number;
    duration: number;
    stealCount?: number;
    freezeTime?: number;
    actorName?: string;
    prefab?: string;
    flySpeed?: number;
    warnText?: string;
    failText?: string;
};

const FALLBACK: EventDef[] = [
    {
        id: "thief",
        kind: "thief",
        category: "attack",
        delay: 12,
        duration: 20,
        stealCount: 2,
        actorName: "Bat",
        prefab: "prefab/enemys/Bat",
        flySpeed: 6,
        warnText: "小偷来袭！20秒后会偷走成品！",
        failText: "蝙蝠偷走了成品！",
    },
];

export function allEventDefs(): EventDef[] {
    return ConfigManager.getInstance().getTable<EventDef>("events") ?? FALLBACK;
}
