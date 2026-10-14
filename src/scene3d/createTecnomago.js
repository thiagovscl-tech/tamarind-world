import * as THREE from 'three';

export const HOUSE_S = 1.24;
const rotXZ = (lx, lz, yaw, s) => ({ x: (lx * Math.cos(yaw) + lz * Math.sin(yaw)) * s, z: (-lx * Math.sin(yaw) + lz * Math.cos(yaw)) * s });
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// Escolhe automaticamente a encosta elevada à esquerda, visível da câmera atual, perto da posição de tela da referência.
export function findTecnomagoSite(heightFn, avoid = []) {
  const cam = new THREE.PerspectiveCamera(37, 16 / 9, 0.1, 480);
  cam.position.set(0, 30, 55); cam.lookAt(0, -10, -55); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const v = new THREE.Vector3();
  const visible = (x, y, z) => { for (let s = 1; s <= 30; s += 1) { const t = s / 31; if (heightFn(x * t, 55 + (z - 55) * t) > 30 + (y - 30) * t + 0.4) return false; } return true; };
  const run = (maxSlope, minDrop, minY) => {
    let best = null;
    for (let x = -54; x <= -18; x += 1.5) for (let z = -80; z <= -8; z += 1.5) {
      const y = heightFn(x, z);
      if (y < minY || avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
      let slope = 0; for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) slope = Math.max(slope, Math.abs(heightFn(x + dx, z + dz) - y) / 4);
      if (slope > maxSlope) continue;
      if (y - (heightFn(x, z + 9) + heightFn(x + 4, z + 9) + heightFn(x + 8, z + 6)) / 3 < minDrop || !visible(x, y + 3, z)) continue;
      v.set(x, y + 3.5, z).project(cam);
      const score = (v.x + 0.5) ** 2 + (v.y - 0.3) ** 2 + slope * 0.04;   // o platô achata o local: pesa mais a posição de tela
      if (!best || score < best.score) best = { x, z, y, score, px: (v.x + 1) * 640, py: (1 - v.y) * 360 };
    }
    return best;
  };
  const site = run(1.2, -2, 2);
  if (!site) return null;
  site.yaw = Math.atan2(-site.x, 55 - site.z) * 0.9;   // porta voltada para o vale/câmera
  const door = rotXZ(0.35, 3.7, site.yaw, HOUSE_S), p0 = { x: site.x + door.x, z: site.z + door.z };
  const anchor = { x: -14, z: -22 }, d = new THREE.Vector2(anchor.x - p0.x, anchor.z - p0.z).normalize(), perp = new THREE.Vector2(-d.y, d.x);
  site.path = Array.from({ length: 17 }, (_, i) => { const t = i / 16, w = t > 0.05 ? 1.6 * Math.sin(t * Math.PI * 2.2) : 0; return [p0.x + d.x * 18 * t + perp.x * w, p0.z + d.y * 18 * t + perp.y * w]; });
  return site;
}

const glowTex = (color) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
};

export function createTecnomagoHouse(parent, site, ctx) {
  const { outlinedMaterial: M, addMesh, addOutline, groundAt } = ctx, S = HOUSE_S, OL = '#160f2a', R = mulberry(77);
  const root = new THREE.Group(); root.name = 'TecnomagoHouseArea'; parent.add(root);
  const g = new THREE.Group(); g.name = 'TecnomagoHouse'; g.position.set(site.x, site.y, site.z); g.rotation.y = site.yaw; g.scale.setScalar(S); root.add(g);
  const stone = M('#3d3756'), stoneT = M('#463f60'), plinth = M('#2e2a44'), brown = M('#6a5a78'), wood = M('#2c1b16'), door = M('#3d2417');
  const roofA = M('#2a2548'), roofB = M('#241e3e'), roofC = M('#33305f'), gold = M('#b8943f');
  const glow = new THREE.MeshBasicMaterial({ color: '#c75bff' }), glowHi = new THREE.MeshBasicMaterial({ color: '#f2a6ff' }), warm = new THREE.MeshBasicMaterial({ color: '#ffb45a' });
  const box = (p, n, w, h, d, x, y, z, mat, ol = 1.03) => { const m = addMesh(p, new THREE.BoxGeometry(w, h, d), mat, n, [x, y + h / 2, z]); addOutline(m, OL, ol); return m; };
  const cyl = (p, n, rB, rT, h, x, y, z, mat, seg = 8) => { const m = addMesh(p, new THREE.CylinderGeometry(rT, rB, h, seg), mat, n, [x, y + h / 2, z]); addOutline(m, OL, 1.04); return m; };
  const cone = (p, n, r, h, x, y, z, mat, seg = 8, ry = 0) => { const m = addMesh(p, new THREE.ConeGeometry(r, h, seg), mat, n, [x, y + h / 2, z], undefined, [0, ry, 0]); addOutline(m, OL, 1.05); return m; };
  const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h); s.lineTo(0, h + w * 0.9); s.lineTo(w / 2, h); s.lineTo(w / 2, 0); s.closePath(); return new THREE.ShapeGeometry(s); };
  const win = (p, x, y, z, w, h, ry = 0) => {   // janela alta e estreita, em arco, com luz roxa
    const holder = new THREE.Group(); holder.position.set(x, y, z); holder.rotation.y = ry; p.add(holder);
    const f = new THREE.Mesh(arch(w + 0.16, h + 0.08), wood); f.position.set(0, -0.04, 0); holder.add(f);
    const gl = new THREE.Mesh(arch(w, h), glow); gl.position.z = 0.012; holder.add(gl);
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, h * 0.35), glowHi); hi.position.set(0, h * 0.22, 0.016); holder.add(hi);
    const mu = new THREE.Mesh(new THREE.PlaneGeometry(0.035, h + 0.3), wood); mu.position.set(0, h * 0.5, 0.02); holder.add(mu);
  };
  const roofPair = (p, hw, hr, len, x, y, z, mat, ry = 0) => {
    const sub = new THREE.Group(); sub.position.set(x, y, z); sub.rotation.y = ry; p.add(sub);
    const L = Math.hypot(hw, hr), a = Math.atan2(hr, hw);
    [[-1, 1], [1, -1]].forEach(([s, r]) => { const m = addMesh(sub, new THREE.BoxGeometry(L + 0.25, 0.22, len), mat, 'RoofSlab', [s * hw / 2, hr / 2 + 0.08, 0], undefined, [0, 0, r * a]); addOutline(m, OL, 1.04); });
    [1, -1].forEach((e) => [[-1, 1], [1, -1]].forEach(([s, r]) => addMesh(sub, new THREE.BoxGeometry(L + 0.3, 0.3, 0.07), wood, 'Bargeboard', [s * hw / 2, hr / 2 - 0.04, e * (len / 2 + 0.03)], undefined, [0, 0, r * a])));
    const rg = addMesh(sub, new THREE.BoxGeometry(0.22, 0.22, len + 0.1), wood, 'Ridge', [0, hr + 0.1, 0]); addOutline(rg, OL, 1.05);
  };
  // Base e corpo principal em pedra escura; empena frontal com enxaimel de madeira e telhado muito inclinado (~62°).
  box(g, 'Plinth', 4.8, 0.4, 5.6, 0, 0, 0.1, plinth);
  box(g, 'Hall', 3.9, 3.2, 4.8, 0, 0.4, 0, stone); box(g, 'HallBand', 4.0, 0.16, 4.9, 0, 3.45, 0, wood, 1.02);
  const gs = new THREE.Shape(); gs.moveTo(-2.0, 0); gs.lineTo(2.0, 0); gs.lineTo(0, 3.9); gs.closePath();
  const gw = new THREE.Mesh(new THREE.ShapeGeometry(gs), stoneT); gw.position.set(0, 3.6, 2.41); g.add(gw);
  box(g, 'GablePost', 0.12, 3.4, 0.1, 0, 3.65, 2.46, wood); box(g, 'GableBeam1', 3.4, 0.1, 0.1, 0, 4.3, 2.46, wood, 1.04); box(g, 'GableBeam2', 1.9, 0.1, 0.1, 0, 5.7, 2.46, wood, 1.04);
  roofPair(g, 2.35, 4.4, 5.7, 0, 3.6, 0, roofA);
  [[0, 2.95], [0, -2.95]].forEach(([fx, fz], i) => cone(g, `GableFinial_${i}`, 0.1, 1.1, fx, 8.1, fz, gold, 5));   // pináculos dourados nas empenas
  win(g, -0.8, 3.95, 2.46, 0.38, 1.15); win(g, 0.8, 3.95, 2.46, 0.38, 1.15); win(g, 0, 3.95, 2.46, 0.46, 1.75);   // tríade de lancetas
  const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), glow); roundel.position.set(0, 6.3, 2.47); g.add(roundel);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.27, 0.36, 14), wood); ring.position.set(0, 6.3, 2.465); g.add(ring);
  [-1, 1].forEach((sd, i) => {   // águas-furtadas íngremes nos dois lados do telhado
    const dx = sd * 1.1; box(g, `Dormer_${i}`, 0.75, 0.8, 0.8, dx, 5.4, 0.9, stoneT);
    roofPair(g, 0.52, 0.85, 0.95, dx, 6.2, 0.9, roofB); win(g, dx, 5.5, 1.32, 0.28, 0.55);
  });
  // Torre principal: mais alta e estreita, com faixas de madeira, sineira de lancetas acesas, pináculos de canto e agulha octogonal.
  box(g, 'TowerShaft', 1.06, 6.45, 1.06, -2.05, 0.4, 1.35, stoneT); box(g, 'TowerBand1', 1.18, 0.14, 1.18, -2.05, 3.55, 1.35, wood, 1.02); box(g, 'TowerBand2', 1.18, 0.14, 1.18, -2.05, 6.15, 1.35, wood, 1.02);
  box(g, 'TowerBelfry', 1.36, 0.98, 1.36, -2.05, 6.8, 1.35, stone);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([cx, cz], i) => cone(g, `BelfryPinnacle_${i}`, 0.12, 0.82, -2.05 + cx * 0.68, 7.78, 1.35 + cz * 0.68, roofB, 5));
  cone(g, 'TowerSpire', 1.08, 5.15, -2.05, 7.78, 1.35, roofB, 8, Math.PI / 8); cone(g, 'TowerTip', 0.07, 0.82, -2.05, 12.93, 1.35, gold, 5);
  win(g, -2.05, 1.2, 1.99, 0.23, 1.05); win(g, -2.05, 3.75, 1.99, 0.23, 1.05); win(g, -2.05, 5.15, 1.99, 0.21, 0.82);
  win(g, -2.28, 6.98, 2.04, 0.23, 0.58); win(g, -1.82, 6.98, 2.04, 0.23, 0.58); win(g, -1.46, 6.98, 1.35, 0.23, 0.58, Math.PI / 2);
  // Torreta menor, ala traseira com cumeeira transversal e chaminé de duas bocas.
  cyl(g, 'Turret', 0.7, 0.68, 4.2, 2.5, 0.4, 2.0, stone, 10); cone(g, 'TurretRoof', 0.95, 2.9, 2.5, 4.6, 2.0, roofC, 8); cone(g, 'TurretTip', 0.06, 0.5, 2.5, 7.5, 2.0, gold, 5); win(g, 2.5, 1.5, 2.71, 0.28, 1.1);
  box(g, 'Wing', 2.5, 2.8, 2.5, 2.7, 0.4, -1.3, stone); roofPair(g, 1.6, 2.4, 3.0, 2.7, 3.2, -1.3, roofB, Math.PI / 2); win(g, 2.7, 1.5, -0.03, 0.36, 1.1);
  box(g, 'Chimney', 0.8, 2.3, 0.5, 1.0, 5.6, -1.6, stoneT); box(g, 'ChimneyCap', 1.0, 0.14, 0.7, 1.0, 7.9, -1.6, wood);
  [0.22, -0.22].forEach((o, i) => cyl(g, `Flue_${i}`, 0.13, 0.13, 0.5, 1.0 + o, 8.04, -1.6, stoneT, 6));
  // Entrada gótica: arco ogival, porta de madeira, alpendre em empena sobre contrafortes, degraus e lanternas.
  const frame = new THREE.Mesh(arch(1.4, 1.6), stoneT); frame.position.set(0.35, 0.4, 2.42); g.add(frame);
  const dr = new THREE.Mesh(arch(1.0, 1.45), door); dr.position.set(0.35, 0.4, 2.435); g.add(dr);
  [-0.26, 0.26].forEach((o) => box(g, 'DoorPlank', 0.03, 1.5, 0.03, 0.35 + o, 0.45, 2.45, wood, 1.2));
  [0.85, 1.45].forEach((y) => box(g, 'DoorBand', 0.95, 0.06, 0.03, 0.35, y, 2.45, wood, 1.1));
  [-0.45, 1.15].forEach((x, i) => { box(g, `Buttress_${i}`, 0.3, 2.15, 0.5, x, 0.4, 2.65, stoneT); box(g, `ButtressCap_${i}`, 0.22, 0.3, 0.38, x, 2.55, 2.62, stone); });
  roofPair(g, 0.95, 1.15, 1.1, 0.35, 2.85, 2.95, roofB);
  box(g, 'Step1', 1.9, 0.12, 0.6, 0.35, 0.25, 3.1, brown); box(g, 'Step2', 2.1, 0.1, 0.6, 0.35, 0.12, 3.55, brown);
  [[-0.45, 2.98], [1.15, 2.98]].forEach(([lx, lz], i) => { box(g, `LanternBracket_${i}`, 0.05, 0.05, 0.3, lx, 1.95, lz - 0.1, wood, 1.2); addMesh(g, new THREE.SphereGeometry(0.13, 8, 6), warm, `Lantern_${i}`, [lx, 1.8, lz + 0.05]); });
  // Terreno em volta: rochas na borda do platô, cristais roxos e luz suave.
  const w = (lx, lz) => { const o = rotXZ(lx, lz, site.yaw, S); return { x: site.x + o.x, z: site.z + o.z }; };
  const pathPts = site.path;
  const nearPath = (x, z, r) => pathPts.some(([px, pz]) => Math.hypot(px - x, pz - z) < r);
  const rockMats = [M('#4a3f66'), M('#3a3452'), M('#5a4a78')];
  for (let i = 0; i < 12; i += 1) {
    const a = i < 10 ? site.yaw + Math.PI + (R() - 0.5) * 4.2 : site.yaw + (i % 2 ? 1.3 : -1.3), r = 8 + R() * 3.5, x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r;
    if (nearPath(x, z, 2.0)) continue;
    const s = 0.55 + R() * 0.9, rk = addMesh(root, new THREE.IcosahedronGeometry(s, 0), rockMats[i % 3], `Rock_${i}`, [x, groundAt(x, z) + s * 0.25, z], [1.25, 0.7, 1.05], [R() * 3, R() * 3, R() * 3]);
    addOutline(rk, OL, 1.05);
  }
  const crystalMat = () => M('#8f3fe0', { emissive: '#7a30d8', emissiveIntensity: 1.1 });
  const crystals = (x, z, n) => {
    const y0 = groundAt(x, z);
    for (let i = 0; i < n; i += 1) {
      const h = 0.45 + R() * 0.8, cx = x + (R() - 0.5) * 0.9, cz = z + (R() - 0.5) * 0.9;
      const c = addMesh(root, new THREE.OctahedronGeometry(0.22, 0), crystalMat(), 'Crystal', [cx, groundAt(cx, cz) + h * 0.45, cz], [0.8, h * 2.6, 0.8], [(R() - 0.5) * 0.5, R() * 3, (R() - 0.5) * 0.5]);
      addOutline(c, '#2a0f4a', 1.12);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(190,90,255,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }));
    sp.scale.setScalar(2.4); sp.position.set(x, y0 + 0.7, z); root.add(sp);
  };
  const c1 = w(-4.2, 1.5), c2 = w(5.0, -1.2), c3 = w(-3.3, 4.5); crystals(c1.x, c1.z, 4); crystals(c2.x, c2.z, 3); crystals(c3.x, c3.z, 3);
  const pc = pathPts[9]; crystals(pc[0] + 1.3, pc[1] + 0.4, 3);
  // Caminho estreito até a porta: faixa de terra + lajes + lanternas.
  const pos = [], idx = [], N = pathPts.length;
  pathPts.forEach(([x, z], i) => {
    const [nx, nz] = pathPts[Math.min(N - 1, i + 1)], [bx, bz] = pathPts[Math.max(0, i - 1)], tx = nx - bx, tz = nz - bz, l = Math.hypot(tx, tz) || 1, px = -tz / l * 0.75, pz = tx / l * 0.75;
    [[x + px, z + pz], [x - px, z - pz]].forEach(([qx, qz]) => pos.push(qx, groundAt(qx, qz) + 0.1, qz));
    if (i < N - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  });
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
  const ribbon = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#6b4f66', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); ribbon.name = 'TecnomagoPath'; root.add(ribbon);
  pathPts.forEach(([x, z], i) => {
    if (i % 1 !== 0 || i === 0) return;
    const [nx, nz] = pathPts[Math.min(N - 1, i + 1)], [bx, bz] = pathPts[Math.max(0, i - 1)];
    const slab = addMesh(root, new THREE.BoxGeometry(1.25, 0.14, 0.7), i % 2 ? brown : stoneT, `PathStone_${i}`, [x, groundAt(x, z) + 0.14, z], undefined, [0, Math.atan2(nx - bx, nz - bz) + (R() - 0.5) * 0.2, 0]);
    addOutline(slab, OL, 1.06);
  });
  [3, 8, 13].forEach((i, k) => {
    const [x, z] = pathPts[i], [nx, nz] = pathPts[i + 1], l = Math.hypot(nx - x, nz - z) || 1, lx = x + (-(nz - z) / l) * 1.1, lz = z + ((nx - x) / l) * 1.1, y = groundAt(lx, lz);
    addMesh(root, new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5), wood, `PathLanternPost_${k}`, [lx, y + 0.55, lz]);
    addMesh(root, new THREE.SphereGeometry(0.13, 8, 6), warm, `PathLantern_${k}`, [lx, y + 1.18, lz]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,170,80,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 })); sp.scale.setScalar(1.6); sp.position.set(lx, y + 1.18, lz); root.add(sp);
  });
  // Luz própria discreta: poças de luz roxa/quente no chão + duas luzes pontuais de alcance curto.
  const pool = (px, pz, size, color, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: op, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 })); m.rotation.x = -Math.PI / 2; m.position.set(px, site.y + 0.09, pz); root.add(m); };
  const front = w(0.35, 4.6); pool(front.x, front.z, 8.8, 'rgba(190,90,255,1)', 0.5); pool(site.x, site.z, 13.8, 'rgba(160,70,255,1)', 0.28); pool(front.x, front.z, 4, 'rgba(255,170,80,1)', 0.45);
  const pl = new THREE.PointLight('#b24dff', 26, 14, 2); const pp = w(0.3, 3.4); pl.position.set(pp.x, site.y + 2.6, pp.z); root.add(pl);
  const wl = new THREE.PointLight('#ffb060', 10, 7, 2); const wp = w(0.35, 2.9); wl.position.set(wp.x, site.y + 1.6, wp.z); root.add(wl);
  console.info(`[Tamarind 3D] Casa do Tecnomago em x=${site.x.toFixed(1)} z=${site.z.toFixed(1)} y=${site.y.toFixed(1)} (tela ≈ ${Math.round(site.px)},${Math.round(site.py)} em 1280x720).`);
}
