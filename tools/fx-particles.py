"""Convert Super Auto Pets' battle particle prefabs (BoardView / ParticlesLibrary) for the sandbox site.
Reads the local game install with UnityPy and writes, into the repo:
  js/fx-data.js         the particle systems of the effects the battle screen plays (window.SAP_FX_DATA)
  img/fx/game/*.webp    their textures and sprites (downscaled), plus the StickerFist / StickerHeart / MouthOpen sprites
usage: python fx-particles.py <scratch-dir> <repo-dir> [<exported-sprites-dir>]
docs/game-internals/ANIMATION.md ("Particles") lists which prefab each effect comes from."""
import os, sys, json, math, UnityPy
G = r"C:\Program Files (x86)\Steam\steamapps\common\Super Auto Pets\Super Auto Pets_Data"
OUT = sys.argv[1]; REPO = sys.argv[2]; SPRITES = sys.argv[3] if len(sys.argv) > 3 else None; os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
EFFECTS = {
    'sharedassets2.assets': {'StickerBlast': 1065, 'Smoke': 1098, 'SmokeTrail': 1102, 'CriticalHit': 1124, 'Mana': 1097,
                             'Exp': 1089, 'Level': 1068, 'Swallow': 1067, 'Smash': 1088, 'Explosion': 1114, 'Sound': 1125},
    'sharedassets1.assets': {'Eats': 13289, 'Buff': 13293, 'PermanentBuff': 13270, 'Debuff': 13286, 'Ability': 13294,
                             'SmallBuff': 13284, 'Gas': 13267},
}
textures = {}   # key -> filename
R = lambda v, n=4: round(float(v), n)

def curve(c):
    return [[R(k['time']), R(k['value']), R(k['inSlope']) if math.isfinite(k['inSlope']) else 0,
             R(k['outSlope']) if math.isfinite(k['outSlope']) else 0] for k in c['m_Curve']]

def mmc(m):
    s = m['minMaxState']
    if s == 0: return R(m['scalar'])
    # ParticleSystemCurveMode: 0 Constant, 1 Curve, 2 TwoCurves, 3 TwoConstants
    if s == 3: return {'min': R(m['minScalar']), 'max': R(m['scalar'])}
    if s == 1: return {'k': R(m['scalar']), 'c': curve(m['maxCurve'])}
    return {'k': R(m['scalar']), 'c': curve(m['maxCurve']), 'c2': curve(m['minCurve'])}

def col(c): return [R(c['r'], 3), R(c['g'], 3), R(c['b'], 3), R(c['a'], 3)]

def grad(g):
    n, na = g['m_NumColorKeys'], g['m_NumAlphaKeys']
    cs = [[R(g[f'ctime{i}'] / 65535, 3)] + col(g[f'key{i}'])[:3] for i in range(n)]
    al = [[R(g[f'atime{i}'] / 65535, 3), R(g[f'key{i}']['a'], 3)] for i in range(na)]
    return {'c': cs, 'a': al, 'mode': g.get('m_Mode', 0)}

def mmg(m):
    s = m['minMaxState']
    if s == 0: return col(m['maxColor'])
    if s == 2: return {'min': col(m['minColor']), 'max': col(m['maxColor'])}
    if s == 1: return {'g': grad(m['maxGradient'])}
    if s == 3: return {'g': grad(m['maxGradient']), 'g2': grad(m['minGradient'])}
    return {'rg': grad(m['maxGradient'])}   # 4 = random colour from gradient

def save_tex(tex):
    key = f'{tex.assets_file.name}:{tex.object_reader.path_id}' if hasattr(tex, 'object_reader') else tex.m_Name
    if key in textures: return textures[key]
    name = tex.m_Name
    fn = name + '.webp'
    i = 2
    while fn in textures.values(): fn = f'{name}_{i}.webp'; i += 1
    img = tex.image
    img.save(os.path.join(OUT, 'tex', fn), 'WEBP', lossless=True)
    textures[key] = fn
    return fn

def save_sprite(sp):
    key = f'sprite:{sp.m_Name}:{sp.object_reader.path_id}'
    if key in textures: return textures[key]
    fn = 'sp_' + sp.m_Name + '.webp'
    i = 2
    while fn in textures.values(): fn = f'sp_{sp.m_Name}_{i}.webp'; i += 1
    sp.image.save(os.path.join(OUT, 'tex', fn), 'WEBP', lossless=True)
    textures[key] = fn
    return fn

def comp(go, tname):
    for c in go.m_Component:
        ptr = c.component if hasattr(c, 'component') else c
        try:
            o = ptr.deref()
        except Exception:
            continue
        if o.type.name == tname: return o
    return None

def quat_z_deg(q):
    return R(math.degrees(2 * math.atan2(q.z, q.w)), 2)

def system(go, t):
    pso = comp(go, 'ParticleSystem'); rdo = comp(go, 'ParticleSystemRenderer')
    if pso is None: return None
    p = pso.read_typetree(); rr = rdo.read_typetree() if rdo else None
    rd = rdo.read() if rdo else None
    I, S, E = p['InitialModule'], p['ShapeModule'], p['EmissionModule']
    sysd = {
        'name': go.m_Name, 'pos': [R(t.m_LocalPosition.x), R(t.m_LocalPosition.y), R(t.m_LocalPosition.z)],
        'scale': [R(t.m_LocalScale.x), R(t.m_LocalScale.y), R(t.m_LocalScale.z)],
        'rot': [R(t.m_LocalRotation.x), R(t.m_LocalRotation.y), R(t.m_LocalRotation.z), R(t.m_LocalRotation.w)],
        'duration': R(p['lengthInSec']), 'looping': p['looping'], 'delay': mmc(p['startDelay']),
        'speed': R(p['simulationSpeed']), 'space': p['moveWithTransform'], 'scaling': p['scalingMode'],
        'life': mmc(I['startLifetime']), 'startSpeed': mmc(I['startSpeed']), 'color': mmg(I['startColor']),
        'size': mmc(I['startSize']), 'startRot': mmc(I['startRotation']), 'flipRot': R(I['randomizeRotationDirection']),
        'gravity': mmc(I['gravityModifier']), 'max': I['maxNumParticles'],
    }
    if I['size3D']: sysd['sizeY'] = mmc(I['startSizeY'])
    sysd['shape'] = None
    if S['enabled']:
        sysd['shape'] = {'type': S['type'], 'radius': R(S['radius']['value']), 'thick': R(S['radiusThickness']),
                         'arc': R(S['arc']['value']), 'angle': R(S['angle']), 'pos': [R(S['m_Position']['x']), R(S['m_Position']['y'])],
                         'rot': [R(S['m_Rotation']['x']), R(S['m_Rotation']['y']), R(S['m_Rotation']['z'])],
                         'scale': [R(S['m_Scale']['x']), R(S['m_Scale']['y']), R(S['m_Scale']['z'])],
                         'randDir': R(S['randomDirectionAmount']), 'sphDir': R(S['sphericalDirectionAmount']),
                         'align': S['alignToDirection'], 'arcMode': S['arc']['mode'], 'radiusMode': S['radius']['mode'],
                         'box': [R(S['boxThickness']['x']), R(S['boxThickness']['y'])], 'length': R(S['length'])}
    if E['enabled']:
        sysd['rate'] = mmc(E['rateOverTime']); sysd['rateDist'] = mmc(E['rateOverDistance'])
        sysd['bursts'] = [{'t': R(b['time']), 'n': mmc(b['countCurve']), 'cycles': b['cycleCount'], 'interval': R(b['repeatInterval']),
                           'p': R(b.get('probability', 1))} for b in E['m_Bursts']]
    else:
        sysd['rate'] = 0; sysd['bursts'] = []
    M = lambda k: p[k] if p[k]['enabled'] else None
    if M('SizeModule'): sysd['sizeOL'] = mmc(p['SizeModule']['curve'])
    if M('RotationModule'): sysd['rotOL'] = mmc(p['RotationModule']['curve'])
    if M('ColorModule'): sysd['colorOL'] = mmg(p['ColorModule']['gradient'])
    if M('VelocityModule'):
        V = p['VelocityModule']
        sysd['velOL'] = {'x': mmc(V['x']), 'y': mmc(V['y']), 'orbZ': mmc(V['orbitalZ']), 'radial': mmc(V['radial']),
                         'mod': mmc(V['speedModifier']), 'world': V['inWorldSpace']}
    if M('ForceModule'):
        F = p['ForceModule']; sysd['force'] = {'x': mmc(F['x']), 'y': mmc(F['y']), 'world': F['inWorldSpace']}
    if M('ClampVelocityModule'):
        C = p['ClampVelocityModule']; sysd['limit'] = {'mag': mmc(C['magnitude']), 'dampen': R(C['dampen']), 'drag': mmc(C['drag'])}
    if M('InheritVelocityModule'):
        sysd['inherit'] = {'mode': p['InheritVelocityModule']['m_Mode'], 'k': mmc(p['InheritVelocityModule']['m_Curve'])}
    if M('RotationBySpeedModule'):
        RS = p['RotationBySpeedModule']; sysd['rotBySpeed'] = {'k': mmc(RS['curve']), 'range': [R(RS['range']['x']), R(RS['range']['y'])]}
    if M('NoiseModule'):
        sysd['noise'] = {'strength': mmc(p['NoiseModule']['strength']), 'freq': R(p['NoiseModule']['frequency'])}
    if M('SizeBySpeedModule') or M('ColorBySpeedModule') or M('TrailModule') or M('SubModule') \
            or M('LifetimeByEmitterSpeedModule') or M('CustomDataModule') or M('ExternalForcesModule'):
        sysd['unsupported'] = [k for k in ('SizeBySpeedModule', 'ColorBySpeedModule', 'TrailModule', 'SubModule',
                                           'LifetimeByEmitterSpeedModule', 'CustomDataModule', 'ExternalForcesModule') if M(k)]
    U = p['UVModule']
    tex = None; blend = 'alpha'; tint = [1, 1, 1, 1]
    if rd is not None:
        sysd['render'] = {'mode': rr['m_RenderMode'], 'sort': rr['m_SortingOrder'], 'order': rr.get('m_SortingFudge', 0),
                          'lengthScale': R(rr.get('m_LengthScale', 2)), 'velScale': R(rr.get('m_VelocityScale', 0)),
                          'align': rr.get('m_RenderAlignment', 0), 'maxSize': R(rr.get('m_MaxParticleSize', 0.5)),
                          'pivot': [R(rr['m_Pivot']['x']), R(rr['m_Pivot']['y'])] if 'm_Pivot' in rr else [0, 0],
                          'flip': [R(rr['m_Flip']['x']), R(rr['m_Flip']['y'])] if 'm_Flip' in rr else [0, 0]}
        if rr['m_RenderMode'] == 4:
            try:
                me = rd.m_Mesh.read(); sysd['render']['mesh'] = me.m_Name
            except Exception as e: sysd['render']['mesh'] = '?'
        if rd.m_Materials:
            mat = rd.m_Materials[0].read()
            mn = mat.m_Name
            blend = 'add' if mn.endswith('_ADD') else 'alpha'
            sysd['material'] = mn
            for k, v in mat.m_SavedProperties.m_TexEnvs:
                if k in ('_BaseMap', '_MainTex'):
                    try:
                        tx = v.m_Texture.read(); tex = save_tex(tx); break
                    except Exception: pass
            for k, v in mat.m_SavedProperties.m_Colors:
                if k == '_BaseColor': tint = col({'r': v.r, 'g': v.g, 'b': v.b, 'a': v.a})
    sysd['blend'] = blend; sysd['tint'] = tint; sysd['tex'] = tex
    if U['enabled']:
        uv = {'mode': U['mode'], 'frame': mmc(U['frameOverTime']), 'start': mmc(U['startFrame']), 'cycles': R(U['cycles']),
              'tiles': [U['tilesX'], U['tilesY']], 'anim': U['animationType'], 'row': U['rowIndex'], 'timeMode': U.get('timeMode', 0),
              'fps': R(U.get('fps', 30))}
        if U['mode'] == 1:
            sps = []
            for s in U['sprites']:
                ptr = s['sprite']
                try:
                    o = pso.assets_file  # resolve PPtr manually
                    from UnityPy.classes import PPtr
                except Exception: pass
                sps.append(ptr)
            uv['sprites'] = resolve_sprites(pso, sps)
        sysd['uv'] = uv
    return sysd

def resolve_sprites(pso, ptrs):
    out = []
    af = pso.assets_file
    for ptr in ptrs:
        fid, pid = ptr['m_FileID'], ptr['m_PathID']
        if fid == 0:
            f = af
        else:
            ext = af.externals[fid - 1].path
            f = None
            for env_file in af.parent.files.values() if hasattr(af.parent, 'files') else []:
                pass
            f = load_ext(ext)
        o = f.objects[pid]
        sp = o.read()
        rect = sp.m_Rect
        out.append({'img': save_sprite(sp), 'w': R(rect.width), 'h': R(rect.height), 'ppu': R(sp.m_PixelsToUnits)})
    return out

_ext = {}
def load_ext(path):
    base = os.path.basename(path)
    if base not in _ext:
        _ext[base] = UnityPy.load(os.path.join(G, base)).file
    return _ext[base]

def walk(tobj, out, depth=0):
    t = tobj.read()
    go = t.m_GameObject.read()
    if not go.m_IsActive: return
    s = system(go, t)
    if s: s['depth'] = depth; out.append(s)
    for ch in t.m_Children:
        walk(ch.deref(), out, depth + 1)

fx = {}
used=set(); shapes=set(); modes=set(); aligns=set(); spaces=set()
for fname, effects in EFFECTS.items():
    env = UnityPy.load(os.path.join(G, fname))
    _ext[fname] = env.file
    objs = {o.path_id: o for o in env.objects}
    for name, pid in effects.items():
        go = objs[pid].read().m_GameObject.read()
        tr = comp(go, 'Transform')
        systems = []
        root = tr.read()
        # the root's own transform is where the prefab sits in its parent; the effect is played at the target, so zero it
        walk(tr, systems)
        systems[0]['pos'] = [0, 0, 0]
        fx[name] = {'scale': systems[0]['scale'], 'systems': systems}
        for x in systems: used.update(k for k in ('sizeOL','rotOL','colorOL','velOL','force','limit','noise','inherit','rotBySpeed','uv','unsupported') if k in x); shapes.add((x['shape'] or {}).get('type')); modes.add(x.get('render',{}).get('mode')); aligns.add(x.get('render',{}).get('align')); spaces.add((x['space'], x['scaling']))
        print(name, len(systems), [ (s['name'], s['tex'], s.get('uv', {}).get('mode'), s.get('unsupported')) for s in systems])

json.dump({'source': 'Super Auto Pets build 26131463: BoardView / ParticlesLibrary particle prefabs', 'fx': fx},
          open(os.path.join(OUT, 'fx.json'), 'w'), separators=(',', ':'))
print('textures', len(textures), sorted(textures.values()))

print('modules', used, 'shapes', shapes, 'modes', modes, 'align', aligns, 'space/scaling', spaces)


# ---- copy the effects the battle screen uses into the repo
from PIL import Image
KEEP = ['StickerBlast', 'Smoke', 'SmokeTrail', 'Smash', 'Mana', 'Exp', 'Level', 'Swallow', 'Buff', 'Debuff']
sel = {k: fx[k] for k in KEEP}
dst_dir = os.path.join(REPO, 'img', 'fx', 'game'); os.makedirs(dst_dir, exist_ok=True)
used = set()
for e in sel.values():
    for s_ in e['systems']:
        if s_['tex']: used.add(s_['tex'])
        for sp in (s_.get('uv') or {}).get('sprites', []) or []: used.add(sp['img'])
for f in sorted(used):
    im = Image.open(os.path.join(OUT, 'tex', f)).convert('RGBA')
    w, h = im.size; m = 384 if f.startswith(('cloud', 'explosion')) else 256
    if max(w, h) > m:
        k = m / max(w, h); im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    im.save(os.path.join(dst_dir, f.replace('sp_', '')), 'WEBP', quality=90, method=6)
if SPRITES:
    for n in ['StickerFist', 'StickerHeart', 'MouthOpen']:
        Image.open(os.path.join(SPRITES, n + '.png')).convert('RGBA').save(os.path.join(dst_dir, n + '.webp'), 'WEBP', quality=92, method=6)
for e in sel.values():
    for s_ in e['systems']:
        for sp in (s_.get('uv') or {}).get('sprites', []) or []: sp['img'] = sp['img'].replace('sp_', '')
HEAD = ('/* Battle particle effects from Super Auto Pets (build 26131463): the BoardView and ParticlesLibrary particle prefabs,' + chr(10) +
        ' * converted from the game files by tools/fx-particles.py (docs/game-internals/ANIMATION.md, "Particles"). Units are' + chr(10) +
        ' * Unity units; textures are in img/fx/game/. */' + chr(10))
open(os.path.join(REPO, 'js', 'fx-data.js'), 'w', newline=chr(10)).write(HEAD + 'window.SAP_FX_DATA = ' + json.dumps(sel, separators=(',', ':')) + ';' + chr(10))
print('wrote', len(sel), 'effects,', len(used), 'textures')
