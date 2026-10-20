import { EffectAsset, Material, MeshRenderer, Node, Vec3, Vec4, primitives, utils } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";

const OVERLAY = "IceSheet";
const ICE_COLOR = new Vec4(0.78, 0.94, 1, 1);
const FROST_SCALE = 2.2;
const PAD = 8;

/** 整块 Plane 铺一张冰面，1 秒从中心铺满。 */
export class GroundIceView {
    private _mat: Material | null = null;
    private _sheet: Node | null = null;
    private readonly _params = new Vec4(0, FROST_SCALE, 12, 0);
    private readonly _center = new Vec4();
    private _from = 0;
    private _to = 0;
    private _elapsed = 0;
    private _duration = 1;
    private _playing = false;

    get amount(): number {
        return this._params.x;
    }

    async bind(planeRoot: Node | null): Promise<void> {
        this.clear();
        if (!planeRoot) {
            return;
        }
        const effect = await ResourceManager.getInstance().load(
            "shader/ice-ground",
            EffectAsset,
            BundlesEnum.Game,
        );
        if (!effect) {
            console.warn("[Ice] 未找到 shader/ice-ground");
            return;
        }
        const bounds = this.planeBounds(planeRoot);
        if (!bounds) {
            console.warn("[Ice] Plane 下没有地面网格");
            return;
        }
        const sizeX = Math.max(4, bounds.max.x - bounds.min.x + PAD * 2);
        const sizeZ = Math.max(4, bounds.max.z - bounds.min.z + PAD * 2);
        const cx = (bounds.min.x + bounds.max.x) * 0.5;
        const cz = (bounds.min.z + bounds.max.z) * 0.5;
        const cy = bounds.max.y + 0.06;
        const radius = Math.sqrt(sizeX * sizeX + sizeZ * sizeZ) * 0.55;

        const mesh = utils.MeshUtils.createMesh(primitives.plane({
            width: sizeX,
            length: sizeZ,
        }));
        if (!mesh) {
            console.warn("[Ice] 创建冰面网格失败");
            return;
        }

        const mat = new Material();
        mat.initialize({ effectAsset: effect });
        this._center.set(cx, 0, cz, 0);
        this._params.set(0, FROST_SCALE, radius, 0);
        mat.setProperty("iceColor", ICE_COLOR);
        mat.setProperty("iceParams", this._params);
        mat.setProperty("iceCenter", this._center);
        this._mat = mat;

        const sheet = new Node(OVERLAY);
        planeRoot.addChild(sheet);
        sheet.setWorldPosition(cx, cy, cz);
        sheet.layer = planeRoot.layer;
        const renderer = sheet.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.shadowCastingMode = 0;
        renderer.setSharedMaterial(mat, 0);
        this._sheet = sheet;
        this.apply(0);
        console.log("[Ice] 整地冰面", sizeX.toFixed(1), "x", sizeZ.toFixed(1), "半径", radius.toFixed(1));
    }

    freeze(duration = 1): void {
        this.play(1, duration);
    }

    thaw(duration = 1): void {
        this.play(0, duration);
    }

    update(dt: number): void {
        if (!this._playing) {
            return;
        }
        this._elapsed += dt;
        const t = this._duration <= 0 ? 1 : Math.min(1, this._elapsed / this._duration);
        this.apply(this._from + (this._to - this._from) * t);
        if (t >= 1) {
            this._playing = false;
        }
    }

    clear(): void {
        this._playing = false;
        if (this._sheet?.isValid) {
            this._sheet.destroy();
        }
        this._sheet = null;
        this._mat = null;
    }

    private play(to: number, duration: number): void {
        this._from = this._params.x;
        this._to = to;
        this._duration = Math.max(0.01, duration);
        this._elapsed = 0;
        this._playing = true;
        if (!this._mat) {
            this.apply(to);
            this._playing = false;
        }
    }

    private apply(amount: number): void {
        this._params.x = Math.min(1, Math.max(0, amount));
        this._mat?.setProperty("iceParams", this._params);
    }

    private planeBounds(planeRoot: Node): { min: Vec3; max: Vec3 } | null {
        const renderers = planeRoot.getComponentsInChildren(MeshRenderer);
        const min = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
        const max = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
        let found = false;
        const corner = new Vec3();
        for (let i = 0; i < renderers.length; i++) {
            const renderer = renderers[i];
            if (renderer.node.name === OVERLAY || !renderer.mesh) {
                continue;
            }
            const box = renderer.model?.worldBounds;
            if (box) {
                found = true;
                min.x = Math.min(min.x, box.center.x - box.halfExtents.x);
                min.y = Math.min(min.y, box.center.y - box.halfExtents.y);
                min.z = Math.min(min.z, box.center.z - box.halfExtents.z);
                max.x = Math.max(max.x, box.center.x + box.halfExtents.x);
                max.y = Math.max(max.y, box.center.y + box.halfExtents.y);
                max.z = Math.max(max.z, box.center.z + box.halfExtents.z);
                continue;
            }
            const mesh = renderer.mesh;
            const lo = mesh.minPosition;
            const hi = mesh.maxPosition;
            if (!lo || !hi) {
                continue;
            }
            found = true;
            const wt = renderer.node.worldMatrix;
            for (let x = 0; x <= 1; x++) {
                for (let y = 0; y <= 1; y++) {
                    for (let z = 0; z <= 1; z++) {
                        corner.set(
                            x ? hi.x : lo.x,
                            y ? hi.y : lo.y,
                            z ? hi.z : lo.z,
                        );
                        Vec3.transformMat4(corner, corner, wt);
                        min.x = Math.min(min.x, corner.x);
                        min.y = Math.min(min.y, corner.y);
                        min.z = Math.min(min.z, corner.z);
                        max.x = Math.max(max.x, corner.x);
                        max.y = Math.max(max.y, corner.y);
                        max.z = Math.max(max.z, corner.z);
                    }
                }
            }
        }
        return found ? { min, max } : null;
    }
}
