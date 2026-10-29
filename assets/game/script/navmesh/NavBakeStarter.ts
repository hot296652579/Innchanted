import {
    _decorator,
    Camera,
    Component,
    director,
    Material,
    MeshRenderer,
    Node,
    v3,
} from 'cc';
import RecastDetourManager from './recastdetourjs/tool/RecastDetourManager';

const { ccclass, property } = _decorator;

@ccclass('NavBakeStarter')
export class NavBakeStarter extends Component {
    @property({ type: Node, tooltip: '要烘焙的根节点。留空则使用当前节点（建议把脚本直接挂在 NavBake 上）' })
    navBake: Node | null = null;

    @property({ type: Material, tooltip: '调试网格材质，拖入 assets/script/recastdetourjs/debugMaterial.mtl' })
    debugMaterial: Material | null = null;

    @property({ tooltip: '烘焙完成后显示半透明可行走网格' })
    showDebug = true;

    player: Node | null = null;

    camera: Camera | null = null;

    @property({ type: Node, tooltip: '操作台根节点。留空则在 NavBake 下查找 Station' })
    stationRoot: Node | null = null;

    @property({ tooltip: '模型正面相对世界 +Z 的偏航补偿。KayKit 角色一般填 0，若走路倒着走则改为 180' })
    yawOffset = 0;

    @property({ tooltip: '转向平滑速度，越大转得越快' })
    turnSpeed = 10;

    recastDetourManager: RecastDetourManager | null = null;

    private _readyResolve: ((recast: RecastDetourManager) => void) | null = null;
    private readonly _ready = new Promise<RecastDetourManager>((resolve) => {
        this._readyResolve = resolve;
    });

    waitReady(): Promise<RecastDetourManager> {
        if (this.recastDetourManager) {
            return Promise.resolve(this.recastDetourManager);
        }
        return this._ready;
    }

    async start() {
        const bakeRoot = this.navBake || this.node;
        const meshes = bakeRoot.getComponentsInChildren(MeshRenderer);
        if (meshes.length === 0) {
            console.error('[NavBake] 烘焙根节点下没有 MeshRenderer，请确认 Plane / Station / Wall 已放进 NavBake');
            return;
        }
        if (!this.debugMaterial) {
            console.warn('[NavBake] 未指定 debugMaterial，debug 网格可能看不见。请拖入 recastdetourjs/debugMaterial.mtl');
        }

        console.log(`[NavBake] 开始烘焙，MeshRenderer 数量: ${meshes.length}`);
        this.recastDetourManager = await RecastDetourManager.getInstanceByNode(
            bakeRoot,
            this.debugMaterial!,
            bakeRoot.layer,
            bakeRoot,
            (mesh) => !this.skipBake(mesh.node, bakeRoot),
        );

        if (this.recastDetourManager.navmeshdebug) {
            this.recastDetourManager.navmeshdebug.active = this.showDebug;
        }
        this.recastDetourManager.navigationPlugin.setDefaultQueryExtent(v3(4, 2, 4));
        console.log('[NavBake] 烘焙完成');

        this.resolveSceneRefs(bakeRoot);
        this._readyResolve?.(this.recastDetourManager);
        if (!this.getComponent('PlayerBootstrap')) {
            this.node.addComponent('PlayerBootstrap');
        }
    }

    /** 货物、门板、门口地毯不当障碍。地毯叠在地板上会把门口网格掐断。 */
    private skipBake(node: Node, stopAt: Node): boolean {
        let current: Node | null = node;
        while (current && current !== stopAt) {
            const name = current.name;
            if (name === 'HoldPoint' || name === 'rug_rectangle_stripes_B' || name.startsWith('Door')) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }

    private resolveSceneRefs(bakeRoot: Node) {
        if (!this.player) {
            this.player = this.findInScene('Player');
        }
        if (!this.camera) {
            const camNode = this.findInScene('Main Camera');
            this.camera = camNode?.getComponent(Camera) ?? null;
        }
        if (!this.stationRoot) {
            this.stationRoot = bakeRoot.getChildByName('Station') ?? this.findNodeByName(bakeRoot, 'Station');
        }
    }

    private findInScene(name: string): Node | null {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }
        for (let i = 0; i < scene.children.length; ++i) {
            const found = this.findNodeByName(scene.children[i] as unknown as Node, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private findNodeByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (let i = 0; i < root.children.length; ++i) {
            const found = this.findNodeByName(root.children[i], name);
            if (found) {
                return found;
            }
        }
        return null;
    }
}
