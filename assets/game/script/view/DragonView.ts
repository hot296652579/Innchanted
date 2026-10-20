import { AnimationClip, Node, Quat, SkeletalAnimation, Vec3 } from "cc";

const _pos = new Vec3();

/** 冰龙沿预定航线平移。起飞时对准航向，飞行中不转向。 */
export class DragonView {
    flying = false;

    private _node: Node | null = null;
    private _anim: SkeletalAnimation | null = null;
    private readonly _home = new Vec3();
    private readonly _homeRot = new Quat();
    private readonly _from = new Vec3();
    private readonly _to = new Vec3();
    private readonly _face = new Quat();
    private _elapsed = 0;
    private _duration = 0.2;
    private _landHome = false;

    get home(): Vec3 {
        return this._home;
    }

    bind(node: Node): void {
        this._node = node;
        node.mobility = 2;
        this._home.set(node.worldPosition);
        this._homeRot.set(node.worldRotation);
        this._anim = node.getComponentInChildren(SkeletalAnimation);
        this.playFlying();
    }

    playFlying(): void {
        this.playClip(["flying"], true);
    }

    playAttack2(): number {
        const name = this.playClip(["attack2"], false);
        if (!name || !this._anim) {
            return 1.6;
        }
        const state = this._anim.getState(name);
        return state?.duration > 0 ? state.duration : 1.6;
    }

    flyTo(world: Vec3, speed: number): void {
        this._landHome = false;
        this.beginFly(world, speed);
        this.playFlying();
    }

    flyHome(speed: number): void {
        this._landHome = true;
        this.beginFly(this._home, speed);
        this.playFlying();
    }

    tick(dt: number): void {
        if (!this.flying || !this._node) {
            return;
        }
        this._elapsed += dt;
        const t = Math.min(1, this._elapsed / this._duration);
        Vec3.lerp(_pos, this._from, this._to, t);
        this._node.setWorldPosition(_pos);
        this._node.setWorldRotation(this._face);
        if (t >= 1) {
            this.flying = false;
            this._node.setWorldPosition(this._to);
            this._node.setWorldRotation(this._landHome ? this._homeRot : this._face);
            this._landHome = false;
        }
    }

    snapHome(): void {
        this.flying = false;
        this._node?.setWorldPosition(this._home);
        this._node?.setWorldRotation(this._homeRot);
        this.playFlying();
    }

    private beginFly(world: Vec3, speed: number): void {
        if (!this._node) {
            return;
        }
        this._from.set(this._node.worldPosition);
        this._to.set(world);
        this.lookQuat(this._from, this._to, this._face);
        this._node.setWorldRotation(this._face);
        const dist = Vec3.distance(this._from, this._to);
        this._duration = Math.max(0.2, dist / Math.max(0.5, speed));
        this._elapsed = 0;
        this.flying = true;
    }

    private lookQuat(from: Vec3, to: Vec3, out: Quat): void {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        if (dx * dx + dz * dz < 1e-6) {
            out.set(this._node?.worldRotation ?? this._homeRot);
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
                if (clip.name.toLowerCase().includes(key)) {
                    return clip.name;
                }
            }
        }
        return null;
    }
}
