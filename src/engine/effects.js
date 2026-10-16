import * as THREE from "three";

const vertexShader = `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

// Thousands of glowing dots that drift, rise and fade
export class Particles {
  constructor(capacity = 4000) {
    this.capacity = capacity;
    this.cursor = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity).fill(1);
    this.size0 = new Float32Array(capacity);
    this.lift = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.pos, 3),
    );
    this.geometry.setAttribute(
      "aColor",
      new THREE.BufferAttribute(this.col, 3),
    );
    this.geometry.setAttribute(
      "aSize",
      new THREE.BufferAttribute(this.size, 1),
    );
    this.geometry.setAttribute(
      "aAlpha",
      new THREE.BufferAttribute(this.alpha, 1),
    );

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setScale(value) {
    this.material.uniforms.uScale.value = value;
  }

  emit(x, y, z, vx, vy, vz, life, color, size, lift = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    this.col[k] = color.r;
    this.col[k + 1] = color.g;
    this.col[k + 2] = color.b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size0[i] = size;
    this.lift[i] = lift;
  }

  update(dt) {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] += this.lift[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(this.life[i], 0) / this.maxLife[i];
      this.alpha[i] = t;
      this.size[i] = this.size0[i] * (0.4 + 0.6 * t);
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// A simple bat silhouette drawn with canvas, tinted later by the sprite colour
function makeBatTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  g.fillStyle = "#ffffff";

  const half = () => {
    g.beginPath();
    g.moveTo(64, 18);
    g.lineTo(68, 8);
    g.lineTo(70, 20);
    g.quadraticCurveTo(90, 8, 124, 6);
    g.quadraticCurveTo(112, 22, 108, 34);
    g.quadraticCurveTo(100, 26, 92, 40);
    g.quadraticCurveTo(84, 32, 76, 46);
    g.lineTo(66, 52);
    g.lineTo(64, 52);
    g.closePath();
    g.fill();
  };

  half();
  g.save();
  g.translate(128, 0);
  g.scale(-1, 1);
  half();
  g.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const MAX_BATS = 30;

export class Bats {
  constructor(scene) {
    this.scene = scene;
    this.texture = makeBatTexture();
    this.bats = [];
  }

  spawn(x, y, z) {
    if (this.bats.length >= MAX_BATS) return;
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      color: 0xc9a6ff,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, y, z);
    sprite.userData = {
      vx: (Math.random() - 0.5) * 2.4,
      vy: 0.5 + Math.random() * 1.2,
      vz: (Math.random() - 0.5) * 0.8,
      life: 3.5 + Math.random() * 1.5,
      age: 0,
      size: 0.35 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
    };
    this.scene.add(sprite);
    this.bats.push(sprite);
  }

  update(dt) {
    for (let i = this.bats.length - 1; i >= 0; i--) {
      const bat = this.bats[i];
      const d = bat.userData;
      d.age += dt;

      if (d.age >= d.life) {
        this.scene.remove(bat);
        bat.material.dispose();
        this.bats.splice(i, 1);
        continue;
      }

      bat.position.x += (d.vx + Math.sin(d.age * 3 + d.phase) * 0.6) * dt;
      bat.position.y += (d.vy + Math.sin(d.age * 4 + d.phase) * 0.4) * dt;
      bat.position.z += d.vz * dt;

      const flap = 0.6 + 0.4 * Math.sin(d.age * 22 + d.phase);
      bat.scale.set(d.size, d.size * 0.5 * flap, 1);
      bat.material.rotation = -d.vx * 0.15;
      bat.material.opacity = Math.min(1, d.life - d.age);
    }
  }

  dispose() {
    this.bats.forEach((bat) => {
      this.scene.remove(bat);
      bat.material.dispose();
    });
    this.bats = [];
    this.texture.dispose();
  }
}

export function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const gradient = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255, 230, 170, 1)");
  gradient.addColorStop(0.35, "rgba(255, 190, 110, 0.35)");
  gradient.addColorStop(1, "rgba(255, 160, 80, 0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
