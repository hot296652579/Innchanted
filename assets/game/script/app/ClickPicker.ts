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
import { Enemy } from "../view/Enemy";

const { ccclass } = _decorator;

const PLAYER_SPHERE_R = 0.7;

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
    levelRoot: Node | null = null;
    registry: StationRegistry | null = null;
    guestRoot: Node | null = null;
    canPickGuest: ((node: Node) => boolean) | null = null;
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
        const enemy = this.pickEnemy(ray);
        if (enemy) {
            return enemy;
        }
        const guest = this.pickGuest(ray);
        if (guest) {
            return guest;
        }
        const place = this.pickStation(ray);
        if (place) {
            return place;
        }
        if (this.hitPlayer(ray)) {
            console.log("[Drink] 点选自身");
            return { target: { kind: "self" }, dest: null, lookAt: null };
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

    private pickGuest(ray: geometry.Ray): ClickHit | null {
        if (!this.guestRoot || !this.canPickGuest) {
            return null;
        }
        let bestDist = Number.MAX_VALUE;
        let bestRoot: Node | null = null;
        const guests = this.guestRoot.children;
        for (let i = 0; i < guests.length; i++) {
            const root = guests[i];
            if (!root.activeInHierarchy || !this.canPickGuest(root)) {
                continue;
            }
            const dist = this.hitEnemyDist(ray, root);
            if (dist !== null && dist < bestDist) {
                bestDist = dist;
                bestRoot = root;
            }
        }
        if (!bestRoot) {
            return null;
        }
        const from = this.player?.worldPosition ?? null;
        const playerY = from ? from.y : bestRoot.worldPosition.y;
        return {
            target: { kind: "guest", guestId: bestRoot.name },
            dest: standBeside(from, bestRoot.worldPosition, playerY, 1.1),
            lookAt: bestRoot.worldPosition.clone(),
        };
    }

    private pickStation(ray: geometry.Ray): ClickHit | null {
        if (!this.stationRoot || !this.registry) {
            return null;
        }
        const stationNode = this.raycastMeshes(ray, this.stationRoot);
        if (!stationNode) {
            return null;
        }
        const binding = this.registry.findByHitNode(stationNode, this.stationRoot);
        if (!binding) {
            return null;
        }
        const from = this.player?.worldPosition ?? null;
        const playerY = from
            ? from.y
            : (binding.interactPos ?? binding.node).worldPosition.y;
        return {
            target: { kind: "place", stationId: binding.station.id },
            dest: this.registry.standPoint(binding, playerY, from),
            lookAt: binding.node.worldPosition.clone(),
        };
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

    private pickEnemy(ray: geometry.Ray): ClickHit | null {
        if (!this.levelRoot) {
            return null;
        }
        const tags = this.levelRoot.getComponentsInChildren(Enemy);
        let bestDist = Number.MAX_VALUE;
        let bestRoot: Node | null = null;
        for (let i = 0; i < tags.length; i++) {
            const root = tags[i].node;
            if (!root.activeInHierarchy) {
                continue;
            }
            const dist = this.hitEnemyDist(ray, root);
            if (dist !== null && dist < bestDist) {
                bestDist = dist;
                bestRoot = root;
            }
        }
        if (!bestRoot) {
            return null;
        }
        const from = this.player?.worldPosition ?? null;
        const playerY = from ? from.y : bestRoot.worldPosition.y;
        return {
            target: { kind: "enemy", enemyId: bestRoot.name },
            dest: standBeside(from, bestRoot.worldPosition, playerY, 1.2),
            lookAt: bestRoot.worldPosition.clone(),
        };
    }

    /** 蒙皮网格包围盒经常不准，网格没命中时用角色球体兜底。 */
    private hitEnemyDist(ray: geometry.Ray, root: Node): number | null {
        const renderers = root.getComponentsInChildren(MeshRenderer);
        let best: number | null = null;
        for (let i = 0; i < renderers.length; i++) {
            const model = renderers[i].model;
            if (!model) {
                continue;
            }
            const dist = geometry.intersect.rayModel(ray, model, {
                mode: geometry.ERaycastMode.CLOSEST,
                doubleSided: true,
                distance: Number.MAX_SAFE_INTEGER,
            });
            if (dist && (best === null || dist < best)) {
                best = dist;
            }
        }
        const p = root.worldPosition;
        const sphere = new geometry.Sphere(p.x, p.y + 0.6, p.z, 1.2);
        const hit = geometry.intersect.raySphere(ray, sphere);
        if (hit && (best === null || hit < best)) {
            best = hit;
        }
        return best;
    }

    private hitPlayer(ray: geometry.Ray): boolean {
        if (!this.player) {
            return false;
        }
        if (this.raycastMeshes(ray, this.player)) {
            return true;
        }
        const p = this.player.worldPosition;
        const sphere = new geometry.Sphere(p.x, p.y + 0.85, p.z, PLAYER_SPHERE_R);
        return !!geometry.intersect.raySphere(ray, sphere);
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

function standBeside(from: Vec3 | null, center: Vec3, playerY: number, dist: number): Vec3 {
    let dx = from ? from.x - center.x : 0;
    let dz = from ? from.z - center.z : 1;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.001) {
        dx = 0;
        dz = 1;
    } else {
        dx /= len;
        dz /= len;
    }
    return new Vec3(center.x + dx * dist, playerY, center.z + dz * dist);
}
