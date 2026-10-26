import { Camera, instantiate, Node, Prefab, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { StationBinding } from "../sim/StationRegistry";

const WARNING_PATH = "prefab/expression/Warning";
const UI_Y_OFFSET = 0;
const _world = new Vec3();
const _local = new Vec3();

interface Session {
    binding: StationBinding;
    node: Node;
}

/** 损坏警告：挂 SCENE_UI，跟随操作台上方，直到班次结束。 */
export class BrokenView {
    private _prefab: Prefab | null = null;
    private readonly _sessions = new Map<string, Session>();

    constructor(private readonly camera: Camera | null) { }

    async load(): Promise<void> {
        this._prefab = await ResourceManager.getInstance().loadPrefab(WARNING_PATH, BundlesEnum.Game);
        if (!this._prefab) {
            console.warn("[Broken] 未找到", WARNING_PATH);
        }
    }

    show(binding: StationBinding): void {
        this.hide(binding.station.id);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!uiRoot || !this._prefab) {
            return;
        }
        const node = instantiate(this._prefab);
        node.name = `Warning_${binding.station.id}`;
        uiRoot.addChild(node);
        this._sessions.set(binding.station.id, { binding, node });
        this.follow(node, binding);
    }

    hide(stationId: string): void {
        const session = this._sessions.get(stationId);
        if (!session) {
            return;
        }
        this._sessions.delete(stationId);
        if (session.node.isValid) {
            session.node.destroy();
        }
    }

    update(): void {
        this._sessions.forEach((session) => {
            if (session.node.isValid) {
                this.follow(session.node, session.binding);
            }
        });
    }

    clear(): void {
        this._sessions.forEach((session) => {
            if (session.node.isValid) {
                session.node.destroy();
            }
        });
        this._sessions.clear();
    }

    private follow(node: Node, binding: StationBinding): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        const from = binding.holdPoint.isValid ? binding.holdPoint : binding.node;
        const world = from.worldPosition;
        _world.set(world.x, world.y, world.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        node.setPosition(_local.x, _local.y + UI_Y_OFFSET, 0);
    }
}
