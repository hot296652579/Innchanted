import {
    _decorator,
    Button,
    Camera,
    Component,
    EventMouse,
    EventTouch,
    geometry,
    input,
    Input,
    MeshRenderer,
    Node,
    sys,
    Vec3,
} from "cc";
import { CommandTarget } from "../domain/Command";
import { StationRegistry } from "../sim/StationRegistry";

const { ccclass } = _decorator;

export type ClickHit = {
    target: CommandTarget;
    dest: Vec3 | null;
    lookAt: Vec3 | null;
};

@ccclass("ClickPicker")
export class ClickPicker extends Component {
    camera: Camera | null = null;
    player: Node | null = null;
    stationRoot: Node | null = null;
    planeRoot: Node | null = null;
    registry: StationRegistry | null = null;
    onHit: ((hit: ClickHit) => void) | null = null;

    onEnable(): void {
        if (this.useTouch()) {
            input.on(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        } else {
            input.on(Input.EventType.MOUSE_UP, this.onMouseUp, this);
        }
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_END, this.onTouchEnd, this);
        input.off(Input.EventType.MOUSE_UP, this.onMouseUp, this);
    }

    private useTouch(): boolean {
        return (
            sys.isMobile ||
            sys.platform === sys.Platform.WECHAT_GAME ||
            sys.platform === sys.Platform.BYTEDANCE_MINI_GAME
        );
    }

    private onTouchEnd(event: EventTouch): void {
        if (this.isUiEvent(event.target as Node | null)) {
            return;
        }
        this.handleClick(event.getLocationX(), event.getLocationY());
    }

    private onMouseUp(event: EventMouse): void {
        if (event.getButton() !== EventMouse.BUTTON_LEFT) {
            return;
        }
        if (this.isUiEvent(event.target as Node | null)) {
            return;
        }
        this.handleClick(event.getLocationX(), event.getLocationY());
    }

    private handleClick(x: number, y: number): void {
        if (!this.camera || !this.onHit) {
            return;
        }
        const ray = new geometry.Ray();
        this.camera.screenPointToRay(x, y, ray);
        const hit = this.pick(ray);
        if (hit) {
            this.onHit(hit);
        }
    }

    private pick(ray: geometry.Ray): ClickHit | null {
        if (this.hitPlayer(ray)) {
            return { target: { kind: "self" }, dest: null, lookAt: null };
        }
        if (this.stationRoot && this.registry) {
            const stationNode = this.raycastMeshes(ray, this.stationRoot);
            if (stationNode) {
                const binding = this.registry.findByHitNode(stationNode, this.stationRoot);
                if (binding) {
                    const playerY = this.player
                        ? this.player.worldPosition.y
                        : (binding.interactPos ?? binding.node).worldPosition.y;
                    const dest = this.registry.standPoint(binding, playerY);
                    return {
                        target: { kind: "place", stationId: binding.station.id },
                        dest,
                        lookAt: binding.node.worldPosition.clone(),
                    };
                }
            }
        }
        const dest = this.pickGround(ray);
        if (dest) {
            return {
                target: { kind: "ground", x: dest.x, y: dest.y, z: dest.z },
                dest,
                lookAt: null,
            };
        }
        return null;
    }

    private pickGround(ray: geometry.Ray): Vec3 | null {
        const floorY = this.player?.worldPosition.y ?? this.planeY();
        if (Math.abs(ray.d.y) < 1e-5) {
            return null;
        }
        const t = (floorY - ray.o.y) / ray.d.y;
        if (t < 0) {
            return null;
        }
        return new Vec3(
            ray.o.x + ray.d.x * t,
            floorY,
            ray.o.z + ray.d.z * t,
        );
    }

    private planeY(): number {
        if (!this.planeRoot) {
            return 0.5;
        }
        return this.planeRoot.worldPosition.y;
    }

    private hitPlayer(ray: geometry.Ray): boolean {
        if (!this.player) {
            return false;
        }
        return this.raycastMeshes(ray, this.player) !== null;
    }

    private raycastMeshes(ray: geometry.Ray, root: Node): Node | null {
        const renderers = root.getComponentsInChildren(MeshRenderer);
        let bestDistance = Number.MAX_VALUE;
        let bestNode: Node | null = null;
        for (let i = 0; i < renderers.length; i++) {
            const model = renderers[i].model;
            if (!model) {
                continue;
            }
            const distance = geometry.intersect.rayModel(ray, model, {
                mode: geometry.ERaycastMode.CLOSEST,
                doubleSided: true,
                distance: Number.MAX_SAFE_INTEGER,
            });
            if (distance && distance < bestDistance) {
                bestDistance = distance;
                bestNode = renderers[i].node;
            }
        }
        return bestNode;
    }

    private isUiEvent(target: Node | null): boolean {
        let current = target;
        while (current) {
            if (current.getComponent(Button)) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }
}
