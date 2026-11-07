/* ================= SCENE ================= */
const $ = s => document.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const Scene = (() => {
  const stub = { boardroom(){ return null; }, sync(){}, setCard(){}, react(){}, monthTurn(){}, boards(){}, setView(){}, setPaused(){}, isPaused: false, snapshot(){ return null; } };
  if (!window.THREE) return stub;
  const T = THREE, canvas = $('#c'), stage = $('#stage');
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias:true }); } catch (e) { return stub; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0x0c211d); scene.fog = new T.Fog(0x0c211d, 15, 32);
  const cam = new T.PerspectiveCamera(45, 1, 0.1, 80);
  const target = new T.Vector3(0, 1.0, -1.5);

  const lin = h => new T.Color(h).convertSRGBToLinear();
  const M = (color, o = {}) => { if (o.emissive != null) o.emissive = lin(o.emissive); return new T.MeshStandardMaterial(Object.assign({ roughness:0.8, metalness:0 }, o, { color: lin(color) })); };
  const brass = M(0xc99a3e, { roughness:0.35, metalness:0.55, emissive:0x2a1c05 });
  const steel = M(0x8c9e98, { roughness:0.4, metalness:0.5 });
  const walnut = M(0x3b2a1f, { roughness:0.6 });
  const mesh = (g, m, x = 0, y = 0, z = 0, cast = true) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; scene.add(o); return o; };

  // floor
  const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fx = fc.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++){ fx.fillStyle = (i + j) % 2 ? '#1a3b34' : '#24493f'; fx.fillRect(i * 32, j * 32, 32, 32); }
  fx.strokeStyle = 'rgba(217,171,79,.18)'; fx.lineWidth = 1; for (let i = 0; i <= 8; i++){ fx.beginPath(); fx.moveTo(i * 32, 0); fx.lineTo(i * 32, 256); fx.moveTo(0, i * 32); fx.lineTo(256, i * 32); fx.stroke(); }
  const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(4, 4); ft.encoding = T.sRGBEncoding;
  const floor = mesh(new T.PlaneGeometry(32, 32), M(0xffffff, { map:ft, roughness:0.55 }), 0, 0, 0, false); floor.rotation.x = -Math.PI / 2;
  const rug = mesh(new T.PlaneGeometry(2.4, 9), M(0x5a2430, { roughness:0.95 }), 0, 0.01, 3.2, false); rug.rotation.x = -Math.PI / 2;
  const rugEdge = mesh(new T.PlaneGeometry(2.7, 9.2), brass, 0, 0.005, 3.2, false); rugEdge.rotation.x = -Math.PI / 2;

  // back wall
  const wallMat = M(0x15372f);
  mesh(new T.BoxGeometry(32, 10, 0.4), wallMat, 0, 5, -6.2, false);
  mesh(new T.BoxGeometry(32, 1.3, 0.12), M(0x0e2823), 0, 0.65, -5.95, false);
  mesh(new T.BoxGeometry(32, 0.08, 0.16), brass, 0, 1.32, -5.93, false);
  mesh(new T.BoxGeometry(32, 0.12, 0.2), brass, 0, 6.6, -5.93, false);

  // vault
  const vault = new T.Group(); vault.position.set(0, 2.55, -5.85); scene.add(vault);
  const ring = new T.Mesh(new T.TorusGeometry(2.0, 0.22, 12, 48), brass); vault.add(ring);
  const doorPivot = new T.Group(); doorPivot.position.x = -1.85; vault.add(doorPivot);
  const door = new T.Mesh(new T.CylinderGeometry(1.84, 1.84, 0.34, 48), steel); door.rotation.x = Math.PI / 2; door.position.set(1.85, 0, 0.12); door.castShadow = true; doorPivot.add(door);
  const wheel = new T.Group(); wheel.position.set(1.85, 0, 0.36); doorPivot.add(wheel);
  wheel.add(new T.Mesh(new T.TorusGeometry(0.62, 0.07, 8, 28), brass));
  for (let i = 0; i < 3; i++){ const s = new T.Mesh(new T.BoxGeometry(1.24, 0.08, 0.08), brass); s.rotation.z = i * Math.PI / 3; wheel.add(s); }
  wheel.add(new T.Mesh(new T.CylinderGeometry(0.16, 0.16, 0.14, 16), brass).rotateX(Math.PI / 2));
  for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2; const b = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.1, 10), brass); b.rotation.x = Math.PI / 2; b.position.set(1.85 + Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.3); doorPivot.add(b); }

  // boards (canvas textures)
  function board(w, h, x, y){
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const m = mesh(new T.PlaneGeometry(w, h), M(0xffffff, { map:t, roughness:0.7, emissive:0xffffff, emissiveMap:t, emissiveIntensity:0.35 }), x, y, -5.98, false);
    mesh(new T.BoxGeometry(w + 0.16, h + 0.16, 0.06), brass, x, y, -6.02, false);
    return { c, t, ctx: c.getContext('2d') };
  }
  const bCal = board(2.8, 1.6, -4.7, 3.15), bRate = board(2.8, 1.6, 4.7, 3.15), bSign = board(7.2, 0.9, 0, 5.75);
  function drawBoard(b, top, mid, foot){
    const { ctx, c } = b; ctx.fillStyle = '#0d1f1b'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#d9ab4f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 46px Archivo, Arial Narrow, sans-serif'; ctx.fillText(top, c.width / 2, c.height * 0.2);
    ctx.fillStyle = '#e8efe9'; ctx.font = '600 118px "IBM Plex Mono", monospace'; ctx.fillText(mid, c.width / 2, c.height * 0.55);
    ctx.fillStyle = '#94aea5'; ctx.font = '500 36px "IBM Plex Mono", monospace'; ctx.fillText(foot, c.width / 2, c.height * 0.87);
    b.t.needsUpdate = true;
  }
  function drawSign(){ const { ctx, c } = bSign; ctx.fillStyle = '#0d1f1b'; ctx.fillRect(0, 0, c.width, c.height); ctx.fillStyle = '#d9ab4f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 38px Archivo, Arial Narrow, sans-serif'; const f = S ? sceneFacts() : null, net = f && f.network ? `${f.branches} BRANCH${f.branches === 1 ? '' : 'ES'} · ${f.hubs} HUB${f.hubs === 1 ? '' : 'S'}` : ''; ctx.fillText('C O U N T I N G   H O U S E', c.width / 2, c.height / 2 + (net ? -10 : 2)); if (net){ ctx.fillStyle = '#9fc7b6'; ctx.font = '600 20px Archivo, Arial Narrow, sans-serif'; ctx.fillText(net, c.width / 2, c.height / 2 + 28); } bSign.t.needsUpdate = true; }

  // counter
  mesh(new T.BoxGeometry(11, 1.05, 0.9), walnut, 0, 0.525, -1.75);
  mesh(new T.BoxGeometry(11.3, 0.07, 1.08), M(0x5a3d2a, { roughness:0.45 }), 0, 1.085, -1.75);
  mesh(new T.BoxGeometry(11.3, 0.035, 0.04), brass, 0, 1.12, -1.21); mesh(new T.BoxGeometry(11.3, 0.035, 0.04), brass, 0, 1.12, -2.29);
  for (let x = -4.5; x <= 4.5; x += 1.5) mesh(new T.BoxGeometry(1.2, 0.7, 0.04), M(0x2d2018), x, 0.52, -1.29, false);
  const glass = new T.MeshStandardMaterial({ color:lin(0xa9dccd), transparent:true, opacity:0.13, roughness:0.1, metalness:0.1 });
  for (const x of [-5.4, -1.8, 1.8, 5.4]) mesh(new T.CylinderGeometry(0.045, 0.045, 1.5, 8), brass, x, 1.85, -1.75);
  for (const x of [-3.6, 3.6]) mesh(new T.BoxGeometry(3.5, 1.3, 0.03), glass, x, 1.8, -1.75, false);
  mesh(new T.BoxGeometry(3.5, 0.75, 0.03), glass, 0, 2.2, -1.75, false);
  mesh(new T.BoxGeometry(11, 0.06, 0.12), brass, 0, 2.6, -1.75);
  // monitor + beacon
  mesh(new T.BoxGeometry(0.62, 0.42, 0.05), M(0x111a18), 1.1, 1.42, -1.95);
  const screenMat = M(0x1d3a33, { emissive:0x1f4a40, emissiveIntensity:0.6 });
  mesh(new T.PlaneGeometry(0.54, 0.34), screenMat, 1.1, 1.42, -1.92, false);
  const beaconMat = M(0x5a1a14, { emissive:0xff3a2a, emissiveIntensity:0 });
  mesh(new T.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), beaconMat, -1.1, 1.13, -1.95);
  const alarm = new T.PointLight(0xff3a2a, 0, 7); alarm.position.set(-1.1, 1.6, -1.4); scene.add(alarm);

  // columns
  for (const x of [-8.6, 8.6]) for (const z of [-4.6, 1.2]){ mesh(new T.CylinderGeometry(0.42, 0.42, 7, 20), M(0x234a41), x, 3.5, z); mesh(new T.CylinderGeometry(0.52, 0.52, 0.25, 20), brass, x, 0.12, z); mesh(new T.CylinderGeometry(0.52, 0.52, 0.25, 20), brass, x, 6.9, z); }

  // lamps
  for (const x of [-7.4, 7.4]){
    mesh(new T.BoxGeometry(0.5, 0.12, 0.2), brass, x * 0.62, 4.45, -5.9, false);
    mesh(new T.SphereGeometry(0.16, 12, 8), M(0xfff1d0, { emissive:0xffd890, emissiveIntensity:1.6 }), x * 0.62, 4.62, -5.8, false);
  }

  // tables
  mesh(new T.BoxGeometry(3.2, 0.9, 2.2), walnut, 5.95, 0.45, -2.75);
  mesh(new T.BoxGeometry(3.3, 0.06, 2.3), brass, 5.95, 0.92, -2.75);
  mesh(new T.BoxGeometry(3.8, 0.85, 3.6), walnut, -6.1, 0.425, -2.1);
  mesh(new T.BoxGeometry(3.7, 0.05, 3.5), M(0x2f6b4a, { roughness:1 }), -6.1, 0.875, -2.1, false);

  // lights
  const hemi = new T.HemisphereLight(0xd8f0e6, 0x0a1714, 0.85); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffe4bd, 1.15); sun.position.set(4, 11, 7); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left:-11, right:11, top:11, bottom:-11, near:1, far:30 }); scene.add(sun);
  const warm = new T.PointLight(0xffc27a, 0.6, 16); warm.position.set(0, 4, -0.8); scene.add(warm);
  const flash = new T.PointLight(0xff4a3a, 0, 6); flash.position.set(5.9, 2.2, -2.4); scene.add(flash);
  const faceLight = new T.SpotLight(0xffe2b8, 1.6, 7, 0.6, 0.75, 1.1); faceLight.position.set(0, 3.0, -1.7); faceLight.target.position.set(0, 1.55, -0.6); scene.add(faceLight, faceLight.target);

  // front of the hall (only seen through the teller window)
  const front = new T.Group(); front.visible = false; scene.add(front);
  const fmesh = (g, m, x, y, z, cast) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = !!cast; o.receiveShadow = true; front.add(o); return o; };
  fmesh(new T.BoxGeometry(26, 9, 0.3), wallMat, 0, 4.5, 7.85);
  fmesh(new T.BoxGeometry(26, 1.1, 0.1), M(0x0e2823), 0, 0.55, 7.66);
  fmesh(new T.BoxGeometry(26, 0.07, 0.12), brass, 0, 1.12, 7.65);
  fmesh(new T.BoxGeometry(26, 0.12, 0.14), brass, 0, 5.3, 7.64);
  // windows (canvas: sky, street and a tree that follows the seasons)
  const wc = document.createElement('canvas'); wc.width = 256; wc.height = 512; const wx = wc.getContext('2d');
  const wtex = new T.CanvasTexture(wc); wtex.encoding = T.sRGBEncoding;
  const winMat = new T.MeshBasicMaterial({ map:wtex, transparent:true, alphaTest:0.5, toneMapped:false });
  const WINS = [-3.6, 3.8, -6.9, 6.9];
  for (const x of WINS){ const w = fmesh(new T.PlaneGeometry(1.8, 3.6), winMat, x, 2.95, 7.69); w.rotation.y = Math.PI; fmesh(new T.BoxGeometry(2.0, 0.08, 0.22), brass, x, 1.13, 7.6); }
  const outside = new T.PointLight(0xdfeeff, 0.45, 9); outside.position.set(0, 2.8, 6.8); front.add(outside);
  function drawWindow(tick){
    const c = wx, W = 256, H = 512, m = S ? S.month : 0, wthr = S ? sceneFacts().weather : 'clear';
    const SK0 = [['#9fb4c6','#dfe6ea'],['#a7bccc','#e4eaec'],['#8ec5e8','#e6f2e0'],['#86c2ec','#eef4dc'],['#7dbcef','#f3f0d0'],['#6fb6ee','#fbe9c0'],['#6db3ee','#fde6b8'],['#78b6ea','#f9e2b6'],['#97b9d2','#f4dcb0'],['#a3b6c6','#f0d2a8'],['#9db0c0','#e2d9cc'],['#93a9bc','#dbe2e7']][m];
    const SK = wthr === 'rain' ? ['#6c7a86','#aab4ba'] : wthr === 'snow' ? ['#a9b6c2','#e6ebef'] : wthr === 'cloud' ? [SK0[0].replace(/^#(..)(..)(..)$/, (_, a, b, d) => '#' + [a, b, d].map(x => Math.round(parseInt(x, 16) * 0.82 + 20).toString(16).padStart(2, '0')).join('')), SK0[1]] : SK0;
    c.clearRect(0, 0, W, H);
    c.save(); c.beginPath(); c.moveTo(12, H - 8); c.lineTo(12, 128); c.arc(W / 2, 128, W / 2 - 12, Math.PI, 0); c.lineTo(W - 12, H - 8); c.closePath(); c.clip();
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, SK[0]); gr.addColorStop(1, SK[1]); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(70,80,90,.55)'; [[0,250,70],[60,215,60],[110,265,80],[178,230,90]].forEach(([x, y, w]) => c.fillRect(x, y, w, H - y));
    c.fillStyle = 'rgba(255,240,200,.5)'; for (let i = 0; i < 14; i++) c.fillRect(8 + (i * 37) % 230, 280 + (i * 53) % 150, 9, 13);
    const leaf = [ null, null, '#9fcf7a', '#7fbf5a', '#5fa846', '#4f9a3c', '#4b9238', '#5a9a3a', '#c99a3e', '#c4692e', '#a5562c', null ][m];
    c.strokeStyle = '#3a2a1e'; c.lineWidth = 9; c.beginPath(); c.moveTo(150, H); c.lineTo(150, 300); c.moveTo(150, 340); c.lineTo(110, 270); c.moveTo(150, 320); c.lineTo(195, 255); c.stroke();
    if (leaf){ c.fillStyle = leaf; [[150,250,70],[105,265,45],[198,255,50],[150,205,48]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }); }
    c.fillStyle = 'rgba(40,46,44,.85)'; c.fillRect(0, H - 50, W, 50);
    if (wthr !== 'clear'){ c.fillStyle = wthr === 'rain' ? 'rgba(88,98,108,.9)' : 'rgba(245,247,250,.88)'; [[40,70,46],[110,52,58],[176,78,44],[220,60,36]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, r * 1.5, r * 0.62, 0, 0, 7); c.fill(); }); }
    if (wthr === 'rain'){ c.strokeStyle = 'rgba(205,225,240,.75)'; c.lineWidth = 2; const o = (tick || 0) * 0.45; c.beginPath(); for (let i = 0; i < 46; i++){ const x = (i * 29) % W, y = ((i * 71) + o) % H; c.moveTo(x, y); c.lineTo(x - 5, y + 24); } c.stroke(); }
    if (wthr === 'snow'){ c.fillStyle = 'rgba(255,255,255,.95)'; const o = (tick || 0) * 0.05; for (let i = 0; i < 40; i++){ const x = ((i * 47) + Math.sin(o * 0.05 + i) * 10 + W) % W, y = ((i * 83) + o * (1 + (i % 3) * 0.4)) % H; c.beginPath(); c.arc(x, y, 2 + (i % 3), 0, 7); c.fill(); } }
    c.restore();
    c.strokeStyle = '#c99a3e'; c.lineWidth = 12; c.beginPath(); c.moveTo(12, H - 8); c.lineTo(12, 128); c.arc(W / 2, 128, W / 2 - 12, Math.PI, 0); c.lineTo(W - 12, H - 8); c.closePath(); c.stroke();
    c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2, 20); c.lineTo(W / 2, H - 8); c.moveTo(12, 300); c.lineTo(W - 12, 300); c.moveTo(12, 128); c.lineTo(W - 12, 128); c.stroke();
    wtex.needsUpdate = true;
    const sky = new T.Color(SK[1]); outside.color.copy(sky);
  }
  // entrance door
  const DX = 1.9;
  const doorOut = fmesh(new T.PlaneGeometry(1.5, 2.7), new T.MeshBasicMaterial({ map:wtex, toneMapped:false }), DX, 1.35, 7.69); doorOut.rotation.y = Math.PI;
  const doorGlass = new T.MeshStandardMaterial({ color:lin(0xa9dccd), transparent:true, opacity:0.18, roughness:0.1, metalness:0.2 });
  fmesh(new T.BoxGeometry(1.5, 2.7, 0.03), doorGlass, DX, 1.35, 7.62);
  for (const x of [-0.78, 0, 0.78]) fmesh(new T.BoxGeometry(0.07, 2.8, 0.08), brass, DX + x, 1.4, 7.6);
  fmesh(new T.BoxGeometry(1.64, 0.1, 0.1), brass, DX, 2.78, 7.6);
  for (const x of [-0.12, 0.12]) fmesh(new T.CylinderGeometry(0.018, 0.018, 0.5, 8), brass, DX + x, 1.15, 7.55);
  // clock
  const clock = new T.Group(); clock.position.set(0, 4.45, 7.62); clock.rotation.y = Math.PI; front.add(clock);
  const cf = new T.Mesh(new T.CylinderGeometry(0.48, 0.48, 0.06, 40), M(0xf3efe2, { roughness:0.6 })); cf.rotation.x = Math.PI / 2; clock.add(cf);
  const cr = new T.Mesh(new T.TorusGeometry(0.5, 0.045, 8, 40), brass); clock.add(cr);
  for (let i = 0; i < 12; i++){ const tk = new T.Mesh(new T.BoxGeometry(0.02, i % 3 ? 0.05 : 0.09, 0.01), M(0x1c1410)); const a = i / 12 * Math.PI * 2; tk.position.set(Math.sin(a) * 0.4, Math.cos(a) * 0.4, 0.04); tk.rotation.z = -a; clock.add(tk); }
  const minute = new T.Group(), hour = new T.Group(); minute.position.z = hour.position.z = 0.05; clock.add(minute, hour);
  const mh = new T.Mesh(new T.BoxGeometry(0.02, 0.34, 0.01), M(0x1c1410)); mh.position.y = 0.15; minute.add(mh);
  const hh = new T.Mesh(new T.BoxGeometry(0.035, 0.22, 0.01), M(0x1c1410)); hh.position.y = 0.09; hour.add(hh);
  // posters with live rates
  function poster(w, h, x, y){
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const pm = fmesh(new T.PlaneGeometry(w, h), M(0xffffff, { map:t, roughness:0.8 }), x, y, 7.68); pm.rotation.y = Math.PI;
    fmesh(new T.BoxGeometry(w + 0.1, h + 0.1, 0.04), brass, x, y, 7.7);
    return { c, t, ctx:c.getContext('2d') };
  }
  const pSave = poster(1.0, 1.4, -1.75, 2.35), pFix = poster(1.0, 1.4, 5.35, 2.35), pScam = poster(1.1, 1.4, 0, 2.3);
  function wrapText(c, text, x, y, maxW, lh){ const words = text.split(' '); let line = ''; for (const w of words){ const tst = line ? line + ' ' + w : w; if (c.measureText(tst).width > maxW && line){ c.fillText(line, x, y); line = w; y += lh; } else line = tst; } c.fillText(line, x, y); }
  function drawPoster(p, bg, fg, acc, kicker, big, small){
    const c = p.ctx, W = p.c.width, H = p.c.height;
    c.fillStyle = bg; c.fillRect(0, 0, W, H); c.fillStyle = acc; c.fillRect(0, 0, W, 14); c.fillRect(0, H - 14, W, 14);
    c.textAlign = 'center'; c.fillStyle = acc; c.font = '800 21px Archivo, Arial Narrow, sans-serif'; wrapText(c, kicker, W / 2, 56, W - 30, 24);
    c.fillStyle = fg; c.font = big.length > 6 ? '800 40px Archivo, Arial Narrow, sans-serif' : '700 74px "IBM Plex Mono", monospace'; wrapText(c, big, W / 2, H * 0.52, W - 24, 44);
    c.fillStyle = fg; c.globalAlpha = 0.75; c.font = '600 17px Archivo, Arial Narrow, sans-serif'; wrapText(c, small, W / 2, H - 58, W - 30, 20); c.globalAlpha = 1;
    p.t.needsUpdate = true;
  }
  function drawPosters(){
    if (!S) return;
    drawPoster(pSave, '#12302a', '#e8efe9', '#d9ab4f', 'EASY-ACCESS SAVER', S.savRate.toFixed(2) + '%', `Inflation ${inflation().toFixed(1)}%. Real return ${(S.savRate - inflation() >= 0 ? '+' : '')}${(S.savRate - inflation()).toFixed(1)}% a year.`);
    drawPoster(pFix, '#e8efe9', '#17231e', '#3b62a8', '2-YEAR FIXED MORTGAGE', mRate(60).toFixed(2) + '%', 'At 60% loan to value. Your home may be repossessed if you do not keep up repayments.');
    drawPoster(pScam, '#c4453a', '#ffffff', '#ffffff', 'STOP. CHALLENGE. PROTECT.', 'We will never ask you to move money', 'If someone tells you to, it is a scam.');
  }
  // plants and rope stanchions
  const pot = M(0xa5562c, { roughness:0.9 }), leafM = M(0x2f6b3a, { roughness:0.9 });
  for (const x of [-5.3, 3.0, 8.4]){ fmesh(new T.CylinderGeometry(0.24, 0.18, 0.5, 14), pot, x, 0.25, 7.2, true); for (let i = 0; i < 5; i++){ const l = fmesh(new T.SphereGeometry(0.24 - i * 0.02, 10, 8), leafM, x + Math.sin(i * 2.4) * 0.15, 0.7 + i * 0.22, 7.2 + Math.cos(i * 2.4) * 0.12, true); l.scale.y = 1.3; } }
  const rope = M(0x7a1f2f, { roughness:0.9 });
  for (const sx of [-1, 1]){ let prev = null; for (let z = 0.0; z <= 5.5; z += 1.37){ const x = sx * 0.98; mesh(new T.CylinderGeometry(0.025, 0.025, 0.92, 8), brass, x, 0.46, z); mesh(new T.CylinderGeometry(0.13, 0.15, 0.04, 16), brass, x, 0.02, z); mesh(new T.SphereGeometry(0.045, 10, 8), brass, x, 0.94, z); if (prev != null){ const r = mesh(new T.CylinderGeometry(0.02, 0.02, 1.37, 6), rope, x, 0.84, (z + prev) / 2, false); r.rotation.x = Math.PI / 2; } prev = z; } }

  // coins & gilts
  const COINS = 288, coinG = new T.CylinderGeometry(0.14, 0.14, 0.05, 14);
  const coins = new T.InstancedMesh(coinG, M(0xd9a83e, { roughness:0.3, metalness:0.6, emissive:0x3a2604 }), COINS);
  coins.castShadow = true; scene.add(coins);
  const dm = new T.Object3D();
  for (let i = 0; i < COINS; i++){ const s = i % 24, lvl = Math.floor(i / 24); const cx = s % 6, cz = Math.floor(s / 6);
    dm.position.set(4.85 + cx * 0.34, 0.97 + lvl * 0.052, -3.45 + cz * 0.4); dm.rotation.y = (i * 1.7) % 6; dm.updateMatrix(); coins.setMatrixAt(i, dm.matrix); }
  coins.instanceMatrix.needsUpdate = true;
  const GMAX = 36, gilts = new T.InstancedMesh(new T.BoxGeometry(0.48, 0.1, 0.32), M(0xd8dccb, { roughness:0.9 }), GMAX); gilts.castShadow = true; scene.add(gilts);
  for (let i = 0; i < GMAX; i++){ const s = i % 4, lvl = Math.floor(i / 4); dm.position.set(5.35 + (s % 2) * 0.55, 0.99 + lvl * 0.105, -1.95 + Math.floor(s / 2) * 0.4); dm.rotation.y = (i % 3 - 1) * 0.06; dm.updateMatrix(); gilts.setMatrixAt(i, dm.matrix); }
  gilts.instanceMatrix.needsUpdate = true;

  // loan town
  const slots = []; for (let r = 0; r < 7; r++) for (let c = 0; c < 8; c++) slots.push({ x: -7.62 + c * 0.44, z: -3.6 + r * 0.5, used:null });
  const town = new Map();
  const houseWall = M(0xe8e1cf), legacyWall = M(0x9fb0a8), shopWall = M(0xcfd9e6), roofG = new T.ConeGeometry(0.26, 0.2, 4), wallG = new T.BoxGeometry(0.32, 0.24, 0.32);
  const roofs = { current: M(0x8a3b2e), plan: M(0xd99b2b), arrears: M(0xe0352a), legacy: M(0x5d6e68) };
  function makeBuilding(kind, status){
    const g = new T.Group();
    if (kind === 'mortgage' || kind === 'legacy'){
      const w = new T.Mesh(wallG, kind === 'legacy' ? legacyWall : houseWall); w.position.y = 0.12; w.castShadow = true; g.add(w);
      const r = new T.Mesh(roofG, kind === 'legacy' ? roofs.legacy : roofs[status] || roofs.current); r.position.y = 0.34; r.rotation.y = Math.PI / 4; r.castShadow = true; g.add(r); g.userData.roof = r;
    } else if (kind === 'business'){
      const w = new T.Mesh(new T.BoxGeometry(0.42, 0.3, 0.34), shopWall); w.position.y = 0.15; w.castShadow = true; g.add(w);
      const a = new T.Mesh(new T.BoxGeometry(0.44, 0.04, 0.12), roofs[status] || roofs.current); a.position.set(0, 0.22, 0.2); g.add(a); g.userData.roof = a;
    } else {
      const b = new T.Mesh(new T.BoxGeometry(0.34, 0.1, 0.18), M([0x3b62a8, 0x2c8a5a, 0xd9ab4f, 0xb84a5a][Math.floor(Math.random() * 4)])); b.position.y = 0.08; b.castShadow = true; g.add(b);
      const t = new T.Mesh(new T.BoxGeometry(0.18, 0.08, 0.16), M(0x223)); t.position.set(-0.02, 0.17, 0); g.add(t);
      g.userData.roof = b;
    }
    g.userData.kind = kind;
    return g;
  }
  const dying = [];

  // people: jointed low-poly figures with faces
  const people = new Map(); const leaving = [];
  const CLOTHES = [0x3b62a8, 0xb84a5a, 0x2c8a5a, 0xd9ab4f, 0x6a4fa0, 0x2f7f8f, 0x8a5a3b, 0xc9c2b0, 0x444f63, 0xb86b3a, 0x7a2f3f, 0x55705a];
  const SKIN = [0xf1c9a5, 0xd8a47f, 0xb07a52, 0x8a5a3c, 0x5c3b28, 0xe6b98f];
  const TROUSERS = [0x2a2f3a, 0x3b3328, 0x1e2a2a, 0x4a4f5c, 0x2b2b2b, 0x5b4a3a, 0x33415e];
  const HAIR_Y = [0x1a120c, 0x3b2a1a, 0x6e4f2e, 0x111111, 0x8a4a22, 0xc9a46a], HAIR_O = [0xb9b2a5, 0xdcd8d0, 0x8e8a84];
  const SCARF = [0xb84a5a, 0x2f7f8f, 0xd9ab4f, 0x6a4fa0, 0x2c8a5a];
  const MC = new Map(); const mat = (hex, rough = 0.75) => { const k = hex + ':' + rough; let m = MC.get(k); if (!m){ m = M(hex, { roughness:rough }); MC.set(k, m); } return m; };
  const G = {
    shoe: new T.BoxGeometry(0.11, 0.07, 0.25), leg: new T.CylinderGeometry(0.075, 0.065, 0.8, 10),
    torso: new T.LatheGeometry([[0,0.84],[0.16,0.85],[0.185,0.93],[0.17,1.06],[0.185,1.24],[0.2,1.34],[0.16,1.43],[0.06,1.47],[0,1.47]].map(([r, y]) => new T.Vector2(r, y)), 18),
    arm: new T.CylinderGeometry(0.055, 0.045, 0.58, 8), hand: new T.SphereGeometry(0.05, 10, 8), neck: new T.CylinderGeometry(0.05, 0.055, 0.12, 10),
    head: new T.SphereGeometry(0.14, 24, 18), ear: new T.SphereGeometry(0.032, 8, 6), nose: new T.SphereGeometry(0.026, 10, 8),
    eyeW: new T.SphereGeometry(0.027, 10, 8), pupil: new T.SphereGeometry(0.015, 8, 6), brow: new T.BoxGeometry(0.058, 0.014, 0.012),
    mouthN: new T.BoxGeometry(0.06, 0.011, 0.01), mouthC: new T.TorusGeometry(0.032, 0.007, 6, 12, Math.PI),
    capShort: new T.SphereGeometry(0.149, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), capFull: new T.SphereGeometry(0.153, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    sides: new T.SphereGeometry(0.147, 20, 8, Math.PI * 0.85, Math.PI * 1.3, Math.PI * 0.36, Math.PI * 0.22),
    longBack: new T.BoxGeometry(0.27, 0.34, 0.09), bun: new T.SphereGeometry(0.062, 12, 10), curl: new T.SphereGeometry(0.052, 8, 6),
    lens: new T.TorusGeometry(0.031, 0.005, 6, 18), bridge: new T.BoxGeometry(0.03, 0.006, 0.006),
    shirt: new T.BoxGeometry(0.1, 0.17, 0.01), tie: new T.BoxGeometry(0.036, 0.24, 0.012), scarf: new T.TorusGeometry(0.075, 0.035, 8, 16), badge: new T.BoxGeometry(0.06, 0.035, 0.01),
  };
  function makePerson(o){
    const h = o.hue != null ? o.hue : Math.random(), age = o.age || 38, staff = !!o.staff;
    let sd = Math.floor(h * 1e6) % 2147483646 + 1; const rnd = () => (sd = sd * 16807 % 2147483647) / 2147483647;
    const pk = a => a[Math.floor(rnd() * a.length)];
    const skinHex = SKIN[Math.floor(h * 131) % SKIN.length], skin = mat(skinHex, 0.6);
    const top = mat(staff ? 0x22324f : CLOTHES[Math.floor(h * 997) % CLOTHES.length]), legs = mat(staff ? 0x1b2433 : pk(TROUSERS)), shoeM = mat(0x1a1410, 0.5);
    const grey = age > 62 || (age > 48 && rnd() < 0.35), hairHex = grey ? pk(HAIR_O) : pk(HAIR_Y), hair = mat(hairHex, 0.85);
    const g = new T.Group(), body = new T.Group(); g.add(body);
    const legP = [];
    for (const sx of [-0.095, 0.095]){ const p = new T.Group(); p.position.set(sx, 0.86, 0); const l = new T.Mesh(G.leg, legs); l.position.y = -0.41; l.castShadow = true; p.add(l); const sh = new T.Mesh(G.shoe, shoeM); sh.position.set(0, -0.82, 0.04); sh.castShadow = true; p.add(sh); body.add(p); legP.push(p); }
    const torso = new T.Mesh(G.torso, top); torso.scale.z = 0.72; torso.castShadow = true; body.add(torso);
    const armP = [];
    for (const sx of [-1, 1]){ const p = new T.Group(); p.position.set(sx * 0.215, 1.38, 0); p.rotation.z = sx * 0.1; const a = new T.Mesh(G.arm, top); a.position.y = -0.29; a.castShadow = true; p.add(a); const hd = new T.Mesh(G.hand, skin); hd.position.y = -0.6; p.add(hd); body.add(p); armP.push(p); }
    const neck = new T.Mesh(G.neck, skin); neck.position.y = 1.5; body.add(neck);
    const head = new T.Group(); head.position.y = 1.66; body.add(head);
    const hs = new T.Mesh(G.head, skin); hs.scale.set(0.95, 1.08, 1); hs.castShadow = true; head.add(hs);
    for (const sx of [-1, 1]){ const e = new T.Mesh(G.ear, skin); e.position.set(sx * 0.133, 0, -0.005); e.scale.set(0.6, 1, 0.8); head.add(e); }
    const nose = new T.Mesh(G.nose, mat(skinHex, 0.5)); nose.position.set(0, -0.012, 0.142); nose.scale.set(0.9, 1, 1.25); head.add(nose);
    const eyes = new T.Group(); eyes.position.y = 0.022; head.add(eyes);
    for (const sx of [-1, 1]){ const w = new T.Mesh(G.eyeW, mat(0xf6f3ec, 0.3)); w.position.set(sx * 0.049, 0, 0.122); w.scale.z = 0.6; eyes.add(w); const pu = new T.Mesh(G.pupil, mat(0x1c1410, 0.3)); pu.position.set(sx * 0.049, -0.002, 0.139); eyes.add(pu); }
    const browM = mat(grey ? 0x8e8a84 : hairHex === 0xc9a46a ? 0x8a6a3a : 0x2a1d14);
    const brows = [-1, 1].map(sx => { const b = new T.Mesh(G.brow, browM); b.position.set(sx * 0.05, 0.068, 0.13); head.add(b); return b; });
    const lip = mat(0x6e2f2a, 0.5);
    const mN = new T.Mesh(G.mouthN, lip); mN.position.set(0, -0.064, 0.128); head.add(mN);
    const mS = new T.Mesh(G.mouthC, lip); mS.rotation.z = Math.PI; mS.scale.y = 0.6; mS.position.set(0, -0.045, 0.126); head.add(mS);
    const mF = new T.Mesh(G.mouthC, lip); mF.scale.y = 0.55; mF.position.set(0, -0.083, 0.124); head.add(mF);
    // hair
    let style = pk(['short', 'short', 'crop', 'long', 'long', 'bun', 'curly', 'bald']);
    if (age > 58 && rnd() < 0.35) style = 'bald';
    if (staff) style = h > 9.5 ? 'bun' : 'short';
    const cap = geo => { const c = new T.Mesh(geo, hair); c.rotation.x = -0.38; c.position.set(0, 0.005, -0.008); c.castShadow = true; head.add(c); return c; };
    if (style === 'short' || style === 'crop') cap(G.capShort);
    if (style === 'long'){ cap(G.capFull); const b = new T.Mesh(G.longBack, hair); b.position.set(0, -0.11, -0.085); head.add(b); }
    if (style === 'bun'){ cap(G.capShort); const b = new T.Mesh(G.bun, hair); b.position.set(0, 0.1, -0.12); head.add(b); }
    if (style === 'curly'){ cap(G.capFull).scale.setScalar(1.06); for (let i = 0; i < 9; i++){ const a = i / 9 * Math.PI * 2; const c = new T.Mesh(G.curl, hair); c.position.set(Math.cos(a) * 0.13, 0.07 + Math.sin(i * 2.1) * 0.02, Math.sin(a) * 0.12 - 0.02); head.add(c); } }
    if (style === 'bald'){ const s = new T.Mesh(G.sides, hair); head.add(s); }
    if (rnd() < (age > 50 ? 0.5 : 0.18)){ const fm = mat(pk([0x1a1410, 0x6b4a2a, 0x9a9a9a]), 0.4); for (const sx of [-1, 1]){ const l = new T.Mesh(G.lens, fm); l.position.set(sx * 0.049, 0.022, 0.15); head.add(l); } const br = new T.Mesh(G.bridge, fm); br.position.set(0, 0.026, 0.152); head.add(br); }
    // clothing details
    if (staff || rnd() < 0.3){ const sh = new T.Mesh(G.shirt, mat(0xf2f0ea)); sh.position.set(0, 1.35, 0.135); body.add(sh); const tie = new T.Mesh(G.tie, mat(staff ? 0xc99a3e : pk([0x7a2f3f, 0x22324f, 0x2c5a3a]), 0.5)); tie.position.set(0, 1.25, 0.142); body.add(tie); }
    if (staff){ const bd = new T.Mesh(G.badge, brass); bd.position.set(0.1, 1.32, 0.14); body.add(bd); }
    if (o.winter && !staff && rnd() < 0.55){ const sc = new T.Mesh(G.scarf, mat(pk(SCARF), 0.95)); sc.rotation.x = Math.PI / 2; sc.position.y = 1.47; sc.scale.set(1.1, 1, 1); body.add(sc); }
    if (age > 68) body.rotation.x = 0.07;
    g.scale.setScalar(staff ? 1.0 : 1.04);
    g.userData = { t: new T.Vector3(), via:null, phase: rnd() * 6, speed: 2.4, legP, armP, head, eyes, brows, mouth:{ n:mN, s:mS, f:mF }, blink: 1 + rnd() * 4, look: 0, lookT: rnd() * 3, wait: 0, waitMax: 1, react: null, front:false };
    setFace(g, 'neutral');
    scene.add(g); return g;
  }
  function setFace(p, f){
    const u = p.userData; u.face = f;
    u.mouth.n.visible = f === 'neutral' || f === 'worried'; u.mouth.s.visible = f === 'smile'; u.mouth.f.visible = f === 'frown';
    const a = f === 'frown' ? 0.38 : f === 'worried' ? -0.32 : f === 'smile' ? -0.1 : 0;
    u.brows[0].rotation.z = -a; u.brows[1].rotation.z = a;
    u.brows[0].position.y = u.brows[1].position.y = 0.068 + (f === 'smile' ? 0.01 : f === 'worried' ? 0.01 : f === 'frown' ? -0.006 : 0);
  }
  const tellers = []; for (const x of [-3.6, 0, 3.6]){ const p = makePerson({ hue: (x + 9) / 10 + 0.013, staff:true, age:40 }); p.position.set(x, 0, -2.55); p.rotation.y = 0; tellers.push(p); }
  // staff that come with upgrades: a credit analyst at a side desk, and a greeter inside the door once the branch is refurbished
  const analystP = makePerson({ hue:0.37, staff:true, age:34 }); analystP.position.set(-6.1, 0, 1.1); analystP.rotation.y = 0.35; analystP.visible = false;
  const greeterP = makePerson({ hue:0.71, staff:true, age:29 }); greeterP.position.set(-2.1, 0, 5.4); greeterP.rotation.y = -0.45; greeterP.visible = false;
  const anDesk = mesh(new T.BoxGeometry(1.5, 0.78, 0.7), walnut, -6.1, 0.39, 1.75); anDesk.visible = false;
  const anScreen = mesh(new T.BoxGeometry(0.5, 0.34, 0.04), screenMat, -6.1, 1.0, 1.9); anScreen.visible = false;
  // app: a phone stand on the counter and a QR sign
  const appStand = mesh(new T.BoxGeometry(0.34, 0.5, 0.05), M(0x111a18), 5.2, 1.4, -1.6); appStand.visible = false;
  const appFace = mesh(new T.PlaneGeometry(0.28, 0.42), M(0xffffff, { emissive:0x2a8a6a, emissiveIntensity:0.9 }), 5.2, 1.4, -1.57); appFace.visible = false;
  // Card ids restart at 1 in every game, so a person is identified by the card and who it describes, not the id alone.
  const pkey = c => c.id + ':' + c.who.hue + ':' + c.who.age + ':' + c.who.name;
  const QUEUE = [[0, -0.98], [0.34, 0.62], [-0.3, 1.78], [0.3, 2.9], [-0.24, 4.0], [0.2, 5.1]];
  const ENTRY = new T.Vector3(1.9, 0, 7.35), LANE_IN = new T.Vector3(0.05, 0, 6.3), LANE_OUT = new T.Vector3(1.7, 0, -0.95);
  const WORRIED = { hardship:1, wmVuln:1, app:1 };


  // wealth lounge (shown once the wealth arm exists)
  const lounge = new T.Group(); lounge.position.set(3.5, 0, 1.4); lounge.visible = false; scene.add(lounge);
  const lmesh = (g, m, x, y, z) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; lounge.add(o); return o; };
  lmesh(new T.CylinderGeometry(1.5, 1.5, 0.02, 40), M(0x1f3554, { roughness:1 }), 0, 0.012, 0);
  lmesh(new T.TorusGeometry(1.5, 0.03, 6, 48), brass, 0, 0.02, 0).rotation.x = Math.PI / 2;
  const velvet = M(0x6b2a3a, { roughness:0.9 });
  for (const [x, z, ry] of [[-0.7, 0.35, 0.9], [0.65, -0.4, -2.3]]){ const ch = new T.Group(); ch.position.set(x, 0, z); ch.rotation.y = ry; lounge.add(ch);
    const a = new T.Mesh(new T.BoxGeometry(0.7, 0.35, 0.65), velvet); a.position.y = 0.3; a.castShadow = true; ch.add(a);
    const bk = new T.Mesh(new T.BoxGeometry(0.7, 0.55, 0.14), velvet); bk.position.set(0, 0.62, -0.28); bk.castShadow = true; ch.add(bk);
    for (const sx of [-0.33, 0.33]){ const arm = new T.Mesh(new T.BoxGeometry(0.1, 0.22, 0.6), velvet); arm.position.set(sx, 0.55, 0); ch.add(arm); } }
  lmesh(new T.CylinderGeometry(0.32, 0.32, 0.05, 24), walnut, 0, 0.5, 0);
  lmesh(new T.CylinderGeometry(0.05, 0.05, 0.5, 8), brass, 0, 0.25, 0);
  lmesh(new T.CylinderGeometry(0.03, 0.03, 1.1, 8), brass, 1.05, 0.55, -0.75);
  const mc = document.createElement('canvas'); mc.width = 512; mc.height = 300; const mctx = mc.getContext('2d');
  const mtex = new T.CanvasTexture(mc); mtex.encoding = T.sRGBEncoding;
  const scr = lmesh(new T.BoxGeometry(1.5, 0.9, 0.05), M(0x111a18), 1.05, 1.45, -0.78); scr.rotation.y = -0.45;
  const scrFace = new T.Mesh(new T.PlaneGeometry(1.42, 0.83), M(0xffffff, { map:mtex, emissive:0xffffff, emissiveMap:mtex, emissiveIntensity:0.5, roughness:0.6 }));
  scrFace.position.set(1.05 + Math.sin(-0.45) * 0.03, 1.45, -0.78 + Math.cos(-0.45) * 0.03); scrFace.rotation.y = -0.45; lounge.add(scrFace);
  function drawMarket(){
    const c = mctx, w = 512, h = 300, hist = S.mktHist.slice(-24);
    c.fillStyle = '#0d1f1b'; c.fillRect(0, 0, w, h);
    const yr = S.mkt / S.mktY0 - 1;
    c.fillStyle = '#d9ab4f'; c.font = '800 34px Archivo, Arial Narrow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('SHARES', 24, 18);
    c.textAlign = 'right'; c.fillStyle = yr >= 0 ? '#71d49c' : '#ff8c80'; c.font = '600 34px "IBM Plex Mono", monospace'; c.fillText((yr >= 0 ? '+' : '') + (yr * 100).toFixed(1) + '%', w - 24, 18);
    const lo = Math.min(...hist) * 0.98, hi = Math.max(...hist) * 1.02, n = Math.max(2, hist.length);
    c.strokeStyle = 'rgba(148,174,165,.25)'; c.lineWidth = 1; for (let i = 0; i < 4; i++){ const y = 80 + i * 60; c.beginPath(); c.moveTo(24, y); c.lineTo(w - 24, y); c.stroke(); }
    c.beginPath(); hist.forEach((v, i) => { const x = 24 + i * (w - 48) / (n - 1), y = 260 - (v - lo) / (hi - lo || 1) * 180; i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = '#e8efe9'; c.lineWidth = 4; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = '#94aea5'; c.font = '500 24px "IBM Plex Mono", monospace'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(S.wm ? 'CLIENT ASSETS £' + (aum() / 1000).toFixed(1) + 'm' : 'LAST 2 YEARS', 24, 292);
    mtex.needsUpdate = true;
  }
  const LOUNGE_SPOT = [2.75, 2.1];

  // falling coins
  const fallers = [];
  function rain(n){ if (reduce) return; for (let i = 0; i < n; i++){ const c = new T.Mesh(coinG, coins.material); c.position.set(4.9 + Math.random() * 2, 3 + Math.random() * 1.5, -3.4 + Math.random() * 1.3); c.userData = { vy: 0, life: 1.4 + Math.random() * 0.4 }; c.rotation.set(Math.random() * 3, 0, Math.random() * 3); scene.add(c); fallers.push(c); } }

  // state
  let alarmOn = false, vaultSpin = 0, flashT = 0, sceneNow = {}, clockMin = 540, lastWin = 0;
  // weather and the hour of the day: the sun dims in rain and warms through the afternoon as the day's customers are served
  function atmosphere(){
    if (!S) return; sceneNow = sceneFacts();
    sun.intensity = { clear:1.15, cloud:0.85, rain:0.55, snow:0.8 }[sceneNow.weather]; sun.color.setHex(sceneNow.day > 0.65 ? 0xffc890 : sceneNow.day > 0.3 ? 0xffe4bd : 0xfff0d8);
    hemi.intensity = sceneNow.weather === 'rain' ? 0.7 : 0.85;
    analystP.visible = mode !== 'booth' && sceneNow.analyst; anDesk.visible = anScreen.visible = sceneNow.analyst; greeterP.visible = mode !== 'booth' && sceneNow.refurb;
    appStand.visible = appFace.visible = sceneNow.app; tellers[0].visible = sceneNow.cashier;
  }

  let mode = 'hall', snap = true;
  const want = { pos: new T.Vector3(), tgt: new T.Vector3(), fov: 50 };
  function preset(){
    const a = cam.aspect || 1;
    const vf = hdeg => clamp(T.MathUtils.radToDeg(2 * Math.atan(Math.tan(T.MathUtils.degToRad(hdeg) / 2) / Math.max(a, 0.5))), 34, 76);
    if (mode === 'booth'){ want.pos.set(0, 1.8, -2.62); want.tgt.set(0, 1.54, 2.2); want.fov = vf(a < 1.2 ? 52 : 58); }
    else { const tall = a < 1.15; want.pos.set(0, tall ? 6.4 : 6.2, tall ? 10.4 : 10.2); want.tgt.set(0, tall ? 1.7 : 1.2, -1.8); want.fov = a > 2.6 ? 30 : Math.max(vf(64), a > 1.6 ? 46 : 0); if (a > 2.6) want.tgt.y = 1.9; }
    tellers[1].visible = mode !== 'booth'; greeterP.visible = mode !== 'booth' && !!sceneNow.refurb; analystP.visible = mode !== 'booth' && !!sceneNow.analyst; front.visible = mode === 'booth'; faceLight.intensity = mode === 'booth' ? 1.6 : 0.6;
    const ab = $('#app'); if (ab) ab.dataset.booth = mode === 'booth' ? '1' : '';
  }
  function resize(){
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; preset(); snap = true;
  }
  new ResizeObserver(resize).observe(stage); resize();

  let last = performance.now(), t0 = last, paused = false;
  function frame(now){
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
    if (!document.hidden && !paused){
      // people
      for (const [, p] of people) step(p, dt, t);
      for (let i = leaving.length - 1; i >= 0; i--){ const p = leaving[i]; step(p, dt, t); if (!p.userData.via && p.userData.wait <= 0 && p.position.distanceTo(p.userData.t) < 0.3){ scene.remove(p); leaving.splice(i, 1); } }
      { const goal = 540 + (sceneNow.day || 0) * 480; clockMin += (goal - clockMin) * Math.min(1, dt * 1.6); const mn = clockMin % 60, hr = Math.floor(clockMin / 60) % 12; minute.rotation.z = -mn / 60 * Math.PI * 2; hour.rotation.z = -(hr + mn / 60) / 12 * Math.PI * 2; }
      if (front.visible && (sceneNow.weather === 'rain' || sceneNow.weather === 'snow') && now - lastWin > 120 && !reduce){ lastWin = now; drawWindow(now); }
      tellers.forEach((p, i) => { p.userData.blink -= dt; p.userData.eyes.scale.y = p.userData.blink < 0 ? 0.12 : 1; if (p.userData.blink < -0.13) p.userData.blink = 2.5 + i + Math.random() * 3; });
      // alarm
      const a = alarmOn ? (0.5 + 0.5 * Math.sin(t * 7)) : 0; alarm.intensity = a * 2.2; beaconMat.emissiveIntensity = a * 2.5;
      screenMat.emissive.setHex(alarmOn ? 0x7a2a1a : 0x1f4a40); screenMat.emissiveIntensity = alarmOn ? 0.6 + a * 0.6 : 0.6;
      // vault
      if (vaultSpin > 0){ vaultSpin = Math.max(0, vaultSpin - dt); const k = 1 - vaultSpin / 1.6; wheel.rotation.z = -k * Math.PI * 4; doorPivot.rotation.y = -Math.sin(k * Math.PI) * 0.55; }
      if (flashT > 0){ flashT = Math.max(0, flashT - dt); flash.intensity = flashT * 3; }
      for (let i = fallers.length - 1; i >= 0; i--){ const c = fallers[i]; c.userData.vy -= 14 * dt; c.position.y += c.userData.vy * dt; c.rotation.x += dt * 5; if (c.position.y < 1){ c.position.y = 1; c.userData.vy *= -0.3; } c.userData.life -= dt; if (c.userData.life <= 0){ scene.remove(c); fallers.splice(i, 1); } }
      for (let i = dying.length - 1; i >= 0; i--){ const d = dying[i]; d.userData.dt += dt; d.rotation.z = Math.min(1.4, d.userData.dt * 2); d.position.y -= dt * 0.3; if (d.userData.dt > 1.2){ scene.remove(d); dying.splice(i, 1); } }
      // camera sway
      if (mode === 'hall' && !reduce) want.pos.x = Math.sin(t * 0.13) * 0.35;
      const k = snap || reduce ? 1 : Math.min(1, dt * 3.5); snap = false;
      cam.position.lerp(want.pos, k); target.lerp(want.tgt, k);
      if (Math.abs(cam.fov - want.fov) > 0.01){ cam.fov += (want.fov - cam.fov) * k; cam.updateProjectionMatrix(); }
      cam.lookAt(target);
      if (stage.clientWidth) renderer.render(scene, cam);
    }
    requestAnimationFrame(frame);
  }
  const tmpV = new T.Vector3();
  function step(p, dt, t){
    const u = p.userData;
    u.blink -= dt; if (u.blink < 0){ u.eyes.scale.y = 0.12; if (u.blink < -0.13){ u.eyes.scale.y = 1; u.blink = 2 + Math.random() * 4; } }
    if (u.wait > 0){
      u.wait -= dt; const k = 1 - Math.max(0, u.wait) / u.waitMax;
      if (u.react === 'nod'){ u.head.rotation.x = Math.sin(k * Math.PI * 4) * 0.2; p.position.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.04; }
      else if (u.react === 'shake'){ u.head.rotation.y = Math.sin(k * Math.PI * 5) * 0.32; u.armP[0].rotation.z = -0.1 - Math.sin(k * Math.PI) * 0.25; u.armP[1].rotation.z = 0.1 + Math.sin(k * Math.PI) * 0.25; }
      else u.head.rotation.x = Math.sin(k * Math.PI * 2) * 0.08;
      if (u.wait <= 0){ u.head.rotation.set(0, 0, 0); u.armP[0].rotation.z = -0.1; u.armP[1].rotation.z = 0.1; p.position.y = 0; }
      return;
    }
    const tgt = u.via || u.t;
    tmpV.subVectors(tgt, p.position); tmpV.y = 0; const dist = tmpV.length();
    if (dist > 0.04){
      tmpV.normalize(); p.position.addScaledVector(tmpV, Math.min(dist, u.speed * dt));
      const want = Math.atan2(tmpV.x, tmpV.z); let dr = want - p.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.rotation.y += dr * Math.min(1, dt * 10);
      const w = (t + u.phase) * u.speed * 3.6;
      u.legP[0].rotation.x = Math.sin(w) * 0.55; u.legP[1].rotation.x = -Math.sin(w) * 0.55;
      u.armP[0].rotation.x = -Math.sin(w) * 0.42; u.armP[1].rotation.x = Math.sin(w) * 0.42;
      p.position.y = Math.abs(Math.cos(w)) * 0.035;
      u.head.rotation.y *= 0.9;
    } else {
      if (u.via){ u.via = null; return; }
      for (const l of u.legP) l.rotation.x *= 0.8;
      u.armP[0].rotation.x = u.armP[0].rotation.x * 0.85 + Math.sin(t * 1.3 + u.phase) * 0.006; u.armP[1].rotation.x = u.armP[1].rotation.x * 0.85 - Math.sin(t * 1.3 + u.phase) * 0.006;
      p.position.y = 0;
      const face = Math.atan2(0 - p.position.x, -1.75 - p.position.z); let dr = face - p.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); p.rotation.y += dr * Math.min(1, dt * 4);
      u.lookT -= dt; if (u.lookT < 0){ u.look = u.front ? (Math.random() - 0.5) * 0.25 : (Math.random() - 0.5) * 1.3; u.lookT = 1.4 + Math.random() * 3; }
      u.head.rotation.y += (u.look - u.head.rotation.y) * Math.min(1, dt * 2.5);
      u.head.rotation.x = Math.sin(t * 0.9 + u.phase) * 0.03;
    }
  }
  requestAnimationFrame(frame);

  // The executive meeting room. It stands well away from the hall and is drawn on demand as a still picture for the Team screen,
  // because that screen covers the live scene. Each adviser has a lamp on the table: green, amber or red as their worries grow.
  const room = new T.Group(); room.position.set(80, 0, 0); room.visible = false; scene.add(room);
  const rm = (g, m, x, y, z) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; room.add(o); return o; };
  const leather = M(0x5a3a2a, { roughness:0.5 }), RSTAT = { ok:'#71d49c', watch:'#d9ab4f', alarm:'#ff7a6c' };
  rm(new T.BoxGeometry(18, 0.1, 14), M(0x2a1d14, { roughness:0.55 }), 0, -0.05, 0);
  rm(new T.BoxGeometry(18, 5.2, 0.2), M(0x1f5246), 0, 2.6, -4.2);
  rm(new T.BoxGeometry(18, 1.2, 0.12), walnut, 0, 0.6, -4.06);
  rm(new T.BoxGeometry(7.2, 0.1, 2.0), walnut, 0, 0.8, -0.4);
  rm(new T.BoxGeometry(6.6, 0.74, 1.5), M(0x1c120c), 0, 0.37, -0.4);
  rm(new T.BoxGeometry(7.3, 0.03, 2.1), brass, 0, 0.74, -0.4);
  rm(new T.BoxGeometry(5.6, 0.06, 0.5), M(0xfff1d0, { emissive:0xffe2a8, emissiveIntensity:1.2 }), 0, 4.2, -0.4);
  const roomLight = new T.PointLight(0xffd9a0, 1.3, 22); roomLight.position.set(0, 3.8, 0.5); room.add(roomLight);
  const ROLE_X = [-2.4, -0.8, 0.8, 2.4], seatP = [], plateT = [], lamps = [];
  ['Finance director', 'Chief risk officer', 'Treasurer', 'Head of operations'].forEach((role, i) => {
    const x = ROLE_X[i], p = makePerson({ hue:[0.12, 0.58, 0.83, 0.31][i], staff:true, age:[52, 44, 38, 47][i] }); room.add(p); p.position.set(x, -0.12, -1.5); seatP.push(p);
    rm(new T.BoxGeometry(0.7, 0.9, 0.1), leather, x, 0.85, -2.05); rm(new T.BoxGeometry(0.8, 0.12, 0.8), leather, x, 0.4, -1.6);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const tx = new T.CanvasTexture(cv); tx.colorSpace = T.SRGBColorSpace; plateT.push({ cv, tx, role });
    const pl = new T.Mesh(new T.PlaneGeometry(1.2, 0.3), new T.MeshBasicMaterial({ map:tx })); pl.position.set(x, 1.0, -0.55); pl.rotation.x = -0.45; room.add(pl);
    const lm = M(0x71d49c, { emissive:0x71d49c, emissiveIntensity:1.4 }); rm(new T.SphereGeometry(0.09, 16, 12), lm, x, 0.9, -0.95); lamps.push(lm);
  });
  const rwin = document.createElement('canvas'); rwin.width = 384; rwin.height = 256; const rwinT = new T.CanvasTexture(rwin); rwinT.colorSpace = T.SRGBColorSpace;
  const rwall = document.createElement('canvas'); rwall.width = 576; rwall.height = 320; const rwallT = new T.CanvasTexture(rwall); rwallT.colorSpace = T.SRGBColorSpace;
  rm(new T.BoxGeometry(3.5, 2.5, 0.08), M(0xd9ab4f, { metalness:0.4 }), -4.6, 2.7, -4.05);
  { const w = new T.Mesh(new T.PlaneGeometry(3.3, 2.3), new T.MeshBasicMaterial({ map:rwinT })); w.position.set(-4.6, 2.7, -3.99); room.add(w); }
  rm(new T.BoxGeometry(4.0, 2.3, 0.08), M(0x111a18), 3.6, 2.8, -4.05);
  { const w = new T.Mesh(new T.PlaneGeometry(3.84, 2.14), new T.MeshBasicMaterial({ map:rwallT })); w.position.set(3.6, 2.8, -3.99); room.add(w); }
  function drawRoom(f){
    const wx2 = rwin.getContext('2d'), wthr = sceneFacts().weather, g = wx2.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, wthr === 'rain' ? '#6c7a86' : wthr === 'snow' ? '#a9b6c2' : wthr === 'cloud' ? '#8fa3b3' : '#8fb7d6'); g.addColorStop(1, wthr === 'clear' ? '#e3eef3' : '#c9d2d8');
    wx2.fillStyle = g; wx2.fillRect(0, 0, 384, 256);
    wx2.fillStyle = '#1b2a2c'; [[0, 150, 40, 106], [48, 120, 56, 136], [112, 160, 36, 96], [156, 100, 60, 156], [226, 140, 44, 116], [276, 110, 56, 146], [338, 150, 46, 106]].forEach(r => wx2.fillRect(r[0], r[1], r[2], r[3]));
    wx2.fillStyle = 'rgba(255,214,140,.8)'; for (let i = 0; i < 26; i++) wx2.fillRect(8 + (i * 37) % 360, 130 + (i * 23) % 110, 5, 7);
    if (wthr === 'rain'){ wx2.strokeStyle = 'rgba(205,225,240,.7)'; wx2.lineWidth = 2; wx2.beginPath(); for (let i = 0; i < 50; i++){ const x = (i * 31) % 384, y = (i * 67) % 256; wx2.moveTo(x, y); wx2.lineTo(x - 6, y + 22); } wx2.stroke(); }
    if (wthr === 'snow'){ wx2.fillStyle = '#fff'; for (let i = 0; i < 40; i++){ wx2.beginPath(); wx2.arc((i * 53) % 384, (i * 41) % 256, 2 + i % 3, 0, 7); wx2.fill(); } }
    wx2.strokeStyle = '#d9ab4f'; wx2.lineWidth = 5; wx2.beginPath(); wx2.moveTo(192, 0); wx2.lineTo(192, 256); wx2.moveTo(0, 128); wx2.lineTo(384, 128); wx2.stroke(); rwinT.needsUpdate = true;
    const c = rwall.getContext('2d'); c.fillStyle = '#0d1f1b'; c.fillRect(0, 0, 576, 320);
    c.fillStyle = '#d9ab4f'; c.font = '800 26px Archivo, Arial Narrow, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText('BOARD PACK', 24, 42);
    c.fillStyle = '#94aea5'; c.font = '500 20px "IBM Plex Mono", monospace'; c.textAlign = 'right'; c.fillText(f.board ? 'BOARD: ' + f.board.toUpperCase() : MONTHS[Math.min(S.month, 11)].toUpperCase() + ' ' + S.year, 552, 42);
    f.gauges.slice(0, 4).forEach((gg, i) => { const y = 78 + i * 58; c.textAlign = 'left'; c.fillStyle = '#e8efe9'; c.font = '600 22px Archivo, Arial Narrow, sans-serif'; c.fillText(gg.label.toUpperCase(), 24, y + 18); c.textAlign = 'right'; c.fillStyle = RSTAT[gg.status]; c.font = '600 26px "IBM Plex Mono", monospace'; c.fillText(gg.shown, 552, y + 18); c.fillStyle = 'rgba(148,174,165,.25)'; c.fillRect(24, y + 28, 528, 8); c.fillStyle = RSTAT[gg.status]; c.fillRect(24, y + 28, 528 * gg.fill, 8); });
    rwallT.needsUpdate = true;
    f.seats.forEach((s, i) => { const { cv, tx, role } = plateT[i], x = cv.getContext('2d'); x.fillStyle = '#e9e3d2'; x.fillRect(0, 0, 256, 64); x.fillStyle = RSTAT[s.status]; x.fillRect(0, 0, 14, 64); x.fillStyle = '#1b1712'; x.font = '700 19px Archivo, Arial Narrow, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(role.toUpperCase(), 26, 24); x.fillStyle = '#5a5040'; x.font = '500 18px "IBM Plex Mono", monospace'; x.fillText(s.status === 'ok' ? 'No concerns' : s.status === 'watch' ? 'Watching' : 'Alarmed', 26, 48); tx.needsUpdate = true;
      lamps[i].color.set(RSTAT[s.status]); lamps[i].emissive.set(RSTAT[s.status]); setFace(seatP[i], s.status === 'alarm' ? 'worried' : s.status === 'watch' ? 'neutral' : 'smile'); });
  }
  const cam2 = new T.PerspectiveCamera(46, 2.4, 0.1, 60);

  return {
    setPaused(v){ paused = !!v; if (!paused) last = performance.now(); },
    get isPaused(){ return paused; },
    sync(){
      tellers[0].visible = owned('cashier'); wallMat.color.copy(lin(owned('refurb') ? 0x1f5246 : 0x15372f));
      coins.count = Math.round(clamp(S.cash / 22, 0, COINS));
      gilts.count = Math.round(clamp(giltBook() / 120, 0, GMAX));
      // town
      const want = new Map();
      const legacyN = Math.ceil(S.legacy / 1200); for (let i = 0; i < legacyN; i++) want.set('L' + i, { kind:'legacy', status:'legacy' });
      for (const l of S.loans) want.set('N' + l.id, { kind: l.kind, status: l.status });
      for (const [id, g] of town) if (!want.has(id)){ town.delete(id); const s = slots.find(s => s.used === id); if (s) s.used = null; if (id[0] === 'N'){ g.userData.dt = 0; dying.push(g); } else scene.remove(g); }
      for (const [id, w] of want){
        let g = town.get(id);
        if (!g){ const s = slots.find(s => !s.used); if (!s) continue; s.used = id; g = makeBuilding(w.kind, w.status); g.position.set(s.x, 0.9, s.z); g.rotation.y = ((s.x * 13 + s.z * 7) % 1) * 0.3; scene.add(g); town.set(id, g); if (id[0] === 'N'){ g.scale.setScalar(0.01); g.userData.grow = true; } }
        if (w.kind !== 'legacy' && g.userData.roof && w.kind !== 'personal' && w.kind !== 'card') g.userData.roof.material = roofs[w.status] || roofs.current;
        if (g.userData.grow){ g.scale.setScalar(1); g.userData.grow = false; }
      }
    },
    boards(){
      atmosphere(); lounge.visible = !!S.wm; drawMarket(); drawWindow(); drawPosters();
      drawBoard(bCal, String(S.year), MONTHS[Math.min(S.month, 11)].slice(0, 3).toUpperCase(), `MONTH ${Math.min(S.month + 1, 12)} OF 12`);
      drawBoard(bRate, 'BANK RATE', S.base.toFixed(2) + '%', `SAVERS ${S.savRate.toFixed(2)}%`);
      drawSign();
    },
    setCard(instant){
      atmosphere();
      // who should be in the hall: upcoming physical cards from qi
      const upcoming = counterQueue().slice(0, QUEUE.length);
      const ids = new Set(upcoming.map(pkey));
      for (const [id, p] of people) if (!ids.has(id)){ people.delete(id); p.userData.t.copy(ENTRY); p.userData.via = null; leaving.push(p); }
      const winter = [10, 11, 0, 1].includes(S.month);
      upcoming.forEach((c, slot) => {
        let p = people.get(pkey(c)); const q = QUEUE[slot];
        if (!p){ p = makePerson({ hue:c.who.hue, age:c.who.age, winter }); if (instant) p.position.set(q[0], 0, q[1]); else { p.position.copy(ENTRY); p.userData.via = LANE_IN.clone(); } people.set(pkey(c), p); }
        p.userData.t.set(q[0], 0, q[1]); p.userData.speed = 2.4; p.userData.front = slot === 0;
        setFace(p, slot === 0 && WORRIED[c.kind] ? 'worried' : 'neutral');
      });
      alarmOn = S.queue.some(c => !c.done && ['fraud','aml','sanctions','liqshock','outage','funding','capital'].includes(c.kind));
    },
    react(c, style, d){
      const p = people.get(pkey(c));
      if (p){
        people.delete(pkey(c)); const u = p.userData;
        setFace(p, style === 'go' ? 'smile' : style === 'no' ? 'frown' : 'neutral');
        u.react = style === 'go' ? 'nod' : style === 'no' ? 'shake' : 'hm'; u.wait = u.waitMax = reduce ? 0.01 : 1.15;
        u.speed = style === "no" ? 1.8 : 2.6; u.front = false; u.t.copy(ENTRY); u.via = LANE_OUT.clone(); leaving.push(p);
      }
      if (d > 0.4) rain(Math.min(14, 3 + Math.round(d)));
      if (d < -0.4) flashT = 1;
    },
    monthTurn(){ vaultSpin = reduce ? 0 : 1.6; },
    boardroom(w = 960, h = 400){
      try {
        drawRoom(roomFacts()); room.visible = true; cam2.aspect = w / h; cam2.updateProjectionMatrix(); cam2.position.set(80, 2.0, 3.3); cam2.lookAt(80, 1.35, -1.8);
        const cw = stage.clientWidth, ch = stage.clientHeight; renderer.setSize(w, h, false); renderer.render(scene, cam2); const u = canvas.toDataURL('image/jpeg', 0.82);
        room.visible = false; if (cw && ch) renderer.setSize(cw, ch, false); snap = true; return u;
      } catch (e) { room.visible = false; return null; }
    },
    setView(m, instant){ if (m !== mode){ mode = m; preset(); if (instant) snap = true; } },
    snapshot(){ try { const pm = mode; mode = 'hall'; preset(); cam.aspect = 1.6; cam.position.copy(want.pos); target.copy(want.tgt); cam.fov = 46; cam.updateProjectionMatrix(); cam.lookAt(target); const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(960, 600, false); renderer.render(scene, cam); const u = canvas.toDataURL('image/jpeg', 0.8); renderer.setSize(w, h, false); cam.aspect = w / h; mode = pm; preset(); snap = true; return u; } catch (e) { return null; } },
  };
})();
