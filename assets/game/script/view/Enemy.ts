import { _decorator, Component, Node } from "cc";

const { ccclass } = _decorator;

/** 怪物标记，怪物挂这个组件。 */
@ccclass("Enemy")
export class Enemy extends Component {
    static ensure(node: Node): Enemy {
        return node.getComponent(Enemy) ?? node.addComponent(Enemy);
    }
}
