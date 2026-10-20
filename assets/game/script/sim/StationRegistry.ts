import { Node, Vec3 } from "cc";
import { originalBarrelColor } from "../domain/Barrel";
import { ITEM_STACK_CAP, ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";

const INTERACT_POS_NAME = "InteractPos";
const HOLD_POINT_NAME = "HoldPoint";
const STAND_CLEAR = 1.2;

export interface StationBinding {
    station: Station;
    node: Node;
    interactPos: Node | null;
    holdPoint: Node;
}

/** 台子注册表：记录所有台子，方便查找。 */
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
            const type = inferStationType(node.name);
            let holdPoint = findNamedDescendant(node, HOLD_POINT_NAME);
            if (!holdPoint && (
                type === StationType.Table
                || type === StationType.Chest
                || type === StationType.OriginalBarrel
                || type === StationType.MagicBarrel
                || type === StationType.MagicJar
            )) {
                holdPoint = ensureHoldPoint(node, type === StationType.Chest ? 0.55 : 0.9);
            }
            if (!holdPoint) {
                continue;
            }
            let id = node.name;
            if (this._byId.has(id)) {
                id = `${node.name}_${i}`;
            }
            const station = new Station(id, type);
            if (type === StationType.OriginalBarrel && station.barrel) {
                station.barrel.color = originalBarrelColor(node.name);
            }
            station.slot = stackFromHoldPoint(holdPoint);
            const binding: StationBinding = {
                station,
                node,
                interactPos: findNamedDescendant(node, INTERACT_POS_NAME),
                holdPoint,
            };
            this._byId.set(id, binding);
            this._list.push(binding);
            const slot = station.slot;
            console.log(
                `[Station] ${id} (${station.type}) HoldPoint 货物`,
                slot ? `${slot.itemId} x${slot.count}` : "空",
            );
        }
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

    /** 没有 InteractPos 时，站在台子朝向玩家的一侧，而不是死用节点 forward。 */
    standPoint(binding: StationBinding, playerY: number, from: Vec3 | null = null): Vec3 {
        const center = binding.node.worldPosition;
        const dest = new Vec3();
        if (binding.interactPos) {
            dest.set(binding.interactPos.worldPosition);
        } else if (from) {
            dest.set(from.x, playerY, from.z);
        } else {
            const forward = binding.node.forward;
            dest.set(
                center.x + forward.x * STAND_CLEAR,
                playerY,
                center.z + forward.z * STAND_CLEAR,
            );
        }
        let dx = dest.x - center.x;
        let dz = dest.z - center.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) {
            dx = 0;
            dz = 1;
        } else {
            dx /= len;
            dz /= len;
        }
        dest.x = center.x + dx * STAND_CLEAR;
        dest.z = center.z + dz * STAND_CLEAR;
        dest.y = playerY;
        return dest;
    }
}

function inferStationType(name: string): StationType {
    const id = name.toLowerCase();
    if (id.startsWith("stove") || id.startsWith("cook")) {
        return StationType.Cook;
    }
    if (id === "table" || id.startsWith("table-") || id.startsWith("table_")) {
        return StationType.Table;
    }
    if (id.includes("treasuer") || id.includes("treasure") || id.startsWith("chest") || id.startsWith("bank")) {
        return StationType.Chest;
    }
    if (id.startsWith("originalbarrel")) {
        return StationType.OriginalBarrel;
    }
    if (id.startsWith("barrel")) {
        return StationType.MagicBarrel;
    }
    if (id.startsWith("itemstand")) {
        return StationType.ItemStand;
    }
    if (id.startsWith("magicjar")) {
        return StationType.MagicJar;
    }
    return StationType.Place;
}

function ensureHoldPoint(node: Node, localY: number): Node {
    const hold = new Node(HOLD_POINT_NAME);
    node.addChild(hold);
    hold.setPosition(0, localY, 0);
    return hold;
}

export function findNamedDescendant(root: Node, name: string): Node | null {
    if (root.name === name) {
        return root;
    }
    const direct = root.getChildByName(name);
    if (direct) {
        return direct;
    }
    for (let i = 0; i < root.children.length; i++) {
        const found = findNamedDescendant(root.children[i], name);
        if (found) {
            return found;
        }
    }
    return null;
}

export function itemIdFromNode(node: Node): string {
    return node.name.replace(/_\d+$/, "").toLowerCase();
}

function stackFromHoldPoint(holdPoint: Node): ItemStack | null {
    const kids = holdPoint.children;
    if (kids.length === 0) {
        return null;
    }
    const itemId = itemIdFromNode(kids[0]);
    let count = 0;
    for (let i = 0; i < kids.length; i++) {
        if (itemIdFromNode(kids[i]) === itemId) {
            count++;
        }
    }
    if (count <= 0) {
        return null;
    }
    return new ItemStack(itemId, Math.min(count, ITEM_STACK_CAP));
}
