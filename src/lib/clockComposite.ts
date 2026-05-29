export type ClockCompositeConfig = {
  id: string;
  model: string;
  faceTexture: string;
  hourHandModel: string;
  minuteHandModel: string;
  secondHandModel: string;
  clockHeight: number;
  modelX: number;
  modelY: number;
  modelZ: number;
  modelRotationX: number;
  faceX: number;
  faceY: number;
  faceZ: number;
  faceSize: number;
  faceRotation: number;
  handX: number;
  handY: number;
  handZ: number;
  hourHandX: number;
  hourHandY: number;
  hourHandZ: number;
  minuteHandX: number;
  minuteHandY: number;
  minuteHandZ: number;
  secondHandX: number;
  secondHandY: number;
  secondHandZ: number;
  hourScale: number;
  minuteScale: number;
  secondScale: number;
  showHourHand: boolean;
  showMinuteHand: boolean;
  showSecondHand: boolean;
  pendulumRotationOffset: number;
  pendulumPivotX: number;
  pendulumPivotY: number;
  pendulumOffsetX: number;
  pendulumOffsetY: number;
  pendulumSwingAmount: number;
  pendulumSwingSpeed: number;
  pendulumSwingInertia: number;
  hourRotationOffset: number;
  minuteRotationOffset: number;
  secondRotationOffset: number;
};

export const defaultClockComposite: ClockCompositeConfig = {
  id: "vintage-wall-clock",
  model: "/3d-models/clock/vintage_clock_-_free_model.glb",
  faceTexture: "/3d-models/clock/clockface_vintage_fix_latest.png",
  hourHandModel: "/3d-models/clock/hands/vintage_clock_hour_hand_vector_beveled_35_percent_thicker.glb",
  minuteHandModel: "/3d-models/clock/hands/vintage_clock_minute_hand_vector_beveled_35_percent_thicker.glb",
  secondHandModel: "/3d-models/clock/hands/vintage_clock_second_hand.glb",
  clockHeight: 2.2,
  modelX: 0,
  modelY: 0,
  modelZ: 0.12,
  modelRotationX: 0,
  faceX: 0,
  faceY: 0.34,
  faceZ: 0.14,
  faceSize: 1.06,
  faceRotation: 0,
  handX: 0,
  handY: 0.34,
  handZ: 0.17,
  hourHandX: 0,
  hourHandY: 0,
  hourHandZ: 0,
  minuteHandX: 0,
  minuteHandY: 0,
  minuteHandZ: 0,
  secondHandX: 0,
  secondHandY: 0,
  secondHandZ: 0,
  hourScale: 0.58,
  minuteScale: 0.62,
  secondScale: 0.72,
  showHourHand: true,
  showMinuteHand: true,
  showSecondHand: true,
  pendulumRotationOffset: 0,
  pendulumPivotX: 0,
  pendulumPivotY: 0,
  pendulumOffsetX: 0,
  pendulumOffsetY: 0,
  pendulumSwingAmount: 0.07,
  pendulumSwingSpeed: 0.32,
  pendulumSwingInertia: 0.25,
  hourRotationOffset: 0,
  minuteRotationOffset: 0,
  secondRotationOffset: 0,
};

export function normalizeClockComposite(seed?: Partial<ClockCompositeConfig>): ClockCompositeConfig {
  const parsed = { ...defaultClockComposite, ...seed };

  return {
    ...parsed,
    clockHeight: clampNumber(parsed.clockHeight, 0.4, 4),
    modelX: clampNumber(parsed.modelX, -1.5, 1.5),
    modelY: clampNumber(parsed.modelY, -1.5, 1.5),
    modelZ: clampNumber(parsed.modelZ, -0.5, 0.8),
    modelRotationX: clampNumber(parsed.modelRotationX, -1.2, 1.2),
    faceX: clampNumber(parsed.faceX, -1.5, 1.5),
    faceY: clampNumber(parsed.faceY, -1.5, 1.5),
    faceZ: clampNumber(parsed.faceZ, -0.5, 0.7),
    faceSize: clampNumber(parsed.faceSize, 0.2, 2.4),
    faceRotation: clampNumber(parsed.faceRotation, -Math.PI, Math.PI),
    handX: clampNumber(parsed.handX, -1.5, 1.5),
    handY: clampNumber(parsed.handY, -1.5, 1.5),
    handZ: clampNumber(parsed.handZ, -0.5, 0.8),
    hourHandX: clampNumber(parsed.hourHandX, -0.4, 0.4),
    hourHandY: clampNumber(parsed.hourHandY, -0.4, 0.4),
    hourHandZ: clampNumber(parsed.hourHandZ, -0.3, 0.45),
    minuteHandX: clampNumber(parsed.minuteHandX, -0.4, 0.4),
    minuteHandY: clampNumber(parsed.minuteHandY, -0.4, 0.4),
    minuteHandZ: clampNumber(parsed.minuteHandZ, -0.3, 0.45),
    secondHandX: clampNumber(parsed.secondHandX, -0.4, 0.4),
    secondHandY: clampNumber(parsed.secondHandY, -0.4, 0.4),
    secondHandZ: clampNumber(parsed.secondHandZ, -0.3, 0.45),
    hourScale: clampNumber(parsed.hourScale, 0.05, 1.8),
    minuteScale: clampNumber(parsed.minuteScale, 0.05, 1.8),
    secondScale: clampNumber(parsed.secondScale, 0.05, 1.8),
    showHourHand: parsed.showHourHand ?? defaultClockComposite.showHourHand,
    showMinuteHand: parsed.showMinuteHand ?? defaultClockComposite.showMinuteHand,
    showSecondHand: parsed.showSecondHand ?? defaultClockComposite.showSecondHand,
    pendulumRotationOffset: clampNumber(parsed.pendulumRotationOffset, -0.6, 0.6),
    pendulumPivotX: clampNumber(parsed.pendulumPivotX, -0.12, 0.12),
    pendulumPivotY: clampNumber(parsed.pendulumPivotY, -0.18, 0.18),
    pendulumOffsetX: clampNumber(parsed.pendulumOffsetX, -0.12, 0.12),
    pendulumOffsetY: clampNumber(parsed.pendulumOffsetY, -0.18, 0.18),
    pendulumSwingAmount: clampNumber(parsed.pendulumSwingAmount, 0, 0.35),
    pendulumSwingSpeed: clampNumber(parsed.pendulumSwingSpeed, 0, 1.2),
    pendulumSwingInertia: clampNumber(parsed.pendulumSwingInertia, 0, 1),
    hourRotationOffset: clampNumber(parsed.hourRotationOffset, -Math.PI, Math.PI),
    minuteRotationOffset: clampNumber(parsed.minuteRotationOffset, -Math.PI, Math.PI),
    secondRotationOffset: clampNumber(parsed.secondRotationOffset, -Math.PI, Math.PI),
  };
}

export function clockHandAngles(date = new Date()) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;

  return {
    hour: -(hours / 12) * Math.PI * 2,
    minute: -(minutes / 60) * Math.PI * 2,
    second: -(seconds / 60) * Math.PI * 2,
  };
}

function clampNumber(value: number, min: number, max: number) {
  const number = Number(value);
  const clamped = Math.min(Math.max(Number.isFinite(number) ? number : min, min), max);
  return Number(clamped.toFixed(4));
}
