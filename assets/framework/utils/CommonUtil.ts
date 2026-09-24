import { Node, Tween, tween, v3 } from "cc";

export interface ShakeAnimOptions {
    /** 抖动结束后回到的位置，默认当前坐标 */
    restX?: number;
    restY?: number;
    /** 左右振幅 */
    amplitude?: number;
    /** 单段晃动时长（秒） */
    stepDuration?: number;
}

export class CommonUtil {
    /** 随机整数 [min,max] */
    public static randomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /** 延迟等待 */
    public static waitTime(sec: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, sec * 1000));
    }

    /** 深拷贝简单对象 */
    public static deepCopy<T>(obj: T): T {
        return JSON.parse(JSON.stringify(obj)) as T;
    }

    /** 数组随机打乱 */
    public static shuffleArray<T>(arr: T[]): T[] {
        const list = [...arr];
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    /** 节点左右晃动后回到原位 */
    public static shakeNode(node: Node, options?: ShakeAnimOptions): Promise<void> {
        if (!node?.isValid) {
            return Promise.resolve();
        }
        const restX = options?.restX ?? node.position.x;
        const restY = options?.restY ?? node.position.y;
        const amp = options?.amplitude ?? 8;
        const step = options?.stepDuration ?? 0.04;
        Tween.stopAllByTarget(node);
        node.setScale(1, 1, 1);
        node.setPosition(restX, restY, 0);
        return new Promise(resolve => {
            tween(node)
                .to(step, { position: v3(restX + amp, restY, 0) })
                .to(step, { position: v3(restX - amp, restY, 0) })
                .to(step, { position: v3(restX + amp * 0.5, restY, 0) })
                .to(step, { position: v3(restX - amp * 0.5, restY, 0) })
                .to(step, { position: v3(restX, restY, 0) })
                .call(() => resolve())
                .start();
        });
    }
}
