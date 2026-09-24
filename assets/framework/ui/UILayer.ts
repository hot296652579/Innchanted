import { Layers, Node, UITransform, Widget } from "cc";

/** UI分层枚举，层级越大渲染越靠上 */
export enum UILayerType {
    /** 底层场景UI（战斗地图内常驻UI：血条、飘字） */
    SCENE_UI = 10,
    /** 普通主界面（主菜单、关卡选择、战斗主面板） */
    MAIN_WIN = 20,
    /** 普通弹窗（炮塔详情、升级弹窗） */
    POPUP_WIN = 30,
    /** 置顶弹窗（确认框、奖励结算） */
    TOP_POPUP = 40,
    /** 引导、提示飘字、点击遮罩（最高层） */
    TIPS_GUIDE = 50,
}

/** UI分层根节点管理器 */
export class UILayerRoot {
    public static sceneUIRoot: Node | null = null;
    public static mainWinRoot: Node | null = null;
    public static popupRoot: Node | null = null;
    public static topPopupRoot: Node | null = null;
    public static guideRoot: Node | null = null;

    /** 分层是否已创建且节点仍有效 */
    public static isReady(): boolean {
        return !!this.mainWinRoot?.isValid;
    }

    /** 初始化所有分层根节点（切场景后必须重新调用） */
    public static initRoot(parent: Node): void {
        if (this.mainWinRoot?.isValid && this.mainWinRoot.parent === parent) {
            return;
        }
        this.clearRoots();
        this.sceneUIRoot = this.createLayerNode(parent, "SceneUIRoot", UILayerType.SCENE_UI);
        this.mainWinRoot = this.createLayerNode(parent, "MainWinRoot", UILayerType.MAIN_WIN);
        this.popupRoot = this.createLayerNode(parent, "PopupRoot", UILayerType.POPUP_WIN);
        this.topPopupRoot = this.createLayerNode(parent, "TopPopupRoot", UILayerType.TOP_POPUP);
        this.guideRoot = this.createLayerNode(parent, "GuideTipsRoot", UILayerType.TIPS_GUIDE);
    }

    /** 根据层级获取对应父节点 */
    public static getRootByLayer(layer: UILayerType): Node | null {
        let root: Node | null = null;
        switch (layer) {
            case UILayerType.SCENE_UI: root = this.sceneUIRoot; break;
            case UILayerType.MAIN_WIN: root = this.mainWinRoot; break;
            case UILayerType.POPUP_WIN: root = this.popupRoot; break;
            case UILayerType.TOP_POPUP: root = this.topPopupRoot; break;
            case UILayerType.TIPS_GUIDE: root = this.guideRoot; break;
            default: root = this.mainWinRoot; break;
        }
        return root?.isValid ? root : null;
    }

    private static clearRoots(): void {
        const roots = [
            this.sceneUIRoot,
            this.mainWinRoot,
            this.popupRoot,
            this.topPopupRoot,
            this.guideRoot,
        ];
        for (const node of roots) {
            if (node?.isValid) {
                node.destroy();
            }
        }
        this.sceneUIRoot = null;
        this.mainWinRoot = null;
        this.popupRoot = null;
        this.topPopupRoot = null;
        this.guideRoot = null;
    }

    private static createLayerNode(parent: Node, name: string, layer: UILayerType): Node {
        const node = new Node(name);
        node.setParent(parent);
        node.layer = Layers.nameToLayer("UI");
        node.addComponent(UITransform);

        let widget = node.getComponent(Widget);
        if (!widget) {
            widget = node.addComponent(Widget);
        }

        this.setWidgetAlign(widget, {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        });
        widget.updateAlignment();
        return node;
    }

    private static setWidgetAlign(
        widget: Widget,
        options: {
            left?: number;
            right?: number;
            top?: number;
            bottom?: number;
            hCenter?: number;
            vCenter?: number;
        }
    ) {
        widget.isAlignLeft = options.left !== undefined;
        if (options.left !== undefined) widget.left = options.left;

        widget.isAlignRight = options.right !== undefined;
        if (options.right !== undefined) widget.right = options.right;

        widget.isAlignTop = options.top !== undefined;
        if (options.top !== undefined) widget.top = options.top;

        widget.isAlignBottom = options.bottom !== undefined;
        if (options.bottom !== undefined) widget.bottom = options.bottom;

        widget.isAlignHorizontalCenter = options.hCenter !== undefined;
        if (options.hCenter !== undefined) widget.horizontalCenter = options.hCenter;

        widget.isAlignVerticalCenter = options.vCenter !== undefined;
        if (options.vCenter !== undefined) widget.verticalCenter = options.vCenter;

        widget.updateAlignment();
    }
}
