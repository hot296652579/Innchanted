import { Camera, instantiate, Node, Prefab, tween, Tween, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { allGuestDefs } from "../app/GuestCatalog";

export type ExpressionKind = "happy" | "urge" | "angry" | "wake";

const EXPRESS_SEC = 1;
const UI_Y_OFFSET = 8;
const SLEEP_Y_OFFSET = 48;
const WAKE_Y_OFFSET = 48;
const WAKE_RISE = 48;
const SWAY_ANGLE = 8;
const SWAY_SEC = 0.65;
const PATHS: Record<ExpressionKind, string> = {
    happy: "prefab/expression/Happy",
    urge: "prefab/expression/Urge",
    angry: "prefab/expression/Angry",
    wake: "prefab/expression/WeekUp",
};

const _world = new Vec3();
const _local = new Vec3();

interface FaceSession {
    follow: Node;
    node: Node;
    remain: number;
    yOffset: number;
    riseTo: number;
    onDone: (() => void) | null;
}

interface SleepSession {
    follow: Node;
    node: Node;
}

/** 客人头顶表情：挂 SCENE_UI，跟随 3D 坐标，到时销毁。睡觉表情一直挂着并轻微晃动。 */
export class GuestExpressionView {
    private readonly _prefabs = new Map<ExpressionKind, Prefab>();
    private readonly _sleepPrefabs = new Map<string, Prefab>();
    private readonly _sessions = new Map<string, FaceSession>();
    private readonly _sleeps = new Map<string, SleepSession>();

    constructor(private readonly camera: Camera | null) { }

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const kinds: ExpressionKind[] = ["happy", "urge", "angry", "wake"];
        for (let i = 0; i < kinds.length; i++) {
            const kind = kinds[i];
            const prefab = await res.loadPrefab(PATHS[kind], BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Guest] 未找到表情", PATHS[kind]);
                continue;
            }
            this._prefabs.set(kind, prefab);
        }
        const defs = allGuestDefs();
        const seen = new Set<string>();
        for (let i = 0; i < defs.length; i++) {
            const path = defs[i].sleepPrefab;
            if (!path || seen.has(path)) {
                continue;
            }
            seen.add(path);
            const prefab = await res.loadPrefab(path, BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Guest] 未找到睡觉表情", path);
                continue;
            }
            this._sleepPrefabs.set(path, prefab);
        }
    }

    play(guestId: string, follow: Node, kind: ExpressionKind, onDone?: () => void): void {
        this.hideFace(guestId);
        const prefab = this._prefabs.get(kind);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!prefab || !uiRoot) {
            onDone?.();
            return;
        }
        const node = instantiate(prefab);
        node.name = `Face_${kind}_${guestId}`;
        uiRoot.addChild(node);
        const yOffset = kind === "wake" ? WAKE_Y_OFFSET : UI_Y_OFFSET;
        this._sessions.set(guestId, {
            follow,
            node,
            remain: EXPRESS_SEC,
            yOffset,
            riseTo: kind === "wake" ? WAKE_RISE : 0,
            onDone: onDone ?? null,
        });
        this.follow(node, follow, yOffset);
    }

    showSleep(guestId: string, follow: Node, path: string): void {
        this.hideSleep(guestId);
        const prefab = this._sleepPrefabs.get(path);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!prefab || !uiRoot) {
            return;
        }
        const node = instantiate(prefab);
        node.name = `Sleep_${guestId}`;
        uiRoot.addChild(node);
        this._sleeps.set(guestId, { follow, node });
        this.follow(node, follow, SLEEP_Y_OFFSET);
        this.startSway(node);
    }

    hide(guestId: string): void {
        this.hideFace(guestId);
        this.hideSleep(guestId);
    }

    hideSleep(guestId: string): void {
        const session = this._sleeps.get(guestId);
        if (!session) {
            return;
        }
        this._sleeps.delete(guestId);
        Tween.stopAllByTarget(session.node);
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
            this.hideFace(id);
            done?.();
        }
    }

    update(): void {
        this._sessions.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                const t = 1 - Math.max(0, session.remain) / EXPRESS_SEC;
                this.follow(session.node, session.follow, session.yOffset + session.riseTo * t);
            }
        });
        this._sleeps.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                this.follow(session.node, session.follow, SLEEP_Y_OFFSET);
            }
        });
    }

    private hideFace(guestId: string): void {
        const session = this._sessions.get(guestId);
        if (!session) {
            return;
        }
        this._sessions.delete(guestId);
        Tween.stopAllByTarget(session.node);
        if (session.node.isValid) {
            session.node.destroy();
        }
    }

    private startSway(node: Node): void {
        Tween.stopAllByTarget(node);
        node.angle = 0;
        tween(node)
            .repeatForever(
                tween().to(SWAY_SEC, { angle: SWAY_ANGLE }).to(SWAY_SEC, { angle: -SWAY_ANGLE }),
            )
            .start();
    }

    private follow(face: Node, target: Node, yOffset: number): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        const pos = target.worldPosition;
        _world.set(pos.x, pos.y, pos.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        face.setPosition(_local.x, _local.y + yOffset, 0);
    }
}
