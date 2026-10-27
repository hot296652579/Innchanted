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

    /** 玩家发出新单击指令 */
    COMMAND_ISSUED = "COMMAND_ISSUED",
    /** 玩家/伙伴手里物品变化 */
    ITEM_HELD_CHANGED = "ITEM_HELD_CHANGED",
    /** 放置台槽位变化 */
    STATION_SLOT_CHANGED = "STATION_SLOT_CHANGED",
    /** 客人入座并亮出订单 */
    ORDER_SHOWN = "ORDER_SHOWN",
    /** 上菜成功 */
    GUEST_SERVED = "GUEST_SERVED",
    /** 桌上出现金币 */
    SHELL_SPAWNED = "SHELL_SPAWNED",
    /** 金币存进宝箱 */
    SHELL_BANKED = "SHELL_BANKED",
    /** 本关倒计时（剩余秒，取整） */
    LEVEL_TIME_CHANGED = "LEVEL_TIME_CHANGED",
    /** 本关入箱金币变化 */
    LEVEL_GOLD_CHANGED = "LEVEL_GOLD_CHANGED",
    /** 本关时间到 */
    LEVEL_TIME_UP = "LEVEL_TIME_UP",
    /** 客人等待超时生气 */
    GUEST_ANGRY = "GUEST_ANGRY",
    /** 客人走到离店点 */
    GUEST_LEFT = "GUEST_LEFT",
    /** 加工台完成 */
    PROCESSOR_READY = "PROCESSOR_READY",

    /** 班次开始，弹出准备 */
    SHIFT_READY = "SHIFT_READY",
    /** 关卡 delay 到，开始招待客人 */
    GUEST_INVITE = "GUEST_INVITE",

    /** 突发事件进入预兆倒计时 */
    EVENT_WARN = "EVENT_WARN",
    /** 突发事件超时，后果开始结算 */
    EVENT_FAIL = "EVENT_FAIL",
    /** 突发事件整段结束（含动画） */
    EVENT_RESOLVED = "EVENT_RESOLVED",
    /** 地面结冰（秒，默认 1） */
    GROUND_ICE_FREEZE = "GROUND_ICE_FREEZE",
    /** 地面解冻（秒，默认 1） */
    GROUND_ICE_THAW = "GROUND_ICE_THAW",
}