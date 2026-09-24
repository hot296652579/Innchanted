import { _decorator, Component, Node, SkeletalAnimation } from 'cc';
import { AudioEnum } from '../define/AudioEnum';
import { BundlesEnum } from '../define/BundlesEnum';
import { UIConfig } from '../define/UIEnum';
import AudioPlayer from '../framework/resource/AudioPlayer';
import { UILayerRoot } from '../framework/ui/UILayer';
import { UIManager } from '../framework/ui/UIManager';
const { ccclass, property } = _decorator;

@ccclass('EarthMap')
export class EarthMap extends Component {

    @property(SkeletalAnimation)
    skeleton: SkeletalAnimation = null; //人物

    @property(Node)
    earthNode: Node = null; //地球球体

    @property(Node)
    boxNode: Node = null;  //宝箱

    @property(Node)
    uiRoot: Node = null;

    /** 绕 X 轴滚动速度 */
    @property
    rotateSpeed = 10;

    @property
    showBoxAngle = 1;

    /** 地球转到该角度后自动进战斗*/
    @property
    battleTriggerAngle = 45;

    private _angleX = 0;
    private _boxShown = false;
    private _battleTriggered = false;

    @property(Node)
    btBattle: Node = null;

    protected onLoad(): void {
        void AudioPlayer.getInstance().playMusic(BundlesEnum.Audio, AudioEnum.BGM_EXPLORE);
        this.btBattle.on(Node.EventType.TOUCH_END, this.onBattle, this);
    }

    start() {
        this._angleX = this.earthNode?.eulerAngles.x ?? 0;
        this.ensureUiRoot();
    }

    update(dt: number) {
        if (!this.earthNode) {
            return;
        }
        this._angleX += this.rotateSpeed * dt;
        this.earthNode.setRotationFromEuler(this._angleX, 0, 0);
        this.tryAutoBattle();
    }

    private showBox(): void {
        this._boxShown = true;
        if (this.boxNode) {
            this.boxNode.active = true;
        }
    }

    private tryAutoBattle(): void {
        if (this._battleTriggered) {
            return;
        }
        if (this._angleX >= this.battleTriggerAngle) {
            this.onBattle();
        }
    }

    private async onBattle(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        if (this._battleTriggered) {
            return;
        }
        this._battleTriggered = true;
        this.rotateSpeed = 0;
        this.ensureUiRoot();
        const uiMgr = UIManager.getInstance();
        uiMgr.registerWindow(
            UIConfig.LoadingWnd.name,
            UIConfig.LoadingWnd.path,
            UIConfig.LoadingWnd.cache,
        );
        await uiMgr.openWindow(UIConfig.LoadingWnd.name, {
            bundles: [BundlesEnum.Game, BundlesEnum.Table],
            nextScene: "scene/Battle",
        });
    }

    //新场景 重新创建UI层
    private ensureUiRoot(): void {
        const parent = this.resolveUiRoot();
        if (!parent?.isValid) {
            console.error("EarthMap: 找不到 Canvas / uiRoot");
            return;
        }
        UILayerRoot.initRoot(parent);
    }

    private resolveUiRoot(): Node | null {
        if (this.uiRoot?.isValid) {
            return this.uiRoot;
        }
        return this.node.scene?.getChildByName("Canvas") ?? null;
    }
}
