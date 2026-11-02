import { Camera, instantiate, Label, Node, Prefab, Vec3, Widget } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";

const BOARD_PATH = "prefab/ui/GuideContent";
const ARROW_PATH = "prefab/ui/Arrow";
const ARROW_Y = 90;
const BOB = 16;
const BOB_SEC = 0.45;
const BOARD_BOTTOM = 36;
const _world = new Vec3();
const _local = new Vec3();

/** 引导底板挂屏幕下方；箭头挂 SCENE_UI，跟着 3D 目标头顶。 */
export class GuideView {
    private _boardPrefab: Prefab | null = null;
    private _arrowPrefab: Prefab | null = null;
    private _board: Node | null = null;
    private _arrow: Node | null = null;
    private _follow: Node | null = null;
    private _bob = 0;

    constructor(private readonly camera: Camera | null) {}

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        this._boardPrefab = await res.loadPrefab(BOARD_PATH, BundlesEnum.Game);
        this._arrowPrefab = await res.loadPrefab(ARROW_PATH, BundlesEnum.Game);
        if (!this._boardPrefab) {
            console.warn("[Guide] 未找到", BOARD_PATH);
        }
        if (!this._arrowPrefab) {
            console.warn("[Guide] 未找到", ARROW_PATH);
        }
    }

    showText(text: string): void {
        const board = this.ensureBoard();
        if (!board) {
            return;
        }
        board.active = true;
        const label = board.getComponentInChildren(Label);
        if (label) {
            label.string = text;
        }
    }

    pointAt(follow: Node | null): void {
        this.clearArrow();
        this._follow = follow;
        if (!follow?.isValid || !this._arrowPrefab) {
            return;
        }
        const parent = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!parent) {
            return;
        }
        const arrow = instantiate(this._arrowPrefab);
        arrow.name = "GuideArrow";
        parent.addChild(arrow);
        this._arrow = arrow;
        this._bob = 0;
        this.placeArrow();
    }

    update(dt: number): void {
        this._bob += dt;
        if (this._arrow?.isValid && this._follow?.isValid) {
            this.placeArrow();
        }
    }

    hide(): void {
        this.clearArrow();
        if (this._board?.isValid) {
            this._board.active = false;
        }
    }

    clear(): void {
        this.clearArrow();
        if (this._board?.isValid) {
            this._board.destroy();
        }
        this._board = null;
    }

    private ensureBoard(): Node | null {
        if (this._board?.isValid) {
            return this._board;
        }
        if (!this._boardPrefab) {
            return null;
        }
        const parent = UILayerRoot.getRootByLayer(UILayerType.TIPS_GUIDE)
            ?? UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!parent) {
            return null;
        }
        const board = instantiate(this._boardPrefab);
        board.name = "GuideContent";
        parent.addChild(board);
        const widget = board.getComponent(Widget) ?? board.addComponent(Widget);
        widget.isAlignBottom = true;
        widget.isAlignTop = false;
        widget.isAlignLeft = false;
        widget.isAlignRight = false;
        widget.isAlignHorizontalCenter = true;
        widget.isAlignVerticalCenter = false;
        widget.bottom = BOARD_BOTTOM;
        widget.horizontalCenter = 0;
        widget.updateAlignment();
        this._board = board;
        return board;
    }

    private placeArrow(): void {
        const arrow = this._arrow;
        const follow = this._follow;
        const cam = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!arrow?.isValid || !follow?.isValid || !cam || !sceneUI) {
            return;
        }
        const world = follow.worldPosition;
        _world.set(world.x, world.y, world.z);
        cam.convertToUINode(_world, sceneUI, _local);
        const bob = Math.sin(this._bob / BOB_SEC * Math.PI) * BOB;
        arrow.setPosition(_local.x, _local.y + ARROW_Y + bob, 0);
    }

    private clearArrow(): void {
        const arrow = this._arrow;
        this._arrow = null;
        this._follow = null;
        if (arrow?.isValid) {
            arrow.destroy();
        }
    }
}
