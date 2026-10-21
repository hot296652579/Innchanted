import { instantiate, Node, ParticleSystem, Prefab, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";

const PATHS: Record<string, string> = {
    place: "effect/bossAttackSmoke/attckSmoke",
    fire: "effect/fire/fire01",
    smoke: "effect/smokeLight/smokeLight01",
    drink: "effect/changeColor/changeYellow",
    bank: "effect/collectColor/collectPurple",
};

const Y_OFFSET: Record<string, number> = {
    place: 0,
};

const _world = new Vec3();

interface Burst {
    node: Node;
    remain: number;
}

/** 台上 / 角色一次性或持续粒子。不进 HoldPoint，避免被当成货物。 */
export class FxView {
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _bursts: Burst[] = [];
    private readonly _sticky = new Map<string, Node[]>();

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const keys = Object.keys(PATHS);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const prefab = await res.loadPrefab(PATHS[key], BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Fx] 未找到", PATHS[key]);
                continue;
            }
            this._prefabs.set(key, prefab);
        }
    }

    tick(dt: number): void {
        for (let i = this._bursts.length - 1; i >= 0; i--) {
            const burst = this._bursts[i];
            burst.remain -= dt;
            if (burst.remain > 0 && burst.node.isValid) {
                continue;
            }
            this.destroyNode(burst.node);
            this._bursts.splice(i, 1);
        }
    }

    /** 一次性：放置烟、喝药、存金币。 */
    burst(host: Node, key: string, duration: number, worldFrom?: Node | null): void {
        const node = this.spawn(host, key, worldFrom);
        if (!node) {
            return;
        }
        this._bursts.push({ node, remain: duration });
    }

    /** 持续：灶炉火 / 完成烟。同一台可叠多个。 */
    attach(id: string, host: Node, key: string, worldFrom?: Node | null): void {
        const node = this.spawn(host, key, worldFrom);
        if (!node) {
            return;
        }
        const list = this._sticky.get(id) ?? [];
        list.push(node);
        this._sticky.set(id, list);
    }

    stop(id: string): void {
        const list = this._sticky.get(id);
        if (!list) {
            return;
        }
        this._sticky.delete(id);
        for (let i = 0; i < list.length; i++) {
            this.destroyNode(list[i]);
        }
    }

    clear(): void {
        for (let i = 0; i < this._bursts.length; i++) {
            this.destroyNode(this._bursts[i].node);
        }
        this._bursts.length = 0;
        this._sticky.forEach((list) => {
            for (let i = 0; i < list.length; i++) {
                this.destroyNode(list[i]);
            }
        });
        this._sticky.clear();
    }

    private spawn(host: Node, key: string, worldFrom?: Node | null): Node | null {
        const prefab = this._prefabs.get(key);
        if (!prefab || !host.isValid) {
            return null;
        }
        const node = instantiate(prefab);
        node.name = `Fx_${key}`;
        host.addChild(node);
        const lift = Y_OFFSET[key] ?? 0;
        if (worldFrom?.isValid) {
            _world.set(worldFrom.worldPosition);
            _world.y += lift;
            node.setWorldPosition(_world);
        } else {
            node.setPosition(0, lift, 0);
        }
        node.setWorldScale(1, 1, 1);
        this.playParticles(node);
        return node;
    }

    private playParticles(root: Node): void {
        const list = root.getComponentsInChildren(ParticleSystem);
        for (let i = 0; i < list.length; i++) {
            list[i].play();
        }
    }

    private destroyNode(node: Node): void {
        if (node.isValid) {
            node.destroy();
        }
    }
}
