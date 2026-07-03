import { DomainError, type Id } from "@/domain";

/**
 * Typed application-error hierarchy. All extend the domain's `DomainError`, so a
 * caller can catch broadly (`DomainError`) or narrowly (a specific class). Each
 * error names the SRL step it guards, so a UI can respond to the exact failure
 * rather than parsing a message.
 */

export class ApplicationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** capturePrediction: the prediction did not cover exactly the assessment's items. */
export class ItemCoverageError extends ApplicationError {
  constructor(
    readonly missing: Id[],
    readonly extra: Id[],
    readonly duplicated: boolean = false,
  ) {
    super(
      `prediction item coverage mismatch — missing: [${missing.join(", ")}], ` +
        `extra: [${extra.join(", ")}]${duplicated ? ", duplicate item predictions" : ""}`,
    );
    this.name = "ItemCoverageError";
  }
}

/** recordOutcome: the prediction was not registered strictly before the outcome. */
export class PredictionAfterOutcomeError extends ApplicationError {
  constructor(message: string) {
    super(message);
    this.name = "PredictionAfterOutcomeError";
  }
}

/** captureAffect: a snapshot that names zero states. */
export class EmptyAffectError extends ApplicationError {
  constructor() {
    super("affect snapshot must name at least one emotional state");
    this.name = "EmptyAffectError";
  }
}

/** submitReflection: attribution was not both specific and controllable. */
export class NonProductiveAttributionError extends ApplicationError {
  constructor() {
    super(
      "reflection requires a productive attribution (specific AND controllable)",
    );
    this.name = "NonProductiveAttributionError";
  }
}

/** captureAffect: the student has not granted (or has revoked) the affect scope. */
export class AffectConsentError extends ApplicationError {
  constructor(readonly studentId: Id) {
    super(
      `affect capture refused for ${studentId}: the affect consent scope is not granted`,
    );
    this.name = "AffectConsentError";
  }
}
