import { _decorator, Component } from "cc";
import { BattleContext } from "../../../define/BattleContext";
import { UIConfig } from "../../../define/UIEnum";
import { UIManager } from "../../../framework/ui/UIManager";
import { ShiftController } from "../app/ShiftController";
import { NavBakeStarter } from "../navmesh/NavBakeStarter";
import { VideoWndParam } from "../wnd/VideoWnd";

const { ccclass } = _decorator;

const INTRO_LEVEL_ID = 1;

/** 场景钩子：等 NavBake 就绪后把一局交给 ShiftController。 */
@ccclass("PlayerBootstrap")
export class PlayerBootstrap extends Component {
    private _shift: ShiftController | null = null;

    async start(): Promise<void> {
        const baker = this.getComponent(NavBakeStarter);
        if (!baker) {
            console.error("[Player] 未找到 NavBakeStarter");
            return;
        }
        const intro = BattleContext.selectedLevelId === INTRO_LEVEL_ID
            ? this.playIntro()
            : Promise.resolve();
        const recast = await baker.waitReady();
        await intro;
        if (!this.isValid) {
            return;
        }
        const player = baker.player;
        const stationRoot = baker.stationRoot;
        if (!player || !stationRoot || !baker.camera) {
            console.error("[Player] Player / Station / Camera 未就绪");
            return;
        }

        this._shift = new ShiftController();
        await this._shift.start({
            recast,
            host: this,
            player,
            stationRoot,
            camera: baker.camera,
            yawOffset: baker.yawOffset,
            turnSpeed: baker.turnSpeed,
            levelRoot: baker.navBake?.parent ?? baker.node.parent ?? baker.node,
            planeRoot: baker.navBake?.getChildByName("Plane") ?? baker.navBake,
        });
    }

    /** 打开视频窗口，播完或跳过后 resolve。 */
    private playIntro(): Promise<void> {
        return new Promise((resolve) => {
            const param: VideoWndParam = { onDone: resolve };
            void UIManager.getInstance().openWindow(UIConfig.VideoWnd.name, param).then((win) => {
                if (!win) {
                    resolve();
                }
            });
        });
    }

    update(dt: number): void {
        this._shift?.update(dt);
    }

    onDestroy(): void {
        this._shift?.clear();
        this._shift = null;
    }
}
