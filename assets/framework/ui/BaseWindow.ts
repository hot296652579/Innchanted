import { _decorator, Enum, Node, tween, Tween } from "cc";
import BaseComponent from "../base/BaseComponent";
import { UILayerType } from "./UILayer";
const { ccclass, property } = _decorator;

export type WindowOpenParam = Record<string, any> | null;

@ccclass('BaseWindow')
export default class BaseWindow extends BaseComponent {
    /** 当前窗口所属层级 */
    @property({ type: Enum(UILayerType) })
    public windowLayer: UILayerType = UILayerType.MAIN_WIN;

    /** 打开时播放弹窗动画 */
    @property
    public playOpenTween: boolean = false;

    /** 窗口唯一标识，和UIManager注册key一致 */
    public windowKey: string = "";

    /** 窗口是否缓存（关闭不销毁，下次直接复用） */
    public isCache: boolean = false;

    protected _openParam: WindowOpenParam = null;
    protected _tween: Tween<Node> | null = null;

    //==================== 生命周期 ====================
    /** 窗口打开回调，外部传参 */
    public onOpen(param: WindowOpenParam): void {
        this._openParam = param;
        this.node.active = true;

        if (this.playOpenTween) {
            this.playOpenAnim();
        }
        this.onOpenRefresh();
    }

    /** 子类重写：打开时刷新界面数据 */
    protected onOpenRefresh(): void {

    }

    /** 关闭窗口统一入口 */
    public closeWindow(): void {
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
        this.playCloseAnim(() => {
            this.node.active = false;
            if (!this.isCache) {
                this.node.destroy();
            }
        });
    }

    /** 弹窗打开缩放动画 */
    protected playOpenAnim(): void {
        this.node.scale.set(0.8, 0.8, 1);
        this._tween = tween(this.node)
            .to(0.12, { scale: new Node().scale.set(1.05, 1.05, 1) })
            .to(0.08, { scale: new Node().scale.set(1, 1, 1) })
            .start();
    }

    /** 弹窗关闭动画 */
    protected playCloseAnim(cb: () => void): void {
        this._tween = tween(this.node)
            .to(0.1, { scale: new Node().scale.set(1, 1, 1) })
            .call(cb)
            .start();
    }

    public onDestroy(): void {
        super.onDestroy();
        if (this._tween) {
            this._tween.stop();
            this._tween = null;
        }
    }
}
