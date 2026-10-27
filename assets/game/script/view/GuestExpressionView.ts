import { Camera, instantiate, Label, Node, Prefab, tween, Tween, UIOpacity, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { allGuestDefs } from "../app/GuestCatalog";

export type ExpressionKind = "happy" | "urge" | "angry" | "wake" | "hint" | "scared" | "threaten" | "attention" | "death";

const EXPRESS_SEC = 1;
const UI_Y_OFFSET = 8;
const SLEEP_Y_OFFSET = 48;
const WAKE_Y_OFFSET = 48;
const FACE_RISE = 90;
const ATTENTION_Y_OFFSET = 40;
const TALK_Y_OFFSET = 72;
const TALK_PATH = "prefab/expression/Talk";
const SWAY_ANGLE = 8;
const SWAY_SEC = 0.65;
const PATHS: Record<ExpressionKind, string> = {
    happy: "prefab/expression/Happy",
    urge: "prefab/expression/Urge",
    angry: "prefab/expression/Angry",
    wake: "prefab/expression/WeekUp",
    hint: "prefab/expression/QuestionMark",
    scared: "prefab/expression/Scared",
    threaten: "prefab/expression/Threaten",
    attention: "prefab/expression/Attention",
    death: "prefab/expression/Death",
};

const _world = new Vec3();
const _local = new Vec3();

interface FaceSession {
    follow: Node | null;
    world: Vec3 | null;
    node: Node;
    kind: ExpressionKind;
    remain: number;
    yOffset: number;
    riseTo: number;
    onDone: (() => void) | null;
}

interface FollowSession {
    follow: Node;
    node: Node;
    yOffset?: number;
}

/** 客人头顶表情：挂 SCENE_UI，跟随 3D 坐标。开心/催促/生气/醒来到时销毁；睡觉晃动、问号提示一直挂着。 */
export class GuestExpressionView {
    private readonly _prefabs = new Map<ExpressionKind, Prefab>();
    private readonly _sleepPrefabs = new Map<string, Prefab>();
    private readonly _sessions = new Map<string, FaceSession>();
    private readonly _sleeps = new Map<string, FollowSession>();
    private readonly _hints = new Map<string, FollowSession>();
    private readonly _talks = new Map<string, FollowSession>();
    private _talkPrefab: Prefab | null = null;

    constructor(private readonly camera: Camera | null) { }

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const kinds: ExpressionKind[] = ["happy", "urge", "angry", "wake", "hint", "scared", "threaten", "attention", "death"];
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
        this._talkPrefab = await res.loadPrefab(TALK_PATH, BundlesEnum.Game);
        if (!this._talkPrefab) {
            console.warn("[Guest] 未找到聊天气泡", TALK_PATH);
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
        this._sessions.set(guestId, this.makeSession(node, kind, follow, null, onDone));
        this.place(this._sessions.get(guestId)!);
    }

    /** 钉在世界坐标：死亡图标漂浮淡出，不跟尸体。 */
    playAtWorld(id: string, world: Vec3, kind: ExpressionKind, onDone?: () => void): void {
        this.hideFace(id);
        const prefab = this._prefabs.get(kind);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!prefab || !uiRoot) {
            onDone?.();
            return;
        }
        const node = instantiate(prefab);
        node.name = `Face_${kind}_${id}`;
        uiRoot.addChild(node);
        this._sessions.set(id, this.makeSession(node, kind, null, world.clone(), onDone));
        this.place(this._sessions.get(id)!);
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

    /** 一次性提示客：订单闪过后持续显示问号。 */
    showHint(guestId: string, follow: Node): void {
        this.hideHint(guestId);
        const prefab = this._prefabs.get("hint");
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!prefab || !uiRoot) {
            return;
        }
        const node = instantiate(prefab);
        node.name = `Hint_${guestId}`;
        uiRoot.addChild(node);
        this._hints.set(guestId, { follow, node });
        this.follow(node, follow, UI_Y_OFFSET);
    }

    /** 常驻聊天气泡，跟在 3D 目标头顶。 */
    showTalk(id: string, follow: Node, text: string, yOffset = TALK_Y_OFFSET): void {
        const keep = this._talks.get(id);
        if (keep?.node.isValid) {
            keep.follow = follow;
            keep.yOffset = yOffset;
            this.setTalkText(keep.node, text);
            this.follow(keep.node, follow, yOffset);
            return;
        }
        this.hideTalk(id);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!this._talkPrefab || !uiRoot) {
            return;
        }
        const node = instantiate(this._talkPrefab);
        node.name = `Talk_${id}`;
        uiRoot.addChild(node);
        this.setTalkText(node, text);
        this._talks.set(id, { follow, node, yOffset });
        this.follow(node, follow, yOffset);
    }

    hideTalk(id: string): void {
        this.clearFollow(this._talks, id);
    }

    hide(guestId: string): void {
        this.hideFace(guestId);
        this.hideSleep(guestId);
        this.hideHint(guestId);
        this.hideTalk(guestId);
    }

    hideSleep(guestId: string): void {
        this.clearFollow(this._sleeps, guestId);
    }

    hideHint(guestId: string): void {
        this.clearFollow(this._hints, guestId);
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
            if (session.node.isValid) {
                this.place(session);
            }
        });
        this._sleeps.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                this.follow(session.node, session.follow, SLEEP_Y_OFFSET);
            }
        });
        this._hints.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                this.follow(session.node, session.follow, UI_Y_OFFSET);
            }
        });
        this._talks.forEach((session) => {
            if (session.node.isValid && session.follow.isValid) {
                this.follow(session.node, session.follow, session.yOffset ?? TALK_Y_OFFSET);
            }
        });
    }

    private setTalkText(node: Node, text: string): void {
        const label = node.getComponentInChildren(Label);
        if (label) {
            label.string = text;
        }
    }

    private clearFollow(map: Map<string, FollowSession>, guestId: string): void {
        const session = map.get(guestId);
        if (!session) {
            return;
        }
        map.delete(guestId);
        Tween.stopAllByTarget(session.node);
        if (session.node.isValid) {
            session.node.destroy();
        }
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

    private makeSession(
        node: Node,
        kind: ExpressionKind,
        follow: Node | null,
        world: Vec3 | null,
        onDone?: () => void,
    ): FaceSession {
        return {
            follow,
            world,
            node,
            kind,
            remain: EXPRESS_SEC,
            yOffset: this.yOffsetOf(kind),
            riseTo: FACE_RISE,
            onDone: onDone ?? null,
        };
    }

    private yOffsetOf(kind: ExpressionKind): number {
        if (kind === "wake") {
            return WAKE_Y_OFFSET;
        }
        if (kind === "attention" || kind === "death") {
            return ATTENTION_Y_OFFSET;
        }
        return UI_Y_OFFSET;
    }

    private place(session: FaceSession): void {
        const t = 1 - Math.max(0, session.remain) / EXPRESS_SEC;
        const y = session.yOffset + session.riseTo * t;
        if (session.follow?.isValid) {
            this.follow(session.node, session.follow, y);
        } else if (session.world) {
            this.placeWorld(session.node, session.world, y);
        }
        const fade = session.node.getComponent(UIOpacity) ?? session.node.addComponent(UIOpacity);
        fade.opacity = Math.round(255 * (1 - t));
    }

    private follow(face: Node, target: Node, yOffset: number): void {
        this.placeWorld(face, target.worldPosition, yOffset);
    }

    private placeWorld(face: Node, world: Vec3, yOffset: number): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        _world.set(world.x, world.y, world.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        face.setPosition(_local.x, _local.y + yOffset, 0);
    }
}
