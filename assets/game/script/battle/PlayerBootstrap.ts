import { _decorator, Component } from "cc";
import { ShiftController } from "../app/ShiftController";
import { NavBakeStarter } from "../navmesh/NavBakeStarter";

const { ccclass } = _decorator;

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
        const recast = await baker.waitReady();
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

    update(dt: number): void {
        this._shift?.update(dt);
    }

    onDestroy(): void {
        this._shift?.clear();
    }
}
