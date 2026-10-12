import { Camera, instantiate, Node, Prefab, ProgressBar, UITransform, Vec3, Widget } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { StationBinding } from "../sim/StationRegistry";

const BAR_NAME = "LoadingBar";

const UI_Y_OFFSET = 80;
const _world = new Vec3();
const _screen = new Vec3();
const _local = new Vec3();

interface BarSession {
    binding: StationBinding;
    bar: Node;
    meter: ProgressBar | null;
}

export class ProcessorView {
    private _barPrefab: Prefab | null = null;
    private _outputPrefabs = new Map<string, Prefab>();
    private readonly _sessions = new Map<string, BarSession>();

    constructor(private readonly camera: Camera | null) { }

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        this._barPrefab = await res.loadPrefab("prefab/LoadingBar", BundlesEnum.Game);
        await this.loadOutput(res, "prefab/items/BurgerBaked", "burgerbaked");
        await this.loadOutput(res, "prefab/items/ChickenLegBaked", "chickenlegbaked");
        if (!this._barPrefab) {
            console.warn("[Cook] 未找到 prefab/LoadingBar");
        }
    }

    private async loadOutput(res: ResourceManager, path: string, itemId: string): Promise<void> {
        const prefab = await res.loadPrefab(path, BundlesEnum.Game);
        if (!prefab) {
            console.warn("[Cook] 未找到", path);
            return;
        }
        this._outputPrefabs.set(itemId, prefab);
    }

    /** 开始加工时创建一次进度条，之后只走 update。 */
    begin(binding: StationBinding): void {
        const id = binding.station.id;
        let session = this._sessions.get(id);
        if (!session || !session.bar.isValid) {
            const bar = this.createBar(binding);
            if (!bar) {
                return;
            }
            session = {
                binding,
                bar,
                meter: bar.getComponentInChildren(ProgressBar),
            };
            this._sessions.set(id, session);
        }
        session.binding = binding;
        session.bar.active = true;
        if (session.meter) {
            session.meter.progress = 0;
        }
        this.followStove2(session.bar, binding);
    }

    /** 已有进度条只改 progress，不再实例化。 */
    update(): void {
        this._sessions.forEach((session) => {
            if (!session.bar.active || !session.bar.isValid) {
                return;
            }
            const cook = session.binding.station.cook;
            if (!cook || cook.state !== "cooking") {
                return;
            }
            if (session.meter) {
                session.meter.progress = cook.progress;
            }
            this.followStove2(session.bar, session.binding);
        });
    }

    hideBar(binding: StationBinding): void {
        const session = this._sessions.get(binding.station.id);
        if (session?.bar.isValid) {
            session.bar.active = false;
        }
    }

    showReady(binding: StationBinding, outputId: string): void {
        this.hideBar(binding);
        const prefab = this._outputPrefabs.get(outputId);
        const hold = binding.holdPoint;
        const old = hold.children.slice();
        for (let i = 0; i < old.length; i++) {
            old[i].destroy();
        }
        if (!prefab) {
            console.warn("[Cook] 没有成品预设", outputId);
            return;
        }
        const cooked = instantiate(prefab);
        cooked.name = prefab.name || outputId;
        hold.addChild(cooked);
        cooked.setPosition(0, 0, 0);
    }

    private createBar(binding: StationBinding): Node | null {
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!uiRoot || !this._barPrefab) {
            console.warn("[Cook] SCENE_UI 或 LoadingBar 未就绪");
            return null;
        }
        const bar = instantiate(this._barPrefab);
        bar.name = `${BAR_NAME}_${binding.station.id}`;
        uiRoot.addChild(bar);
        bar.setPosition(0, 0, 0);
        return bar;
    }

    /**
     * 灶炉 3D → 主相机屏幕像素 → 按 SCENE_UI 尺寸映射成本地坐标（锚点在中心）。
     */
    private followStove(bar: Node, binding: StationBinding): void {
        const cam3d = this.camera;
        const renderCam = cam3d?.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        const uiTrans = sceneUI?.getComponent(UITransform);
        if (!cam3d || !renderCam || !sceneUI || !uiTrans) {
            return;
        }

        renderCam.update(true);
        sceneUI.getComponent(Widget)?.updateAlignment();

        const stove = binding.node.worldPosition;
        _world.set(stove.x, stove.y, stove.z);
        cam3d.worldToScreen(_world, _screen);

        const camW = renderCam.width;
        const camH = renderCam.height;
        const uiW = uiTrans.contentSize.width;
        const uiH = uiTrans.contentSize.height;
        if (camW <= 0 || camH <= 0 || uiW <= 0 || uiH <= 0) {
            return;
        }

        _local.x = (_screen.x / camW - 0.5) * uiW;
        _local.y = (_screen.y / camH - 0.5) * uiH;
        _local.z = 0;
        bar.setPosition(_local.x, _local.y + UI_Y_OFFSET, 0);
    }

    private followStove2(bar: Node, binding: StationBinding): void {
        const cam3d = this.camera;
        const renderCam = cam3d?.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        const uiTrans = sceneUI?.getComponent(UITransform);
        if (!cam3d || !renderCam || !sceneUI || !uiTrans) {
            return;
        }

        const stove = binding.node.worldPosition;
        _world.set(stove.x, stove.y, stove.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        bar.setPosition(_local.x, _local.y + UI_Y_OFFSET, 0);
    }
}
