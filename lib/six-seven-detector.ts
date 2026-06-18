export type PoseLandmark = { x: number; y: number; z: number; visibility?: number };

export type DetectionStatus =
  | "idle"
  | "pose_missing"
  | "ready"
  | "left_up"
  | "right_up"
  | "counted";

const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;

const VISIBILITY_MIN = 0.25;
const WRIST_VISIBILITY_MIN = 0.2;
/** สัดส่วนของความสูงลำตัว — ยกแขนเกินเท่านี้ถือว่า "ยก" */
const RAISE_RATIO = 0.1;
/** สัดส่วนของความสูงลำตัว — ลงต่ำกว่าเท่านี้ถือว่า "ลง" */
const LOWER_RATIO = 0.04;
const MIN_FRAMES_BETWEEN_COUNTS = 2;

function visibility(lm: PoseLandmark): number {
  return lm.visibility ?? 1;
}

function isVisible(lm: PoseLandmark, min = VISIBILITY_MIN): boolean {
  return visibility(lm) >= min;
}

/** คำนวณขนาดร่างกายในภาพ — ปรับเกณฑ์อัตโนมัติตามระยะ (ใกล้/ไกล) */
function getBodyScale(landmarks: PoseLandmark[]): number {
  const leftTorso = Math.abs(landmarks[LEFT_HIP].y - landmarks[LEFT_SHOULDER].y);
  const rightTorso = Math.abs(landmarks[RIGHT_HIP].y - landmarks[RIGHT_SHOULDER].y);
  const shoulderWidth = Math.abs(
    landmarks[RIGHT_SHOULDER].x - landmarks[LEFT_SHOULDER].x,
  );

  const torso =
    leftTorso > 0 && rightTorso > 0
      ? (leftTorso + rightTorso) / 2
      : Math.max(leftTorso, rightTorso);

  return Math.max(torso, shoulderWidth * 0.55, 0.04);
}

/** ใช้ข้อมือเป็นหลัก ถ้ามองไม่ชัดใช้ข้อศอกแทน (มัก detect ได้ดีกว่าตอนอยู่ไกล) */
function getArmPoint(
  wrist: PoseLandmark,
  elbow: PoseLandmark,
): PoseLandmark | null {
  const wristOk = isVisible(wrist, WRIST_VISIBILITY_MIN);
  const elbowOk = isVisible(elbow, VISIBILITY_MIN);

  if (wristOk) return wrist;
  if (elbowOk) return elbow;
  return null;
}

function isArmRaised(
  arm: PoseLandmark,
  shoulder: PoseLandmark,
  scale: number,
): boolean {
  if (!isVisible(shoulder)) return false;
  const raiseThreshold = scale * RAISE_RATIO;
  return arm.y < shoulder.y - raiseThreshold;
}

function isArmLowered(
  arm: PoseLandmark,
  shoulder: PoseLandmark,
  scale: number,
): boolean {
  if (!isVisible(shoulder)) return true;
  const lowerThreshold = scale * LOWER_RATIO;
  return arm.y >= shoulder.y - lowerThreshold;
}

function hasUsablePose(landmarks: PoseLandmark[]): boolean {
  return (
    isVisible(landmarks[LEFT_SHOULDER]) ||
    isVisible(landmarks[RIGHT_SHOULDER])
  );
}

export class SixSevenDetector {
  private leftWasUp = false;
  private rightWasUp = false;
  private lastCountedArm: "left" | "right" | null = null;
  private framesSinceCount = MIN_FRAMES_BETWEEN_COUNTS;
  private lastStatus: DetectionStatus = "idle";

  reset(): void {
    this.leftWasUp = false;
    this.rightWasUp = false;
    this.lastCountedArm = null;
    this.framesSinceCount = MIN_FRAMES_BETWEEN_COUNTS;
    this.lastStatus = "idle";
  }

  getStatus(): DetectionStatus {
    return this.lastStatus;
  }

  process(landmarks: PoseLandmark[] | null): {
    counted: boolean;
    status: DetectionStatus;
    raisedArm?: "left" | "right";
  } {
    this.framesSinceCount++;

    if (!landmarks || landmarks.length < 25 || !hasUsablePose(landmarks)) {
      this.lastStatus = "pose_missing";
      return { counted: false, status: this.lastStatus };
    }

    const scale = getBodyScale(landmarks);

    const leftArm = getArmPoint(landmarks[LEFT_WRIST], landmarks[LEFT_ELBOW]);
    const rightArm = getArmPoint(landmarks[RIGHT_WRIST], landmarks[RIGHT_ELBOW]);
    const leftShoulder = landmarks[LEFT_SHOULDER];
    const rightShoulder = landmarks[RIGHT_SHOULDER];

    const leftUp =
      leftArm !== null && isArmRaised(leftArm, leftShoulder, scale);
    const rightUp =
      rightArm !== null && isArmRaised(rightArm, rightShoulder, scale);

    if (
      leftArm !== null &&
      isArmLowered(leftArm, leftShoulder, scale)
    ) {
      this.leftWasUp = false;
    }
    if (
      rightArm !== null &&
      isArmLowered(rightArm, rightShoulder, scale)
    ) {
      this.rightWasUp = false;
    }

    if (!leftUp && !rightUp) {
      this.lastStatus = "ready";
      return { counted: false, status: this.lastStatus };
    }

    if (leftUp) this.lastStatus = "left_up";
    if (rightUp) this.lastStatus = "right_up";

    if (
      leftUp &&
      !this.leftWasUp &&
      this.lastCountedArm !== "left" &&
      this.framesSinceCount >= MIN_FRAMES_BETWEEN_COUNTS
    ) {
      this.leftWasUp = true;
      this.lastCountedArm = "left";
      this.framesSinceCount = 0;
      this.lastStatus = "counted";
      return { counted: true, status: this.lastStatus, raisedArm: "left" };
    }

    if (
      rightUp &&
      !this.rightWasUp &&
      this.lastCountedArm !== "right" &&
      this.framesSinceCount >= MIN_FRAMES_BETWEEN_COUNTS
    ) {
      this.rightWasUp = true;
      this.lastCountedArm = "right";
      this.framesSinceCount = 0;
      this.lastStatus = "counted";
      return { counted: true, status: this.lastStatus, raisedArm: "right" };
    }

    return { counted: false, status: this.lastStatus };
  }
}
