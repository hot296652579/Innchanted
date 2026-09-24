import { Vec2, Vec3 } from 'cc';

export class MathUtil {
    /** 2D两点距离平方（不开根号，性能更高） */
    public static distSq2D(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }

    /** 2D真实距离 */
    public static dist2D(a: Vec2 | Vec3, b: Vec2 | Vec3): number {
        return Math.sqrt(this.distSq2D(a, b));
    }

    /** 判断点是否在圆形范围内 */
    public static pointInCircle(point: Vec2, center: Vec2, radius: number): boolean {
        return this.distSq2D(point, center) <= radius * radius;
    }

    /** 限制数值区间 */
    public static clamp(val: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, val));
    }

    /** 格子坐标转世界坐标（塔防地图通用） */
    public static gridToWorld(gridX: number, gridY: number, cellSize: number): Vec2 {
        return new Vec2(gridX * cellSize, gridY * cellSize);
    }

    /** 世界坐标转格子 */
    public static worldToGrid(pos: Vec2, cellSize: number): Vec2 {
        const x = Math.floor(pos.x / cellSize);
        const y = Math.floor(pos.y / cellSize);
        return new Vec2(x, y);
    }
}