import { Animation, AnimationClip, Node, SkeletalAnimation, Vec3, v3 } from "cc";
import { GridAgent } from "../sim/GridAgent";
import { IPathfinder } from "../sim/IPathfinder";

const MOVE_SPEED_SQ = 0.04;
const FACE_Y = 2.2;

/** 恐吓怪：Recast 快跑播 walk，到客人面前播一次 Throw。 */
export class ThreatenView {
    private _node: Node | null = null;
    private _face: Node | null = null;
    private _pathfinder: IPathfinder | null = null;
    private _agent: GridAgent | null = null;
    private _yOffset = 0;
    private _yawOffset = 0;
    private _anim: Animation | null = null;
    private _loco = "";
    private _action = false;
    private readonly _home = new Vec3();
    private readonly _look = v3();
    private _hasLook = false;
    private _targetYaw = 0;

    get node(): Node | null {
        return this._node;
    }

    get face(): Node | null {
        return this._face;
    }

    get home(): Vec3 {
        return this._home;
    }

    bind(node: Node, pathfinder: IPathfinder, yawOffset: number, maxSpeed = 2): void {
        this._node = node;
        this._pathfinder = pathfinder;
        this._yawOffset = yawOffset;
        node.mobility = 2;
        this._home.set(node.worldPosition);
        this._targetYaw = node.eulerAngles.y;
        this._anim = node.getComponentInChildren(SkeletalAnimation) ?? node.getComponentInChildren(Animation);
        this._face = this.ensureFace(node);
        const startPos = node.worldPosition.clone();
        const agentId = pathfinder.addAgent(startPos, {
            radius: 0.3,
            height: 1.6,
            maxAcceleration: 12,
            maxSpeed,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agentPos = pathfinder.getPosition(agentId);
        this._yOffset = startPos.y - agentPos.y;
        this._agent = new GridAgent(pathfinder, agentId, 1.1);
        node.setWorldPosition(agentPos.x, agentPos.y + this._yOffset, agentPos.z);
        this.playIdle();
    }

    goto(world: Vec3): void {
        this._action = false;
        this._agent?.goto(world);
        this.playWalk();
    }

    goHome(): void {
        this.goto(this._home);
    }

    stop(): void {
        this._agent?.stop();
    }

    arrived(): boolean {
        return this._agent?.arrived() ?? true;
    }

    playIdle(): void {
        this._action = false;
        this.playClip(["idle"], true);
        this._loco = "idle";
    }

    playWalk(): void {
        this._action = false;
        this.playClip(["walk", "run"], true);
        this._loco = "walk";
    }

    playThrow(): number {
        this._action = true;
        this._loco = "";
        return this.playClip(["throw"], false);
    }

    playDeath(): number {
        this._action = true;
        this._loco = "";
        this._agent?.stop();
        return this.playClip(["death", "die"], false);
    }

    setLookTarget(world: Vec3): void {
        this._look.set(world);
        this._hasLook = true;
    }

    hide(): void {
        this._agent?.stop();
        if (this._node) {
            this._node.active = false;
        }
    }

    tick(dt: number): void {
        const node = this._node;
        const pathfinder = this._pathfinder;
        const agent = this._agent;
        if (!node || !node.active || !pathfinder || !agent) {
            return;
        }
        const agentPos = pathfinder.getPosition(agent.agentId);
        node.setWorldPosition(agentPos.x, agentPos.y + this._yOffset, agentPos.z);

        const next = pathfinder.getNextPoint(agent.agentId);
        const toNextX = next.x - agentPos.x;
        const toNextZ = next.z - agentPos.z;
        const velocity = pathfinder.getVelocity(agent.agentId);
        if (toNextX * toNextX + toNextZ * toNextZ > 0.01) {
            this.faceXZ(toNextX, toNextZ);
        } else if (velocity.lengthSqr() > 0.04) {
            this.faceXZ(velocity.x, velocity.z);
        } else if (this._hasLook) {
            this.faceXZ(this._look.x - agentPos.x, this._look.z - agentPos.z);
        }
        this.applyYaw(dt);

        if (this._action) {
            return;
        }
        const moving = velocity.lengthSqr() > MOVE_SPEED_SQ;
        const loco = moving ? "walk" : "idle";
        if (this._loco !== loco) {
            if (moving) {
                this.playWalk();
            } else {
                this.playIdle();
            }
        }
    }

    private ensureFace(node: Node): Node {
        let face = node.getChildByName("FacePoint");
        if (!face) {
            face = new Node("FacePoint");
            node.addChild(face);
            face.setPosition(0, FACE_Y, 0);
        }
        return face;
    }

    private playClip(keys: string[], loop: boolean): number {
        const anim = this._anim;
        if (!anim) {
            return 0.4;
        }
        const name = this.findClip(keys);
        if (!name) {
            return 0.4;
        }
        anim.play(name);
        const state = anim.getState(name);
        if (state) {
            state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        }
        return state?.duration > 0 ? state.duration : 0.4;
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

    private faceXZ(dirX: number, dirZ: number): void {
        if (dirX * dirX + dirZ * dirZ < 1e-6) {
            return;
        }
        this._targetYaw = Math.atan2(dirX, dirZ) * 180 / Math.PI + this._yawOffset;
    }

    private applyYaw(dt: number): void {
        const node = this._node;
        if (!node) {
            return;
        }
        const current = node.eulerAngles.y;
        const yaw = this.lerpAngle(current, this._targetYaw, 1 - Math.exp(-10 * dt));
        node.setRotationFromEuler(0, yaw, 0);
    }

    private lerpAngle(from: number, to: number, t: number): number {
        let diff = (to - from) % 360;
        if (diff > 180) {
            diff -= 360;
        } else if (diff < -180) {
            diff += 360;
        }
        return from + diff * Math.min(t, 1);
    }
}
