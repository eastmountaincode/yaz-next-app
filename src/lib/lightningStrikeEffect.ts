import * as THREE from "three";

const MAX_SPARKS = 84;
const LIGHTNING_DURATION = 0.52;
const SPARK_DURATION = 0.95;

type LightningFrame = {
  exposureMultiplier: number;
  shakeX: number;
  shakeY: number;
};

export type LightningStrikeEffect = {
  group: THREE.Group;
  trigger: (impactPoint: THREE.Vector3) => void;
  update: (timeSeconds: number) => LightningFrame;
  dispose: () => void;
};

function createSparkTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create the lightning spark texture.");
  }

  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.18, "rgba(220,238,255,1)");
  gradient.addColorStop(0.5, "rgba(105,173,255,0.65)");
  gradient.addColorStop(1, "rgba(32,92,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createJaggedPath(
  start: THREE.Vector3,
  end: THREE.Vector3,
  segments: number,
  amplitude: number,
) {
  const points: THREE.Vector3[] = [];
  const direction = end.clone().sub(start);

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const point = start.clone().addScaledVector(direction, progress);
    if (index > 0 && index < segments) {
      const envelope = Math.pow(Math.sin(Math.PI * progress), 0.62);
      const taper = amplitude * envelope * (1 - progress * 0.34);
      point.x += randomBetween(-taper, taper);
      point.y += randomBetween(-taper * 0.18, taper * 0.18);
      point.z += randomBetween(-taper * 0.72, taper * 0.72);
    }
    points.push(point);
  }

  return points;
}

function addBoltLayer(
  parent: THREE.Group,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.MeshBasicMaterial,
  ownedGeometries: THREE.BufferGeometry[],
) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const geometry = new THREE.TubeGeometry(
    curve,
    Math.max(16, (points.length - 1) * 3),
    radius,
    5,
    false,
  );
  ownedGeometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 80;
  parent.add(mesh);
}

function boltPulse(elapsed: number) {
  if (elapsed < 0 || elapsed > LIGHTNING_DURATION) {
    return 0;
  }
  if (elapsed < 0.04) {
    return 1;
  }
  if (elapsed < 0.075) {
    return 0.08;
  }
  if (elapsed < 0.135) {
    return 0.82;
  }
  if (elapsed < 0.18) {
    return 0.12;
  }
  if (elapsed < 0.285) {
    return 1;
  }
  return THREE.MathUtils.smoothstep(LIGHTNING_DURATION - elapsed, 0, 0.235) * 0.82;
}

export function createLightningStrikeEffect(): LightningStrikeEffect {
  const group = new THREE.Group();
  group.name = "cross-lightning-effect";

  const boltGroup = new THREE.Group();
  boltGroup.name = "cross-lightning-bolts";
  boltGroup.visible = false;
  group.add(boltGroup);

  const coreMaterial = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: "#b8d8ff",
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const outerGlowMaterial = new THREE.MeshBasicMaterial({
    color: "#507dff",
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const flashLight = new THREE.PointLight("#d8e8ff", 0, 8, 1.35);
  flashLight.name = "cross-lightning-flash";
  flashLight.castShadow = false;
  group.add(flashLight);

  const sparkTexture = createSparkTexture();
  const sparkPositions = new Float32Array(MAX_SPARKS * 3);
  const sparkVelocities = new Float32Array(MAX_SPARKS * 3);
  const sparkLifetimes = new Float32Array(MAX_SPARKS);
  const sparkGeometry = new THREE.BufferGeometry();
  const sparkPositionAttribute = new THREE.BufferAttribute(sparkPositions, 3);
  sparkPositionAttribute.setUsage(THREE.DynamicDrawUsage);
  sparkGeometry.setAttribute("position", sparkPositionAttribute);
  const sparkMaterial = new THREE.PointsMaterial({
    color: "#d8eaff",
    map: sparkTexture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    size: 0.075,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.name = "cross-lightning-sparks";
  sparks.frustumCulled = false;
  sparks.renderOrder = 81;
  sparks.visible = false;
  group.add(sparks);

  let strikeStartedAt = Number.NEGATIVE_INFINITY;
  let previousUpdateAt = Number.NEGATIVE_INFINITY;
  let activeSparkCount = 0;
  let ownedBoltGeometries: THREE.BufferGeometry[] = [];

  const clearBolts = () => {
    boltGroup.clear();
    ownedBoltGeometries.forEach((geometry) => geometry.dispose());
    ownedBoltGeometries = [];
  };

  const addCompleteBolt = (points: THREE.Vector3[], scale = 1) => {
    addBoltLayer(boltGroup, points, 0.009 * scale, coreMaterial, ownedBoltGeometries);
    addBoltLayer(boltGroup, points, 0.025 * scale, glowMaterial, ownedBoltGeometries);
    addBoltLayer(
      boltGroup,
      points,
      0.057 * scale,
      outerGlowMaterial,
      ownedBoltGeometries,
    );
  };

  const trigger = (impactPoint: THREE.Vector3) => {
    clearBolts();

    const start = impactPoint.clone().add(
      new THREE.Vector3(randomBetween(-0.82, 0.82), 5.2, randomBetween(0.18, 0.42)),
    );
    const trunk = createJaggedPath(start, impactPoint, 18, 0.31);
    addCompleteBolt(trunk);

    const branchIndices = [5, 8, 11, 14];
    branchIndices.forEach((trunkIndex, branchIndex) => {
      const branchStart = trunk[trunkIndex];
      const branchDirection = branchIndex % 2 === 0 ? -1 : 1;
      const branchEnd = branchStart.clone().add(
        new THREE.Vector3(
          branchDirection * randomBetween(0.42, 0.94),
          randomBetween(-0.72, -0.25),
          randomBetween(-0.25, 0.34),
        ),
      );
      addCompleteBolt(createJaggedPath(branchStart, branchEnd, 7, 0.13), 0.58);
    });

    flashLight.position.copy(impactPoint).add(new THREE.Vector3(0, 0.08, 0.38));

    activeSparkCount = MAX_SPARKS;
    for (let index = 0; index < MAX_SPARKS; index += 1) {
      const positionOffset = index * 3;
      sparkPositions[positionOffset] = impactPoint.x + randomBetween(-0.035, 0.035);
      sparkPositions[positionOffset + 1] = impactPoint.y + randomBetween(-0.045, 0.045);
      sparkPositions[positionOffset + 2] = impactPoint.z + randomBetween(0.04, 0.12);

      const angle = Math.random() * Math.PI * 2;
      const horizontalSpeed = randomBetween(0.6, 2.4);
      sparkVelocities[positionOffset] = Math.cos(angle) * horizontalSpeed;
      sparkVelocities[positionOffset + 1] = randomBetween(0.4, 3.2);
      sparkVelocities[positionOffset + 2] = randomBetween(0.4, 1.8);
      sparkLifetimes[index] = randomBetween(0.36, SPARK_DURATION);
    }
    sparkPositionAttribute.needsUpdate = true;
    sparks.visible = true;
    boltGroup.visible = true;
    strikeStartedAt = performance.now() / 1000;
    previousUpdateAt = strikeStartedAt;
  };

  const update = (timeSeconds: number): LightningFrame => {
    const elapsed = timeSeconds - strikeStartedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > SPARK_DURATION) {
      boltGroup.visible = false;
      sparks.visible = false;
      flashLight.intensity = 0;
      return { exposureMultiplier: 1, shakeX: 0, shakeY: 0 };
    }

    const pulse = boltPulse(elapsed);
    boltGroup.visible = pulse > 0.001;
    coreMaterial.opacity = pulse;
    glowMaterial.opacity = pulse * 0.62;
    outerGlowMaterial.opacity = pulse * 0.2;
    flashLight.intensity = pulse * 34;

    const deltaSeconds = THREE.MathUtils.clamp(timeSeconds - previousUpdateAt, 0, 0.05);
    previousUpdateAt = timeSeconds;
    let livingSparks = 0;
    for (let index = 0; index < activeSparkCount; index += 1) {
      const positionOffset = index * 3;
      if (elapsed >= sparkLifetimes[index]) {
        sparkPositions[positionOffset + 1] = -100;
        continue;
      }

      livingSparks += 1;
      sparkVelocities[positionOffset + 1] -= 11.5 * deltaSeconds;
      sparkPositions[positionOffset] += sparkVelocities[positionOffset] * deltaSeconds;
      sparkPositions[positionOffset + 1] += sparkVelocities[positionOffset + 1] * deltaSeconds;
      sparkPositions[positionOffset + 2] += sparkVelocities[positionOffset + 2] * deltaSeconds;
    }
    sparkPositionAttribute.needsUpdate = true;
    sparkMaterial.opacity = THREE.MathUtils.clamp(
      (livingSparks / Math.max(activeSparkCount, 1)) * 1.3,
      0,
      0.92,
    );
    sparks.visible = livingSparks > 0;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const shakeEnvelope = reducedMotion ? 0 : pulse * Math.max(0, 1 - elapsed / 0.4);
    return {
      exposureMultiplier: 1 + pulse * 0.82,
      shakeX: Math.sin(elapsed * 173) * 0.018 * shakeEnvelope,
      shakeY: Math.sin(elapsed * 227 + 0.8) * 0.012 * shakeEnvelope,
    };
  };

  const dispose = () => {
    clearBolts();
    coreMaterial.dispose();
    glowMaterial.dispose();
    outerGlowMaterial.dispose();
    sparkGeometry.dispose();
    sparkMaterial.dispose();
    sparkTexture.dispose();
    group.clear();
  };

  return { group, trigger, update, dispose };
}
