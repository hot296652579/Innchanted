import { _decorator, Camera, Canvas, Color, Node, Sprite, sys, UITransform, VideoPlayer, view } from 'cc';
import { BundlesEnum } from 'db://assets/define/BundlesEnum';
import { UIConfig } from 'db://assets/define/UIEnum';
import AudioPlayer from 'db://assets/framework/resource/AudioPlayer';
import { ResourceManager } from 'db://assets/framework/resource/ResourceManager';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerRoot, UILayerType } from 'db://assets/framework/ui/UILayer';
import { UIManager } from 'db://assets/framework/ui/UIManager';
const { ccclass, property } = _decorator;

export interface VideoWndParam {
    /** 播完、跳过、播放出错或窗口被销毁时回调一次 */
    onDone?: () => void;
}

@ccclass('VideoWnd')
export class VideoWnd extends BaseWindow {

    @property(Node)
    btSkip: Node = null!;

    @property(VideoPlayer)
    videoPlayer: VideoPlayer = null!;

    windowLayer = UILayerType.TOP_POPUP;

    private _musicPaused = false;
    private _done = false;
    private _camera: Camera | null = null;
    private _cameraClearFlags = 0;
    private _cameraClearColor = new Color();
    private _hiddenRoots: Node[] = [];

    /**
     * 浏览器（stayOnBottom）和微信（underGameView 补丁）上视频都在画布下面，
     * 画布要透明才能看到视频，btSkip 才能盖在视频上并收到点击。
     */
    private get videoUnderCanvas(): boolean {
        return sys.isBrowser || sys.platform === sys.Platform.WECHAT_GAME;
    }

    protected onLoad(): void {
        this.btSkip.active = false;
        this.btSkip.on(Node.EventType.TOUCH_END, this.onBtnSkipClick, this);
        const tapArea = this.getChild("black") ?? this.node;
        tapArea.on(Node.EventType.TOUCH_END, this.showSkip, this);

        const videoNode = this.videoPlayer.node;
        videoNode.setPosition(0, 0, 0);
        videoNode.getComponent(UITransform)?.setContentSize(view.getVisibleSize());
        videoNode.on(VideoPlayer.EventType.COMPLETED, this.finish, this);
        videoNode.on(VideoPlayer.EventType.ERROR, this.onVideoError, this);
        videoNode.on(VideoPlayer.EventType.CLICKED, this.showSkip, this);

        if (sys.isBrowser) {
            this.videoPlayer.stayOnBottom = true;
        }
        if (this.videoUnderCanvas) {
            const black = this.getChild("black")?.getComponent(Sprite);
            if (black) {
                black.enabled = false;
            }
        }
    }

    protected onOpenRefresh(): void {
        this._done = false;
        this.btSkip.active = false;
        if (this.videoUnderCanvas) {
            this.clearCanvasForVideo();
        }
        const audio = AudioPlayer.getInstance();
        if (audio.musicPlaying) {
            audio.pauseMusic();
            this._musicPaused = true;
        }
    }

    private showSkip(): void {
        if (this._done) {
            return;
        }
        this.btSkip.active = true;
    }

    private onBtnSkipClick(): void {
        this.finish();
    }

    private onVideoError(): void {
        console.error("VideoWnd: 视频播放出错");
        this.finish();
    }

    private finish(): void {
        if (this._done) {
            return;
        }
        this._done = true;
        this.btSkip.active = false;
        this.videoPlayer.stop();
        this.videoPlayer.node.active = false;
        this.restoreCanvas();
        this.restoreMusic();
        UIManager.getInstance().closeWindow(this.windowKey || UIConfig.VideoWnd.name);
        (this._openParam as VideoWndParam | null)?.onDone?.();
    }

    /** UI 相机透明清屏，盖掉 3D 画面；比视频窗口低的 UI 层先隐藏，不压在视频上。 */
    private clearCanvasForVideo(): void {
        const camera = this.findUICamera();
        if (camera && !this._camera) {
            this._camera = camera;
            this._cameraClearFlags = camera.clearFlags;
            this._cameraClearColor.set(camera.clearColor);
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new Color(0, 0, 0, 0);
        }

        const lowerLayers = [UILayerType.SCENE_UI, UILayerType.MAIN_WIN, UILayerType.POPUP_WIN, UILayerType.TOP_POPUP];
        for (const layer of lowerLayers) {
            if (layer >= this.windowLayer) {
                break;
            }
            const root = UILayerRoot.getRootByLayer(layer);
            if (root?.active) {
                root.active = false;
                this._hiddenRoots.push(root);
            }
        }
    }

    /** 引擎销毁视频时不会还原相机清屏设置，这里自己还原。 */
    private restoreCanvas(): void {
        const camera = this._camera;
        this._camera = null;
        if (camera?.isValid) {
            camera.clearFlags = this._cameraClearFlags;
            camera.clearColor = this._cameraClearColor;
        }
        for (const root of this._hiddenRoots) {
            if (root.isValid) {
                root.active = true;
            }
        }
        this._hiddenRoots = [];
    }

    private findUICamera(): Camera | null {
        let current: Node | null = this.node;
        while (current) {
            const canvas = current.getComponent(Canvas);
            if (canvas?.cameraComponent) {
                return canvas.cameraComponent;
            }
            current = current.parent;
        }
        return null;
    }

    private restoreMusic(): void {
        if (this._musicPaused) {
            this._musicPaused = false;
            AudioPlayer.getInstance().recoverMusic();
        }
    }

    public onDestroy(): void {
        super.onDestroy();
        if (!this._done) {
            this._done = true;
            this.restoreCanvas();
            this.restoreMusic();
            (this._openParam as VideoWndParam | null)?.onDone?.();
        }
        // 视频跟着预制体一起加载，体积大，关掉就释放，不留在内存里。
        ResourceManager.getInstance().releaseAsset(UIConfig.VideoWnd.path, BundlesEnum.Game);
    }
}
