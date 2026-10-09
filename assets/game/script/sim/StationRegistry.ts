import { Node, Vec3 } from "cc";
import { ItemStack } from "../domain/ItemStack";
import { Station } from "../domain/Station";

const INTERACT_POS_NAME = "InteractPos";

export interface StationBinding {
    station: Station;
    node: Node;
    interactPos: Node;
}

export class StationRegistry {
    private readonly _byId = new Map<string, StationBinding>();
    private readonly _list: StationBinding[] = [];

    get all(): readonly StationBinding[] {
        return this._list;
    }

    get(id: string): StationBinding | null {
        return this._byId.get(id) ?? null;
    }

    clear(): void {
        this._byId.clear();
        this._list.length = 0;
    }

    scan(stationRoot: Node): void {
        this.clear();
        for (let i = 0; i < stationRoot.children.length; i++) {
            const node = stationRoot.children[i];
            const interactPos = findInteractPos(node, stationRoot);
            if (!interactPos) {
                continue;
            }
            const id = `${node.name}_${i}`;
            const station = new Station(id, "place");
            const binding: StationBinding = { station, node, interactPos };
            this._byId.set(id, binding);
            this._list.push(binding);
        }
        this.seedDemoSlots();
    }

    findByHitNode(hit: Node, stopAt: Node): StationBinding | null {
        let current: Node | null = hit;
        while (current) {
            for (let i = 0; i < this._list.length; i++) {
                if (this._list[i].node === current) {
                    return this._list[i];
                }
            }
            if (current === stopAt) {
                break;
            }
            current = current.parent;
        }
        return null;
    }

    standPoint(binding: StationBinding, playerY: number): Vec3 {
        const dest = binding.interactPos.worldPosition.clone();
        const center = binding.node.worldPosition;
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
        dest.y = playerY;
        return dest;
    }

    private seedDemoSlots(): void {
        if (this._list[0]) {
            this._list[0].station.slot = new ItemStack("potato", 2);
        }
        if (this._list[1]) {
            this._list[1].station.slot = new ItemStack("onion", 1);
        }
    }
}

export function findInteractPos(from: Node, stopAt: Node | null): Node | null {
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
