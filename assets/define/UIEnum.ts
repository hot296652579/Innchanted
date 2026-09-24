export interface UIInfo {
    /** UI名称 */
    name: string;
    /** 预制体路径 */
    path: string;
    /** Bundle名称，主包资源可不填 */
    bundle?: string;
    /** 是否缓存 */
    cache?: boolean;
    /** 是否允许重复打开 */
    multiple?: boolean;
    /** 是否模态窗口 */
    modal?: boolean;
}
export const UIConfig = {

    /** 开始界面 */
    StartWnd: {
        name: "StartWnd",
        path: "prefab/start/StartWnd",
        bundle: "ui",
        cache: true,
    },

    /** 选择界面 */
    SelectWnd: {
        name: "SelectWnd",
        path: "prefab/select/SelectWnd",
        bundle: "ui",
        cache: true,
    },

    /** 设置 */
    SettingWnd: {
        name: "SettingWnd",
        path: "prefab/setting/SettingWnd",
        bundle: "ui",
        modal: true,
        cache: false,
    },

    /** 战斗 */
    BattleWnd: {
        name: "BattleWnd",
        path: "prefab/battle/BattleWnd",
        bundle: "ui",
        cache: true,
    },

    /** Tip */
    TipWnd: {
        name: "TipWnd",
        path: "prefab/common/TipWnd",
        bundle: "ui",
        multiple: true,
        cache: false,
    },

    /** Confirm */
    ConfirmWnd: {
        name: "ConfirmWnd",
        path: "prefab/common/ConfirmWnd",
        bundle: "ui",
        modal: true,
        cache: false,
    },

    /** LoadingWnd（主包 resources，进游戏前即可打开） */
    LoadingWnd: {
        name: "LoadingWnd",
        path: "prefab/loading/LoadingWnd",
        cache: true,
    },

    /** 胜利 */
    WinWnd: {
        name: "WinWnd",
        path: "ui/prefab/WinWnd",
        bundle: "game",
        cache: false,
    },

    /** 失败 */
    LoseWnd: {
        name: "LoseWnd",
        path: "ui/prefab/LoseWnd",
        bundle: "game",
        cache: false,
    },
    /** 通关次数添加 */
    CustomUseUp: {
        name: "CustomUseUp",
        path: "ui/prefab/CustomUseUp",
        bundle: "game",
        cache: false,
    },
    /** 重置次数添加 */
    RestartUseUp: {
        name: "RestartUseUp",
        path: "ui/prefab/RestartUseUp",
        bundle: "game",
        cache: false,
    },
    /** 回退次数添加 */
    RevokeWnd: {
        name: "RevokeWnd",
        path: "ui/prefab/RevokeWnd",
        bundle: "game",
        cache: false,
    },
} satisfies Record<string, UIInfo>;