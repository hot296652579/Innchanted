import { _decorator, Component, instantiate, Node } from "cc";
import { BattleContext } from "../../define/BattleContext";
import { BundlesEnum } from "../../define/BundlesEnum";
import { ConfigManager } from "../../framework/config/ConfigManager";
import { ResourceManager } from "../../framework/resource/ResourceManager";
import { LoadingCover } from "../loading/LoadingCover";
import { levelPrefabPath } from "./levelPrefab";

const { ccclass } = _decorator;

@ccclass("BattleMapRoot")
export class BattleMapRoot extends Component {
    private static _heldPrefabPath: string | null = null;

    private _levelNode: Node | null = null;

    protected async start(): Promise<void> {
        try {
            await this.loadLevel(BattleContext.selectedLevelId);
        } finally {
            LoadingCover.notifyLevelReady();
        }
    }

    public async loadLevel(levelId: number): Promise<Node | null> {
        this.clearLevel();

        await ConfigManager.getInstance().loadTable("levels", BundlesEnum.Table);
        const path = levelPrefabPath(levelId);
        this.releaseOtherLevel(path);
        const prefab = await ResourceManager.getInstance().loadPrefab(path, BundlesEnum.Game);
        if (!prefab) {
            console.error(`[BattleMapRoot] 关卡预设加载失败: ${BundlesEnum.Game}/${path}`);
            return null;
        }

        const node = instantiate(prefab);
        node.setParent(this.node);
        node.setPosition(0, 0, 0);
        this._levelNode = node;
        BattleMapRoot._heldPrefabPath = path;
        return node;
    }

    private releaseOtherLevel(path: string): void {
        const held = BattleMapRoot._heldPrefabPath;
        if (!held || held === path) {
            return;
        }
        ResourceManager.getInstance().releaseAsset(held, BundlesEnum.Game);
        BattleMapRoot._heldPrefabPath = null;
    }

    public clearLevel(): void {
        if (this._levelNode?.isValid) {
            this._levelNode.destroy();
        }
        this._levelNode = null;
        this.node.destroyAllChildren();
    }

    public get levelNode(): Node | null {
        return this._levelNode;
    }
}
