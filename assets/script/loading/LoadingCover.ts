import { Camera, Canvas, director, Layers, Node, UITransform, view, Widget } from "cc";
import { UIManager } from "../../framework/ui/UIManager";

/**
 * 把加载界面挂到常驻节点上，切场景时不被拆掉。
 * 新场景里的关卡实例化完成后，再关掉。
 */
export class LoadingCover {
    private static _waiting = false;
    private static _resolve: (() => void) | null = null;

    public static mount(loading: Node): Node {
        const scene = director.getScene();
        const root = new Node("LoadingPersist");
        root.layer = Layers.Enum.UI_2D;
        scene?.addChild(root);

        const canvasNode = new Node("LoadingCanvas");
        canvasNode.layer = Layers.Enum.UI_2D;
        canvasNode.setParent(root);
        const transform = canvasNode.addComponent(UITransform);
        const size = view.getVisibleSize();
        transform.setContentSize(size.width, size.height);

        const cameraNode = new Node("LoadingCamera");
        cameraNode.layer = Layers.Enum.UI_2D;
        cameraNode.setParent(canvasNode);
        const camera = cameraNode.addComponent(Camera);
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        camera.near = 0;
        camera.far = 2000;
        camera.orthoHeight = size.height / 2;
        camera.visibility = Layers.BitMask.UI_2D;
        camera.priority = 100;

        const source = this.findCanvasCamera(loading);
        if (source) {
            camera.visibility = source.visibility;
            camera.orthoHeight = source.orthoHeight;
            camera.near = source.near;
            camera.far = source.far;
            camera.priority = Math.max(source.priority + 1, 100);
        }

        const canvas = canvasNode.addComponent(Canvas);
        canvas.alignCanvasWithScreen = true;
        canvas.cameraComponent = camera;

        if (scene) {
            director.addPersistRootNode(root);
        }

        loading.setParent(canvasNode);
        loading.setPosition(0, 0, 0);
        loading.getComponent(Widget)?.updateAlignment();
        return root;
    }

    /** 在 loadScene 之前调用。关卡场景里 BattleMapRoot 加载完会解开等待。 */
    public static beginWait(): Promise<void> {
        this._waiting = true;
        return new Promise((resolve) => {
            this._resolve = resolve;
        });
    }

    public static notifyLevelReady(): void {
        if (!this._waiting) {
            return;
        }
        this._waiting = false;
        const resolve = this._resolve;
        this._resolve = null;
        resolve?.();
    }

    public static dismiss(root: Node, windowKey: string): void {
        UIManager.getInstance().discardWindow(windowKey);
        if (root.isValid) {
            director.removePersistRootNode(root);
            root.destroy();
        }
    }

    private static findCanvasCamera(loading: Node): Camera | null {
        let current: Node | null = loading;
        while (current) {
            const canvas = current.getComponent(Canvas);
            if (canvas?.cameraComponent) {
                return canvas.cameraComponent;
            }
            current = current.parent;
        }
        return null;
    }
}
