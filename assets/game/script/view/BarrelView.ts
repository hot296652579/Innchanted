import { Camera, Color, instantiate, Material, MeshRenderer, Node, Prefab, ProgressBar, Sprite, UITransform, Vec3, Widget } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { BARREL_COLORS, BARREL_MAT_PATH, BARREL_MAX_CHARGES, BarrelColor } from "../domain/Barrel";
import { findNamedDescendant, StationBinding } from "../sim/StationRegistry";

const BAR_NAME = "AcceptLoading";
const BAR_NODE = "Bar";
const UI_Y_OFFSET = 80;
const BAR_TINT: Record<BarrelColor, Color> = {
    [BarrelColor.Brown]: new Color(104, 7, 7, 255),
    [BarrelColor.Green]: new Color(116, 238, 21, 255),
    [BarrelColor.Red]: new Color(238, 21, 47, 255),
    [BarrelColor.Yellow]: new Color(238, 194, 21, 255),
};
const _world = new Vec3();
const _local = new Vec3();

const PULP_PATH: Partial<Record<BarrelColor, string>> = {
    [BarrelColor.Brown]: "prefab/items/OriginalPulp_Brown",
    [BarrelColor.Green]: "prefab/items/OriginalPulp_Green",
    [BarrelColor.Red]: "prefab/items/OriginalPulp_Red",
};

const DRINK_PATH: Partial<Record<BarrelColor, string>> = {
    [BarrelColor.Brown]: "prefab/items/MagicDrink_Brown",
    [BarrelColor.Green]: "prefab/items/MagicDrink_Green",
    [BarrelColor.Red]: "prefab/items/MagicDrink_Red",
};

interface BarSession {
    binding: StationBinding;
    bar: Node;
    meter: ProgressBar | null;
    fill: Sprite | null;
}

export class BarrelView {
    private _barPrefab: Prefab | null = null;
    private _white: Material | null = null;
    private readonly _colorMat = new Map<BarrelColor, Material>();
    private readonly _pulp = new Map<BarrelColor, Prefab>();
    private readonly _drink = new Map<BarrelColor, Prefab>();
    private readonly _sessions = new Map<string, BarSession>();

    constructor(
        private readonly camera: Camera | null,
        private readonly playerHold: Node,
    ) { }

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        this._barPrefab = await res.loadPrefab("prefab/AcceptLoading", BundlesEnum.Game);
        this._white = await res.load("mat/white_material", Material, BundlesEnum.Game);
        const matColors = Object.keys(BARREL_MAT_PATH) as BarrelColor[];
        for (const color of matColors) {
            const mat = await res.load(BARREL_MAT_PATH[color], Material, BundlesEnum.Game);
            if (mat) {
                this._colorMat.set(color, mat as Material);
            }
        }
        for (const color of BARREL_COLORS) {
            const pulpPath = PULP_PATH[color];
            if (pulpPath) {
                const pulp = await res.loadPrefab(pulpPath, BundlesEnum.Game);
                if (pulp) {
                    this._pulp.set(color, pulp);
                }
            }
            const drinkPath = DRINK_PATH[color];
            if (drinkPath) {
                const drink = await res.loadPrefab(drinkPath, BundlesEnum.Game);
                if (drink) {
                    this._drink.set(color, drink);
                }
            }
        }
        if (!this._barPrefab) {
            console.warn("[Barrel] 未找到 prefab/AcceptLoading");
        }
    }

    begin(binding: StationBinding, color: BarrelColor): void {
        const id = binding.station.id;
        let session = this._sessions.get(id);
        if (!session || !session.bar.isValid) {
            const bar = this.createBar(binding);
            if (!bar) {
                return;
            }
            const meter = this.findMeter(bar);
            const fill = this.findBarSprite(bar);
            if (meter && fill && meter.barSprite !== fill) {
                meter.barSprite = fill;
            }
            session = { binding, bar, meter, fill };
            this._sessions.set(id, session);
        }
        session.binding = binding;
        session.bar.active = true;
        this.prepareFill(session, color);
        this.setProgress(binding, 0);
        this.follow(session.bar, binding);
    }

    setProgress(binding: StationBinding, progress: number): void {
        const session = this._sessions.get(binding.station.id);
        if (!session || !session.bar.active || !session.bar.isValid) {
            return;
        }
        const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
        const fill = session.fill;
        if (fill) {
            fill.fillRange = p;
        }
        const meter = session.meter;
        if (meter) {
            meter.progress = p;
        }
        this.follow(session.bar, session.binding);
    }

    hide(binding: StationBinding): void {
        const session = this._sessions.get(binding.station.id);
        if (session?.bar.isValid) {
            session.bar.active = false;
        }
    }

    syncVolumes(binding: StationBinding): void {
        const tank = binding.station.barrel;
        const filled = tank?.charges ?? 0;
        const color = tank?.color ?? null;
        const tint = color ? this._colorMat.get(color) : null;
        for (let i = 0; i < BARREL_MAX_CHARGES; i++) {
            const node = findNamedDescendant(binding.node, `volume${i}`);
            if (!node) {
                continue;
            }
            const mat = i < filled && tint ? tint : this._white;
            if (!mat) {
                continue;
            }
            const renderers = node.getComponentsInChildren(MeshRenderer);
            for (let r = 0; r < renderers.length; r++) {
                renderers[r].setSharedMaterial(mat, 0);
            }
        }
    }

    putPulp(color: BarrelColor): void {
        this.putPrefab(this._pulp.get(color));
    }

    putDrink(color: BarrelColor): void {
        this.putPrefab(this._drink.get(color));
    }

    clearHand(): void {
        const kids = this.playerHold.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }

    private putPrefab(prefab: Prefab | undefined): void {
        if (!prefab) {
            console.warn("[Barrel] 缺少物品预设");
            return;
        }
        const item = instantiate(prefab);
        item.name = prefab.name;
        this.playerHold.addChild(item);
        const n = this.playerHold.children.length;
        item.setPosition(0, Math.max(0, n - 1) * 0.12, 0);
        item.mobility = 2;
    }

    private prepareFill(session: BarSession, color: BarrelColor): void {
        const fill = session.fill;
        const meter = session.meter;
        if (!fill) {
            return;
        }
        fill.customMaterial = null;
        const main = this._colorMat.get(color)?.getProperty("mainColor") as Color | undefined;
        fill.color = main?.clone() ?? BAR_TINT[color];
        fill.sizeMode = Sprite.SizeMode.CUSTOM;
        fill.type = Sprite.Type.FILLED;
        fill.fillType = Sprite.FillType.HORIZONTAL;
        fill.fillStart = 0;
        fill.fillRange = 0;
        const trans = fill.node.getComponent(UITransform);
        trans?.setContentSize(70, trans.contentSize.height || 15);
        if (meter) {
            meter.barSprite = fill;
            meter.mode = ProgressBar.Mode.FILLED;
            meter.totalLength = 1;
        }
    }

    private findMeter(root: Node): ProgressBar | null {
        const node = root.getChildByName("ProgressBar") ?? root;
        return node.getComponent(ProgressBar) ?? root.getComponentInChildren(ProgressBar);
    }

    private findBarSprite(root: Node): Sprite | null {
        const bar = root.getChildByName("ProgressBar")?.getChildByName(BAR_NODE) ?? root.getChildByName(BAR_NODE);
        return bar?.getComponent(Sprite) ?? root.getComponentInChildren(Sprite);
    }

    private createBar(binding: StationBinding): Node | null {
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!uiRoot || !this._barPrefab) {
            console.warn("[Barrel] SCENE_UI 或 AcceptLoading 未就绪");
            return null;
        }
        const bar = instantiate(this._barPrefab);
        bar.name = `${BAR_NAME}_${binding.station.id}`;
        uiRoot.addChild(bar);
        bar.setPosition(0, 0, 0);
        return bar;
    }

    private follow(bar: Node, binding: StationBinding): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        const uiTrans = sceneUI?.getComponent(UITransform);
        if (!cam3d || !sceneUI || !uiTrans) {
            return;
        }
        sceneUI.getComponent(Widget)?.updateAlignment();
        const pos = binding.node.worldPosition;
        _world.set(pos.x, pos.y, pos.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        bar.setPosition(_local.x, _local.y + UI_Y_OFFSET, 0);
    }
}
