import { Component, Enum, UITransform, Widget, _decorator, v3, view } from "cc";
import { Config } from "../../Config";

export enum FitType {
    // 适配类型 - 改变节点尺寸
    FULL,        // 铺满全屏
    RATIO,       // 按宽高比例适配 长屏适配宽 短屏适配高
    WIDTH,       // 适配宽
    HEIGHT,      // 适配高
    ONLY_WIDTH,  // 只适配宽 高不变
    ONLY_HEIGHT, // 只适配高 宽不变

    // 适配类型 - 改变节点缩放比例
    SCALE_WIDTH, // 适配宽
    SCALE_HEIGHT,// 适配高
    SCALE_RATIO, // 按宽高比例适配 长屏适配宽 短屏适配高
}

/**
 * 节点适配
 */
const { ccclass, property, menu } = _decorator;

@ccclass('ScreenFit')
@menu('Adapter/ScreenFit')
export default class ScreenFit extends Component {
    @property({ type: Enum(FitType) }) fit = FitType.FULL;

    private _width: number = 0;
    private _height: number = 0;

    //窗口可见区域尺寸
    private _screen_w: number = view.getVisibleSize().width;
    private _screen_h: number = view.getVisibleSize().height;

    protected onLoad(): void {
        let uiTransform = this.node.getComponent(UITransform);
        this._width = uiTransform.width;
        this._height = uiTransform.height;
        this.resize();
    }

    protected onDestroy(): void {
    }

    public resize(): void {
        switch (this.fit) {
            case FitType.HEIGHT: {
                let ratio = this._screen_h / Config.design_height;
                this.node.getComponent(UITransform).width = this._width * ratio;
                this.node.getComponent(UITransform).height = this._height * ratio;
                break;
            }
            case FitType.WIDTH: {
                let ratio = this._screen_w / Config.design_width;
                this.node.getComponent(UITransform).width = this._width * ratio;
                this.node.getComponent(UITransform).height = this._height * ratio;
                break;
            }
            case FitType.RATIO: {
                let real = this._screen_w / this._screen_h;
                let ratio_design = Config.design_width / Config.design_height;
                if (real > ratio_design) { // 长屏适配宽
                    let ratio = this._screen_w / Config.design_width;
                    this.node.getComponent(UITransform).width = this._width * ratio;
                    this.node.getComponent(UITransform).height = this._height * ratio;
                } else { // 短屏适配高
                    let ratio = this._screen_h / Config.design_height;
                    this.node.getComponent(UITransform).width = this._width * ratio;
                    this.node.getComponent(UITransform).height = this._height * ratio;
                }
                break;
            }
            case FitType.FULL: {
                this.node.getComponent(UITransform).width = this._screen_w;
                this.node.getComponent(UITransform).height = this._screen_h;
                break;
            }
            case FitType.ONLY_WIDTH: {
                let ratio = this._screen_w / Config.design_width;
                this.node.getComponent(UITransform).width = this._width * ratio;
                break;
            }
            case FitType.ONLY_HEIGHT: {
                let ratio = this._screen_h / Config.design_height;
                this.node.getComponent(UITransform).height = this._height * ratio;
                this.node.getComponent(Widget)?.updateAlignment();
                break;
            }
            case FitType.SCALE_WIDTH: {
                let ratio = this._screen_w / Config.design_width;
                this.node.scale = v3(ratio, ratio, 1);
                break;
            }
            case FitType.SCALE_HEIGHT: {
                let ratio = this._screen_h / Config.design_height;
                this.node.scale = v3(ratio, ratio, 1);
                break;
            }
            case FitType.SCALE_RATIO: {
                let real = this._screen_w / this._screen_h;
                let ratio_design = Config.design_width / Config.design_height;
                if (real > ratio_design) { // 长屏适配宽
                    let ratio = this._screen_w / Config.design_width;
                    this.node.scale = v3(ratio, ratio, 1);
                } else { // 短屏适配高
                    let ratio = this._screen_h / Config.design_height;
                    this.node.scale = v3(ratio, ratio, 1);
                }
                break;
            }
            default:
                break;
        }
    }
}
