import { Camera, instantiate, Node, Prefab, ProgressBar, Vec3, Widget } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";

const BAR_PATH = "prefab/LoadingBar";
const BAR_Y_OFFSET = 90;
const MARK_Y_OFFSET = 18;
const _world = new Vec3();
const _local = new Vec3();

/** 引座进度条 + 圆桌标识。挂 SCENE_UI。 */
export class EscortView {
    private _barPrefab: Prefab | null = null;
    private _bar: Node | null = null;
    private _meter: ProgressBar | null = null;
    private _follow: Node | null = null;
    private readonly _marks = new Map<string, Node>();
    private readonly _markPrefabs = new Map<string, Prefab>();

    constructor(private readonly camera: Camera | null) {}

    async load(): Promise<void> {
        this._barPrefab = await ResourceManager.getInstance().loadPrefab(BAR_PATH, BundlesEnum.Game);
        if (!this._barPrefab) {
            console.warn("[Escort] 未找到", BAR_PATH);
        }
    }

    async ensureMark(path: string): Promise<void> {
        if (!path || this._markPrefabs.has(path)) {
            return;
        }
        const prefab = await ResourceManager.getInstance().loadPrefab(path, BundlesEnum.Game);
        if (prefab) {
            this._markPrefabs.set(path, prefab);
        } else {
            console.warn("[Escort] 未找到标识", path);
        }
    }

    showBar(follow: Node, progress = 0): void {
        this.hideBar();
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!uiRoot || !this._barPrefab) {
            return;
        }
        const bar = instantiate(this._barPrefab);
        bar.name = "EscortLoading";
        uiRoot.addChild(bar);
        this._bar = bar;
        this._meter = bar.getComponentInChildren(ProgressBar);
        this._follow = follow;
        this.setProgress(progress);
        this.follow(bar, follow, BAR_Y_OFFSET);
    }

    setProgress(value: number): void {
        if (this._meter) {
            this._meter.progress = Math.min(1, Math.max(0, value));
        }
    }

    hideBar(): void {
        if (this._bar?.isValid) {
            this._bar.destroy();
        }
        this._bar = null;
        this._meter = null;
        this._follow = null;
    }

    showMark(tableId: string, path: string, follow: Node): void {
        this.hideMark(tableId);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        const prefab = this._markPrefabs.get(path);
        if (!uiRoot || !prefab) {
            return;
        }
        const node = instantiate(prefab);
        node.name = `Mark_${tableId}`;
        uiRoot.addChild(node);
        this._marks.set(tableId, node);
        this.follow(node, follow, MARK_Y_OFFSET);
    }

    hideMark(tableId: string): void {
        const node = this._marks.get(tableId);
        this._marks.delete(tableId);
        if (node?.isValid) {
            node.destroy();
        }
    }

    update(): void {
        if (this._bar?.isValid && this._follow?.isValid) {
            this.follow(this._bar, this._follow, BAR_Y_OFFSET);
        }
        this._marks.forEach((node, tableId) => {
            if (!node.isValid) {
                this._marks.delete(tableId);
            }
        });
    }

    followMark(tableId: string, follow: Node): void {
        const node = this._marks.get(tableId);
        if (node?.isValid) {
            this.follow(node, follow, MARK_Y_OFFSET);
        }
    }

    clear(): void {
        this.hideBar();
        this._marks.forEach((node) => {
            if (node.isValid) {
                node.destroy();
            }
        });
        this._marks.clear();
    }

    private follow(ui: Node, world: Node, yOffset: number): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        sceneUI.getComponent(Widget)?.updateAlignment();
        const pos = world.worldPosition;
        _world.set(pos.x, pos.y, pos.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        ui.setPosition(_local.x, _local.y + yOffset, 0);
    }
}
