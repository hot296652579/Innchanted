import { sys } from 'cc';

let patched = false;

/**
 * 微信小游戏原生视频默认盖在游戏画布之上，画布上的 UI 被挡住，点击也被视频吃掉。
 * 引擎创建视频时不传参数，这里给 createVideo 补上 underGameView，把视频放到画布下面。
 * 画布要能透出视频，需在项目设置里开启 ENABLE_TRANSPARENT_CANVAS。
 */
export function patchWechatVideo(): void {
    if (patched) {
        return;
    }
    patched = true;
    if (sys.platform !== sys.Platform.WECHAT_GAME) {
        return;
    }
    const adapter = (globalThis as { __globalAdapter?: Record<string, unknown> }).__globalAdapter;
    const create = adapter?.createVideo as ((options?: Record<string, unknown>) => unknown) | undefined;
    if (!adapter || typeof create !== 'function') {
        return;
    }
    adapter.createVideo = (options?: Record<string, unknown>) =>
        create.call(adapter, { ...options, underGameView: true });
}

patchWechatVideo();
