import { _decorator, Component } from 'cc';
const { ccclass } = _decorator;

@ccclass
export class PoolObj extends Component {
    /** 对象所属池key */
    public poolKey: string = "";

    /** 从池中取出时调用 */
    public onSpawn(...args: any[]): void {
        this.node.active = true;
    }

    /** 回收进池时调用 */
    public onDespawn(): void {
        this.node.active = false;
        this.node.setParent(null);
    }
}