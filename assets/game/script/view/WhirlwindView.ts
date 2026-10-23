import { Animation, instantiate, Node, ParticleSystem, Prefab, Quat, tween, Tween, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";

const DEFAULT_PREFAB = "effect/whirlwind/whirlwindLight01";
const LIFT = 1.5;
const SWAY = 8;
const SWAY_SEC = 0.55;

interface Session {
    binding: StationBinding;
    fx: Node | null;
    localPos: Vec3;
    localRot: Quat;
    ground: Vec3;
}

/** 旋风封台：台下粒子、台子悬空晃动，药水解开后落回。 */
export class WhirlwindView {
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _sessions = new Map<string, Session>();

    async seal(
        registry: StationRegistry,
        types: string[],
        count: number,
        unlockItemId: string,
        prefabPath?: string,
    ): Promise<number> {
        const path = prefabPath || DEFAULT_PREFAB;
        const prefab = await this.loadPrefab(path);
        const candidates = this.collect(registry, types);
        const take = Math.min(Math.max(1, count), candidates.length);
        let n = 0;
        for (let i = 0; i < take; i++) {
            const pick = Math.floor(Math.random() * candidates.length);
            const binding = candidates[pick];
            candidates.splice(pick, 1);
            if (!binding.station.tryWind(unlockItemId)) {
                continue;
            }
            this.show(binding, prefab);
            n += 1;
        }
        return n;
    }

    unlock(binding: StationBinding, itemId: string): boolean {
        if (!binding.station.winded || binding.station.windUnlockItemId !== itemId) {
            return false;
        }
        binding.station.clearWind();
        this.hide(binding.station.id);
        return true;
    }

    update(): void {
        this._sessions.forEach((session) => {
            const fx = session.fx;
            const node = session.binding.node;
            if (!fx?.isValid || !node.isValid) {
                return;
            }
            const pos = session.ground;
            fx.setWorldPosition(pos.x, pos.y, pos.z);
        });
    }

    clear(): void {
        const ids = Array.from(this._sessions.keys());
        for (let i = 0; i < ids.length; i++) {
            const session = this._sessions.get(ids[i]);
            session?.binding.station.clearWind();
            this.hide(ids[i]);
        }
    }

    private async loadPrefab(path: string): Promise<Prefab | null> {
        const cached = this._prefabs.get(path);
        if (cached) {
            return cached;
        }
        const prefab = await ResourceManager.getInstance().loadPrefab(path, BundlesEnum.Game);
        if (!prefab) {
            console.warn("[Wind] 未找到", path);
            return null;
        }
        this._prefabs.set(path, prefab);
        return prefab;
    }

    private collect(registry: StationRegistry, types: string[]): StationBinding[] {
        const allow = types.length > 0 ? types : ["cook", "place", "itemstand"];
        const list: StationBinding[] = [];
        for (let i = 0; i < registry.all.length; i++) {
            const binding = registry.all[i];
            if (binding.station.winded || binding.station.locked || binding.station.broken) {
                continue;
            }
            if (allow.indexOf(binding.station.type) < 0) {
                continue;
            }
            list.push(binding);
        }
        return list;
    }

    private show(binding: StationBinding, prefab: Prefab | null): void {
        this.hide(binding.station.id);
        const node = binding.node;
        const localPos = node.position.clone();
        const localRot = node.rotation.clone();
        const ground = node.worldPosition.clone();
        let fx: Node | null = null;
        if (prefab) {
            fx = instantiate(prefab);
            fx.name = `Wind_${binding.station.id}`;
            node.parent?.addChild(fx);
            fx.setWorldPosition(ground.x, ground.y, ground.z);
            this.playFx(fx);
        }
        node.setWorldPosition(ground.x, ground.y + LIFT, ground.z);
        this.startSway(node, localRot);
        this._sessions.set(binding.station.id, { binding, fx, localPos, localRot, ground });
    }

    private hide(stationId: string): void {
        const session = this._sessions.get(stationId);
        if (!session) {
            return;
        }
        this._sessions.delete(stationId);
        const node = session.binding.node;
        Tween.stopAllByTarget(node);
        if (node.isValid) {
            node.setPosition(session.localPos);
            node.setRotation(session.localRot);
        }
        if (session.fx?.isValid) {
            session.fx.destroy();
        }
    }

    private startSway(node: Node, homeRot: Quat): void {
        Tween.stopAllByTarget(node);
        const left = new Vec3();
        const right = new Vec3();
        const home = new Vec3();
        Quat.toEuler(home, homeRot);
        left.set(home.x + SWAY, home.y, home.z - SWAY * 0.4);
        right.set(home.x - SWAY, home.y, home.z + SWAY * 0.4);
        node.eulerAngles = left;
        tween(node)
            .repeatForever(
                tween().to(SWAY_SEC, { eulerAngles: right }).to(SWAY_SEC, { eulerAngles: left }),
            )
            .start();
    }

    private playFx(root: Node): void {
        const anim = root.getComponent(Animation) ?? root.getComponentInChildren(Animation);
        anim?.play();
        const list = root.getComponentsInChildren(ParticleSystem);
        for (let i = 0; i < list.length; i++) {
            list[i].play();
        }
    }
}
