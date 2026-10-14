import { AnimationClip, Node, Quat, SkeletalAnimation, Vec3 } from "cc";

const HOLD_NAME = "HoldPoint";
const _pos = new Vec3();
const _rot = new Quat();

/** 蝙蝠小偷的飞行动画与持物点。不写偷多少、不改台子数据。 */
export class ThiefView {
    flying = false;

    private _node: Node | null = null;
    private _hold: Node | null = null;
    private _anim: SkeletalAnimation | null = null;
    private readonly _home = new Vec3();
    private readonly _homeRot = new Quat();
    private readonly _from = new Vec3();
    private readonly _to = new Vec3();
    private readonly _fromRot = new Quat();
    private readonly _toRot = new Quat();
    private _elapsed = 0;
    private _duration = 0.2;
    private _landHome = false;

    get hold(): Node | null {
        return this._hold;
    }

    get home(): Vec3 {
        return this._home;
    }

    bind(node: Node): void {
        this._node = node;
        node.mobility = 2;
        this._home.set(node.worldPosition);
        this._homeRot.set(node.worldRotation);
        this._anim = node.getComponentInChildren(SkeletalAnimation);
        this._hold = node.getChildByName(HOLD_NAME);
        if (!this._hold) {
            this._hold = new Node(HOLD_NAME);
            node.addChild(this._hold);
            this._hold.setPosition(0, 0.6, 0.4);
        }
        this._hold.mobility = 2;
    }

    playFlying(): void {
        this.playClip(["bat_flying", "flying"], true);
    }

    playHit(): number {
        const name = this.playClip(["bat_hit", "hit"], false);
        if (!name || !this._anim) {
            return 1;
        }
        const state = this._anim.getState(name);
        return state?.duration > 0 ? state.duration : 1;
    }

    flyTo(world: Vec3, speed: number): void {
        this._landHome = false;
        this.lookQuat(world, this._toRot);
        this.beginFly(world, speed, this._toRot);
    }

    flyHome(speed: number): void {
        this._landHome = true;
        this.lookQuat(this._home, this._toRot);
        this._node?.setWorldRotation(this._toRot);
        this.beginFly(this._home, speed, this._toRot);
    }

    tick(dt: number): void {
        if (!this.flying || !this._node) {
            return;
        }
        this._elapsed += dt;
        const t = Math.min(1, this._elapsed / this._duration);
        Vec3.lerp(_pos, this._from, this._to, t);
        Quat.slerp(_rot, this._fromRot, this._toRot, t);
        this._node.setWorldPosition(_pos);
        this._node.setWorldRotation(_rot);
        if (t >= 1) {
            this.flying = false;
            this._node.setWorldPosition(this._to);
            this._node.setWorldRotation(this._landHome ? this._homeRot : this._toRot);
            this._landHome = false;
        }
    }

    snapHome(): void {
        this.flying = false;
        this._node?.setWorldPosition(this._home);
        this._node?.setWorldRotation(this._homeRot);
    }

    discardHeld(): void {
        const hold = this._hold;
        if (!hold) {
            return;
        }
        const kids = hold.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }

    private beginFly(world: Vec3, speed: number, rot: Quat): void {
        if (!this._node) {
            return;
        }
        this._from.set(this._node.worldPosition);
        this._to.set(world);
        this._fromRot.set(this._node.worldRotation);
        this._toRot.set(rot);
        const dist = Vec3.distance(this._from, this._to);
        this._duration = Math.max(0.15, dist / Math.max(0.5, speed));
        this._elapsed = 0;
        this.flying = true;
        this.playFlying();
    }

    private lookQuat(world: Vec3, out: Quat): void {
        const node = this._node;
        if (!node) {
            return;
        }
        const p = node.worldPosition;
        const dx = world.x - p.x;
        const dz = world.z - p.z;
        if (dx * dx + dz * dz < 1e-6) {
            out.set(node.worldRotation);
            return;
        }
        Quat.fromEuler(out, 0, Math.atan2(dx, dz) * 180 / Math.PI, 0);
    }

    private playClip(keys: string[], loop: boolean): string | null {
        const anim = this._anim;
        if (!anim) {
            return null;
        }
        const name = this.findClip(keys);
        if (!name) {
            return null;
        }
        anim.play(name);
        const state = anim.getState(name);
        if (state) {
            state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        }
        return name;
    }

    private findClip(keys: string[]): string | null {
        const clips = this._anim?.clips ?? [];
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                if (!clip) {
                    continue;
                }
                const name = clip.name.toLowerCase();
                if (!name.includes(key)) {
                    continue;
                }
                if (key === "attack" && name.includes("attack2")) {
                    continue;
                }
                return clip.name;
            }
        }
        return null;
    }
}
