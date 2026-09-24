/**
 * 全局事件名枚举
 */
export enum GameEvent {
    // 通用弹窗提示
    SHOW_TIPS = "SHOW_TIPS",

    /** 整张地图数据已重建（切关卡 / 首次加载） */
    MAP_REBUILD = "MAP_REBUILD",
    /** 某一格数据变了（挖土） */
    MAP_CELL_CHANGED = "MAP_CELL_CHANGED",

    /** 角色已出生 */
    CHARACTER_SPAWNED = "CHARACTER_SPAWNED",
    /** 角色走到新格子 */
    CHARACTER_MOVED = "CHARACTER_MOVED",

    /** 起点到终点的道路已连通，打通特效播完后开始沿路径行走 */
    PATH_CONNECTED = "PATH_CONNECTED",
    /** 角色已走到终点 */
    PATH_REACH_GOAL = "PATH_REACH_GOAL",

    /** 本关胜利（角色走到终点后） */
    BATTLE_WIN = "BATTLE_WIN",
    /** 本关失败（挖掘次数归零且未连通） */
    BATTLE_LOSE = "BATTLE_LOSE",

    /** 战斗数据变化（铲子、关卡名、可否撤回） */
    BATTLE_STATE_CHANGE = "BATTLE_STATE_CHANGE",
    /** 战斗界面点击刷新关卡 */
    BATTLE_REFRESH_CLICK = "BATTLE_REFRESH_CLICK",
    /** 战斗界面点击撤回挖掘 */
    BATTLE_UNDO_CLICK = "BATTLE_UNDO_CLICK",
    /** 战斗界面点击返回 退回到关卡选择界面*/
    BATTLE_BACK_CLICK = "BATTLE_BACK_CLICK",
}