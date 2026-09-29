/**
 * 挂到 NavBake 节点上。运行预览时烘焙 Recast 导航网格，
 * 点击操作台后让 Player 走到该操作台下的 InteractPos。
 */
import {
    _decorator,
    Camera,
    Component,
    director,
    EventMouse, geometry,
    Material, MeshRenderer,
    Node,
    systemEvent, SystemEvent, Touch,
    v3,
} from 'cc';
import RecastDetourManager from './recastdetourjs/tool/RecastDetourManager';

const { ccclass, property } = _decorator;
const INTERACT_POS_NAME = 'InteractPos';

@ccclass('NavBakeStarter')
export class NavBakeStarter extends Component {
    @property({ type: Node, tooltip: '要烘焙的根节点。留空则使用当前节点（建议把脚本直接挂在 NavBake 上）' })
    navBake: Node | null = null;

    @property({ type: Material, tooltip: '调试网格材质，拖入 assets/script/recastdetourjs/debugMaterial.mtl' })
    debugMaterial: Material | null = null;

    @property({ tooltip: '烘焙完成后显示半透明可行走网格' })
    showDebug = true;

    @property({ type: Node, tooltip: '玩家节点。留空则按名字 Player 自动查找' })
    player: Node | null = null;

    @property({ type: Camera, tooltip: '用于点击射线的相机。留空则使用 Main Camera' })
    camera: Camera | null = null;

    @property({ type: Node, tooltip: '操作台根节点。留空则在 NavBake 下查找 Station' })
    stationRoot: Node | null = null;

    @property({ tooltip: '模型正面相对世界 +Z 的偏航补偿。KayKit 角色一般填 0，若走路倒着走则改为 180' })
    yawOffset = 0;

    @property({ tooltip: '转向平滑速度，越大转得越快' })
    turnSpeed = 10;

    recastDetourManager: RecastDetourManager | null = null;

    private _playerAgentId = -1;
    private _playerYOffset = 0;
    private _lookTarget = v3();
    private _hasLookTarget = false;
    private _lastClickTime = 0;
    private _targetYaw = 0;

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
        );

        if (this.recastDetourManager.navmeshdebug) {
            this.recastDetourManager.navmeshdebug.active = this.showDebug;
        }
        this.recastDetourManager.navigationPlugin.setDefaultQueryExtent(v3(0.8, 0.3, 0.8));
        console.log('[NavBake] 烘焙完成');

        this.resolveSceneRefs(bakeRoot);
        this.registerPlayer();
        systemEvent.on(SystemEvent.EventType.TOUCH_END, this.onTouchEnd, this);
        systemEvent.on(SystemEvent.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    update(dt: number) {
        if (!this.recastDetourManager) {
            return;
        }
        this.recastDetourManager.update(dt);
        this.syncPlayer(dt);
    }

    onDestroy() {
        systemEvent.off(SystemEvent.EventType.TOUCH_END, this.onTouchEnd, this);
        systemEvent.off(SystemEvent.EventType.MOUSE_UP, this.onMouseUp, this);
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

    private registerPlayer() {
        if (!this.player || !this.recastDetourManager) {
            console.error('[NavBake] 未找到 Player 节点，无法注册寻路角色');
            return;
        }
        const startPos = this.player.worldPosition.clone();
        this._playerAgentId = this.recastDetourManager.addAgents(startPos, {
            radius: 0.45,
            height: 1.6,
            maxAcceleration: 12,
            maxSpeed: 4.5,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agentPos = this.recastDetourManager.crowd!.getAgentPosition(this._playerAgentId);
        this._playerYOffset = startPos.y - agentPos.y;
        this.player.setWorldPosition(agentPos.x, agentPos.y + this._playerYOffset, agentPos.z);
        this._targetYaw = this.player.eulerAngles.y;
        console.log('[NavBake] Player 已加入 Crowd, agentId =', this._playerAgentId);
    }

    private onTouchEnd(touch?: Touch) {
        if (!touch) {
            return;
        }
        this.handleClick(touch.getLocationX(), touch.getLocationY());
    }

    private onMouseUp(event?: EventMouse) {
        if (!event || event.getButton() !== EventMouse.BUTTON_LEFT) {
            return;
        }
        this.handleClick(event.getLocationX(), event.getLocationY());
    }

    private handleClick(x: number, y: number) {
        const now = Date.now();
        if (now - this._lastClickTime < 50) {
            return;
        }
        this._lastClickTime = now;
        if (!this.recastDetourManager || this._playerAgentId < 0 || !this.camera || !this.stationRoot) {
            return;
        }
        const ray = this.camera.screenPointToRay(x, y);
        const hitNode = this.raycastStation(ray);
        if (!hitNode) {
            return;
        }
        const interactPos = this.findInteractPos(hitNode);
        if (!interactPos) {
            console.warn(`[NavBake] 点击了 ${hitNode.name}，但向上找不到名为 ${INTERACT_POS_NAME} 的子节点`);
            return;
        }
        const standPos = this.resolveStandPoint(interactPos);
        this._lookTarget.set(interactPos.parent?.worldPosition ?? interactPos.worldPosition);
        this._hasLookTarget = true;
        this.recastDetourManager.agentGotoByIndex(this._playerAgentId, standPos);
        console.log('[NavBake] 前往', interactPos.parent?.name ?? hitNode.name, standPos);
    }

    private raycastStation(ray: geometry.Ray): Node | null {
        const renderers = this.stationRoot!.getComponentsInChildren(MeshRenderer);
        let bestDistance = Number.MAX_VALUE;
        let bestNode: Node | null = null;
        for (let i = 0; i < renderers.length; ++i) {
            const model = renderers[i].model;
            if (!model) {
                continue;
            }
            const distance = geometry.intersect.rayModel(ray, model, {
                mode: geometry.ERaycastMode.CLOSEST,
                doubleSided: false,
                distance: Number.MAX_SAFE_INTEGER,
            });
            if (distance && distance < bestDistance) {
                bestDistance = distance;
                bestNode = renderers[i].node;
            }
        }
        return bestNode;
    }

    private findInteractPos(from: Node): Node | null {
        const stopAt = this.stationRoot;
        let current: Node | null = from;
        while (current) {
            if (current.name === INTERACT_POS_NAME) {
                return current;
            }
            const child = current.getChildByName(INTERACT_POS_NAME);
            if (child) {
                return child;
            }
            if (current === stopAt) {
                break;
            }
            current = current.parent;
        }
        return null;
    }

    /**
     * 把 InteractPos 投到地面导航网上，并沿操作台中心向外推开，避免站到台面或钻进模型。
     */
    private resolveStandPoint(interactPos: Node) {
        const dest = interactPos.worldPosition.clone();
        const station = interactPos.parent;
        if (station) {
            const center = station.worldPosition;
            let dx = dest.x - center.x;
            let dz = dest.z - center.z;
            const len = Math.sqrt(dx * dx + dz * dz);
            const keepClear = 0.7;
            if (len < 0.001) {
                dx = 0;
                dz = 1;
            } else {
                dx /= len;
                dz /= len;
            }
            const push = Math.max(len, keepClear);
            dest.x = center.x + dx * push;
            dest.z = center.z + dz * push;
        }
        if (this.player) {
            dest.y = this.player.worldPosition.y - this._playerYOffset;
        }
        return dest;
    }

    private syncPlayer(dt: number) {
        if (!this.player || !this.recastDetourManager?.crowd || this._playerAgentId < 0) {
            return;
        }
        const crowd = this.recastDetourManager.crowd;
        const agentPos = crowd.getAgentPosition(this._playerAgentId);
        this.player.setWorldPosition(agentPos.x, agentPos.y + this._playerYOffset, agentPos.z);

        const next = crowd.getAgentNextTargetPath(this._playerAgentId);
        const toNextX = next.x - agentPos.x;
        const toNextZ = next.z - agentPos.z;
        const velocity = crowd.getAgentVelocity(this._playerAgentId);
        if (toNextX * toNextX + toNextZ * toNextZ > 0.01) {
            this.faceXZ(toNextX, toNextZ);
        } else if (velocity.lengthSqr() > 0.04) {
            this.faceXZ(velocity.x, velocity.z);
        } else if (this._hasLookTarget) {
            this.faceXZ(this._lookTarget.x - agentPos.x, this._lookTarget.z - agentPos.z);
        }
        this.applyYaw(dt);
    }

    /** 只绕 Y 轴朝向，适配模型正面为 +Z 的角色，避免 lookAt 把人拧到 -Z 或带出倾斜。 */
    private faceXZ(dirX: number, dirZ: number) {
        if (dirX * dirX + dirZ * dirZ < 1e-6) {
            return;
        }
        this._targetYaw = Math.atan2(dirX, dirZ) * 180 / Math.PI + this.yawOffset;
    }

    private applyYaw(dt: number) {
        if (!this.player) {
            return;
        }
        const current = this.player.eulerAngles.y;
        const yaw = this.lerpAngle(current, this._targetYaw, 1 - Math.exp(-this.turnSpeed * dt));
        this.player.setRotationFromEuler(0, yaw, 0);
    }

    private lerpAngle(from: number, to: number, t: number) {
        let diff = (to - from) % 360;
        if (diff > 180) {
            diff -= 360;
        } else if (diff < -180) {
            diff += 360;
        }
        return from + diff * Math.min(t, 1);
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
