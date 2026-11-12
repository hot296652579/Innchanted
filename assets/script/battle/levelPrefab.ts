import { ConfigManager } from "../../framework/config/ConfigManager";

type LevelRow = {
    id: number;
    map?: number;
};

/** 关卡表 map 对应 game 包里的 Level 预设。表还没载入时按关卡号。 */
export function levelPrefabPath(levelId: number): string {
    const row = ConfigManager.getInstance().getRowById<LevelRow>("levels", levelId);
    const n = row?.map ?? row?.id ?? levelId;
    const map = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
    return `prefab/Level${map}`;
}
