import { Camera, instantiate, Node, Prefab, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";

export type ExpressionKind = "happy" | "urge" | "angry";

const EXPRESS_SEC = 1;
const UI_Y_OFFSET = 40;
const PATHS: Record<ExpressionKind, string> = {
    happy: "prefab/expression/Happy",
    urge: "prefab/expression/Urge",
    angry: "prefab/expression/Angry",
};

const _world = new Vec3();
const _local = new Vec3();

interface FaceSession {
    follow: Node;
    node: Node;
    remain: number;
    onDone: (() => void) | null;
}

/** 客人头顶表情：挂 SCENE_UI，跟随 3D 坐标，到时销毁。 */
export class GuestExpressionView {
    private readonly _prefabs = new Map<ExpressionKind, Prefab>();
    private readonly _sessions = new Map<string, FaceSession>();

    constructor(private readonly camera: Camera | null) {}

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const kinds: ExpressionKind[] = ["happy", "urge", "angry"];
        for (let i = 0; i < kinds.length; i++) {
            const kind = kinds[i];
            const prefab = await res.loadPrefab(PATHS[kind], BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Guest] 未找到表情", PATHS[kind]);
                continue;
            }
            this._prefabs.set(kind, prefab);
        }
    }

    play(guestId: string, follow: Node, kind: ExpressionKind, onDone?: () => void): void {
        this.hide(guestId);
        const prefab = this._prefabs.get(kind);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!prefab || !uiRoot) {
            onDone?.();
            return;
        }
        const node = instantiate(prefab);
        node.name = `Face_${kind}_${guestId}`;
        uiRoot.addChild(node);
        this._sessions.set(guestId, {
            follow,
            node,
            remain: EXPRESS_SEC,
            onDone: onDone ?? null,
        });
        this.follow(node, follow);
    }

    hide(guestId: string): void {
        const session = this._sessions.get(guestId);
        if (!session) {
            return;
        }
        this._sessions.delete(guestId);
        if (session.node.isValid) {
            session.node.destroy();
        }
    }

    tick(dt: number): void {
        const ids = Array.from(this._sessions.keys());
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const session = this._sessions.get(id);
            if (!session) {
                continue;
            }
            session.remain -= dt;
            if (session.remain > 0) {
                continue;
            }
            const done = session.onDone;
            this.hide(id);
            done?.();
        }
    }

    update(): void {
        this._sessions.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                this.follow(session.node, session.follow);
            }
        });
    }

    private follow(face: Node, target: Node): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        const pos = target.worldPosition;
        _world.set(pos.x, pos.y, pos.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        face.setPosition(_local.x, _local.y + UI_Y_OFFSET, 0);
    }
}
