import { Animation, AnimationClip, Color, MeshRenderer, Node, SkeletalAnimation, tween, Tween } from "cc";

const FACE_Y = 2.2;
const _fade = { t: 0 };

/** 巫师过场：播出生动画，再淡出销毁。 */
export class WizardView {
    private _node: Node | null = null;
    private _face: Node | null = null;
    private _anim: Animation | null = null;

    get node(): Node | null {
        return this._node;
    }

    get face(): Node | null {
        return this._face;
    }

    bind(node: Node): void {
        this._node = node;
        this._anim = node.getComponentInChildren(SkeletalAnimation) ?? node.getComponentInChildren(Animation);
        this._face = this.ensureFace(node);
    }

    playSpawn(): number {
        return this.playClip(["spawn_ground", "spawn"], false);
    }

    playIdle(): void {
        this.playClip(["idle"], true);
    }

    fadeOut(sec: number, onDone?: () => void): void {
        const node = this._node;
        if (!node?.isValid) {
            onDone?.();
            return;
        }
        Tween.stopAllByTarget(_fade);
        const start = node.worldScale.clone();
        const renderers = node.getComponentsInChildren(MeshRenderer);
        _fade.t = 0;
        tween(_fade)
            .to(Math.max(0.05, sec), { t: 1 }, {
                onUpdate: () => {
                    if (!node.isValid) {
                        return;
                    }
                    const keep = 1 - _fade.t;
                    node.setWorldScale(start.x * keep, start.y * keep, start.z * keep);
                    this.tintAlpha(renderers, keep);
                },
            })
            .call(() => onDone?.())
            .start();
    }

    destroy(): void {
        Tween.stopAllByTarget(_fade);
        if (this._node?.isValid) {
            this._node.destroy();
        }
        this._node = null;
        this._face = null;
        this._anim = null;
    }

    private tintAlpha(renderers: MeshRenderer[], keep: number): void {
        for (let i = 0; i < renderers.length; i++) {
            const mat = renderers[i].material;
            if (!mat) {
                continue;
            }
            const key = this.colorKey(mat);
            if (!key) {
                continue;
            }
            const color = mat.getProperty(key) as Color;
            if (!color) {
                continue;
            }
            color.a = Math.round(255 * keep);
            mat.setProperty(key, color);
        }
    }

    private colorKey(mat: { getProperty: (name: string) => unknown }): string | null {
        if (mat.getProperty("mainColor") != null) {
            return "mainColor";
        }
        if (mat.getProperty("albedo") != null) {
            return "albedo";
        }
        return null;
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
                if (clip?.name.toLowerCase().includes(key)) {
                    return clip.name;
                }
            }
        }
        return null;
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
}
