// main.ts
import { ConfigManager } from "./framework/config/ConfigManager";
import { EventManager } from "./framework/event/EventManager";
import { PoolManager } from "./framework/pool/PoolManager";
import AudioPlayer from "./framework/resource/AudioPlayer";
import { ResourceManager } from "./framework/resource/ResourceManager";
import { UIManager } from "./framework/ui/UIManager";


export class GameMain {
    public async initAllFramework(): Promise<void> {
        console.log("===== 商业框架初始化开始 =====");
        await ResourceManager.getInstance().init();
        await EventManager.getInstance().init();
        await PoolManager.getInstance().init();
        await ConfigManager.getInstance().init();
        await AudioPlayer.getInstance().init();
        await UIManager.getInstance().init();
        console.log("===== 底层框架+UI框架初始化完成 =====");
    }
}