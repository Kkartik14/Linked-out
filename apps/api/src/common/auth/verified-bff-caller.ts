import type { BffCallerPurpose } from '@linkedout/internal-auth';
import type { Request } from 'express';

const VERIFIED_BFF_CALLER = Symbol('verified-bff-caller');

type VerifiedBffCallerRequest = Request & {
  [VERIFIED_BFF_CALLER]?: BffCallerPurpose;
};

/** Records caller authentication only after cryptographic verification in the guard. */
export function markVerifiedBffCaller(request: Request, purpose: BffCallerPurpose): void {
  (request as VerifiedBffCallerRequest)[VERIFIED_BFF_CALLER] = purpose;
}

/** HTTP input cannot forge this process-local symbol. */
export function verifiedBffCallerPurpose(request: Request): BffCallerPurpose | undefined {
  return (request as VerifiedBffCallerRequest)[VERIFIED_BFF_CALLER];
}
