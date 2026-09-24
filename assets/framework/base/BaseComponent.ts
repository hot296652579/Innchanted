import { _decorator, Component, Node } from 'cc';
import { EventManager } from '../event/EventManager';
const { ccclass } = _decorator;

@ccclass
export default class BaseComponent extends Component {
    protected onLoad(): void { }

    protected start(): void { }

    protected update(dt: number): void { }

    protected lateUpdate(dt: number): void { }

    public onDestroy(): void {
        const evt = EventManager.getInstance();
        evt?.offAllByTarget?.(this);
    }

    /** 快速获取子节点 */
    protected getChild(path: string): Node | null {
        return this.node.getChildByPath(path);
    }
}