import json
from pathlib import Path

p = Path(r"D:/CocosPro/魔法旅馆/Innchanted/assets/game/prefab/Level1.prefab")
data = json.loads(p.read_text(encoding="utf-8"))


def get(obj, key, default=None):
    if not isinstance(obj, dict):
        return default
    return obj.get(key, default)


nodes = {i: o for i, o in enumerate(data) if get(o, "__type__") == "cc.Node"}
prefab_infos = {i: o for i, o in enumerate(data) if get(o, "__type__") == "cc.PrefabInfo"}
instances = {i: o for i, o in enumerate(data) if get(o, "__type__") == "cc.PrefabInstance"}
overrides = {i: o for i, o in enumerate(data) if get(o, "__type__") == "CCPropertyOverrideInfo"}


def resolve_id(ref):
    if isinstance(ref, dict) and "__id__" in ref:
        return ref["__id__"]
    return None


def children_ids(node):
    out = []
    for c in get(node, "_children") or []:
        cid = resolve_id(c)
        if cid is not None:
            out.append(cid)
    return out


def override_map(inst):
    result = {}
    for ref in get(inst, "propertyOverrides") or []:
        oid = resolve_id(ref)
        ov = overrides.get(oid)
        if not ov:
            continue
        path = tuple(ov.get("propertyPath") or [])
        result[path] = ov.get("value")
    return result


def instance_of_node(node):
    prefab_id = resolve_id(get(node, "_prefab"))
    info = prefab_infos.get(prefab_id) if prefab_id is not None else None
    if not info:
        return None, {}
    inst_id = resolve_id(get(info, "instance"))
    inst = instances.get(inst_id) if inst_id is not None else None
    if not inst:
        return None, {}
    return inst, override_map(inst)


def node_name(idx):
    n = nodes[idx]
    name = n.get("_name") or ""
    inst, ov = instance_of_node(n)
    if ("_name",) in ov and ov[("_name",)]:
        name = ov[("_name",)]
    return name


def node_pos(idx):
    n = nodes[idx]
    lp = dict(n.get("_lpos") or {})
    inst, ov = instance_of_node(n)
    val = ov.get(("_lpos",))
    if isinstance(val, dict):
        lp.update(val)
    return lp.get("x", 0), lp.get("y", 0), lp.get("z", 0)


def node_euler(idx):
    n = nodes[idx]
    le = dict(n.get("_euler") or {})
    inst, ov = instance_of_node(n)
    val = ov.get(("_euler",))
    if isinstance(val, dict):
        le.update(val)
    return le.get("x", 0), le.get("y", 0), le.get("z", 0)


def node_scale(idx):
    n = nodes[idx]
    ls = dict(n.get("_lscale") or {})
    inst, ov = instance_of_node(n)
    val = ov.get(("_lscale",))
    if isinstance(val, dict):
        ls.update(val)
    return ls.get("x", 1), ls.get("y", 1), ls.get("z", 1)


def fmt(idx):
    x, y, z = node_pos(idx)
    ex, ey, ez = node_euler(idx)
    sx, sy, sz = node_scale(idx)
    return f"pos=({x:.2f},{y:.2f},{z:.2f}) euler=({ex:.0f},{ey:.0f},{ez:.0f}) scale=({sx:.2f},{sy:.2f},{sz:.2f})"


def dump(idx, indent=0, depth=0, max_depth=1):
    print(f"{'  '*indent}{idx} {node_name(idx)!r} {fmt(idx)}")
    if depth >= max_depth:
        return
    for cid in children_ids(nodes[idx]):
        dump(cid, indent + 1, depth + 1, max_depth)


print("=== Level1 children ===")
dump(1, max_depth=0)
print()
print("=== Station children ===")
for i, n in nodes.items():
    if n.get("_name") == "Station":
        dump(i, max_depth=1)
print()
print("=== Wall children ===")
for i, n in nodes.items():
    if n.get("_name") == "Wall":
        dump(i, max_depth=1)
print()
print("=== SeatPoint / Chair / Table / guests / points ===")
for i, n in nodes.items():
    name = node_name(i)
    if not name:
        continue
    if (
        name in ("WaitPoint", "LeavePoint", "SwapnPoint", "Guests", "Player", "SeatPoint", "HoldPoint")
        or name.startswith("Chair")
        or "Table" in name
        or name.startswith("Guest")
        or "Soldier" in name
        or "Mage" in name
        or "Regular" in name
        or "Gourmet" in name
    ):
        parent = resolve_id(n.get("_parent"))
        pname = node_name(parent) if parent in nodes else str(parent)
        print(f"{i} {name!r} {fmt(i)} parent={pname}")
