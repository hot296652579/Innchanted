import { _decorator, Component, instantiate, Node } from "cc";
import { BattleContext } from "../../define/BattleContext";
import { BundlesEnum } from "../../define/BundlesEnum";
import { ConfigManager } from "../../framework/config/ConfigManager";
import { ResourceManager } from "../../framework/resource/ResourceManager";
import { findLevel, mapOf } from "../../game/script/app/LevelCatalog";

const { ccclass } = _decorator;

@ccclass("BattleMapRoot")
export class BattleMapRoot extends Component {
    private _levelNode: Node | null = null;

    protected async start(): Promise<void> {
        await this.loadLevel(BattleContext.selectedLevelId);
    }

    public async loadLevel(levelId: number): Promise<Node | null> {
        this.clearLevel();

        await ConfigManager.getInstance().loadTable("levels", BundlesEnum.Table);
        const mapId = mapOf(findLevel(levelId));
        const path = `prefab/Level${mapId}`;
        const prefab = await ResourceManager.getInstance().loadPrefab(path, BundlesEnum.Game);
        if (!prefab) {
            console.error(`[BattleMapRoot] 关卡预设加载失败: ${BundlesEnum.Game}/${path}`);
            return null;
        }

        const node = instantiate(prefab);
        node.setParent(this.node);
        node.setPosition(0, 0, 0);
        this._levelNode = node;
        return node;
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
