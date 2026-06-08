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
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

const VISIBILITY_MIN = 0.5;
const RAISE_MARGIN = 0.04;
const MIN_FRAMES_BETWEEN_COUNTS = 6;

function isVisible(lm: PoseLandmark): boolean {
  return (lm.visibility ?? 1) >= VISIBILITY_MIN;
}

function isArmRaised(wrist: PoseLandmark, shoulder: PoseLandmark): boolean {
  if (!isVisible(wrist) || !isVisible(shoulder)) return false;
  return wrist.y < shoulder.y - RAISE_MARGIN;
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

    if (!landmarks || landmarks.length < 17) {
      this.lastStatus = "pose_missing";
      return { counted: false, status: this.lastStatus };
    }

    const leftUp = isArmRaised(
      landmarks[LEFT_WRIST],
      landmarks[LEFT_SHOULDER],
    );
    const rightUp = isArmRaised(
      landmarks[RIGHT_WRIST],
      landmarks[RIGHT_SHOULDER],
    );

    if (!leftUp) this.leftWasUp = false;
    if (!rightUp) this.rightWasUp = false;

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

    this.leftWasUp = leftUp;
    this.rightWasUp = rightUp;

    return { counted: false, status: this.lastStatus };
  }
}
