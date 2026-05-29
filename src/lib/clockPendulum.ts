import * as THREE from "three";
import type { ClockCompositeConfig } from "@/lib/clockComposite";

const CLOCK_PENDULUM_PART_NAMES = ["Object_13", "Object_15", "Object_19"];

export const CLOCK_PENDULUM_GROUP_NAME = "live-clock-pendulum";
const CLOCK_PENDULUM_PARTS_GROUP_NAME = "live-clock-pendulum-parts";
const PENDULUM_BASE_PIVOT_KEY = "clockPendulumBasePivot";

export function extractClockPendulum(clockModel: THREE.Object3D) {
  const parts = CLOCK_PENDULUM_PART_NAMES.map((name) => clockModel.getObjectByName(name)).filter(
    (part): part is THREE.Object3D => Boolean(part),
  );

  if (parts.length === 0) {
    return null;
  }

  clockModel.updateWorldMatrix(true, true);

  const pendulumBox = new THREE.Box3();
  parts.forEach((part) => pendulumBox.expandByObject(part));

  const pivotWorld = new THREE.Vector3(
    (pendulumBox.min.x + pendulumBox.max.x) / 2,
    pendulumBox.max.y,
    (pendulumBox.min.z + pendulumBox.max.z) / 2,
  );
  const pivotLocal = pivotWorld.applyMatrix4(clockModel.matrixWorld.clone().invert());

  const pendulumGroup = new THREE.Group();
  pendulumGroup.name = CLOCK_PENDULUM_GROUP_NAME;
  pendulumGroup.position.copy(pivotLocal);
  pendulumGroup.userData[PENDULUM_BASE_PIVOT_KEY] = pivotLocal.toArray();

  const partsGroup = new THREE.Group();
  partsGroup.name = CLOCK_PENDULUM_PARTS_GROUP_NAME;
  pendulumGroup.add(partsGroup);

  clockModel.add(pendulumGroup);
  partsGroup.updateWorldMatrix(true, false);

  parts.forEach((part) => {
    partsGroup.attach(part);
  });

  return pendulumGroup;
}

export function setClockPendulumSwing(
  pendulum: THREE.Object3D | null | undefined,
  timeSeconds: number,
  config: Pick<
    ClockCompositeConfig,
    | "pendulumRotationOffset"
    | "pendulumPivotX"
    | "pendulumPivotY"
    | "pendulumOffsetX"
    | "pendulumOffsetY"
    | "pendulumSwingAmount"
    | "pendulumSwingSpeed"
    | "pendulumSwingInertia"
  >,
) {
  if (!pendulum) {
    return;
  }

  const basePivot = readBasePivot(pendulum);
  pendulum.position.set(
    basePivot.x + config.pendulumPivotX,
    basePivot.y + config.pendulumPivotY,
    basePivot.z,
  );
  const baseSwing = Math.sin(timeSeconds * Math.PI * 2 * config.pendulumSwingSpeed);
  pendulum.rotation.z =
    config.pendulumRotationOffset +
    shapePendulumSwing(baseSwing, config.pendulumSwingInertia) * config.pendulumSwingAmount;

  const partsGroup = pendulum.getObjectByName(CLOCK_PENDULUM_PARTS_GROUP_NAME);
  if (partsGroup) {
    partsGroup.position.set(
      config.pendulumOffsetX - config.pendulumPivotX,
      config.pendulumOffsetY - config.pendulumPivotY,
      0,
    );
  }
}

function shapePendulumSwing(value: number, inertia: number) {
  const normalizedInertia = THREE.MathUtils.clamp(inertia, 0, 1);
  const exponent = THREE.MathUtils.lerp(1, 0.48, normalizedInertia);
  return Math.sign(value) * Math.abs(value) ** exponent;
}

function readBasePivot(pendulum: THREE.Object3D) {
  const raw = pendulum.userData[PENDULUM_BASE_PIVOT_KEY];
  if (Array.isArray(raw) && raw.length >= 3) {
    return new THREE.Vector3(Number(raw[0]) || 0, Number(raw[1]) || 0, Number(raw[2]) || 0);
  }

  return pendulum.position.clone();
}
