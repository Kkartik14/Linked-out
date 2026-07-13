import type { PipeTransform } from '@nestjs/common';
import type { FieldError, FieldErrorCode } from '@linkedout/contracts';
import type { ZodError, ZodType, infer as zInfer } from 'zod';

import { AppErrors, type AppException } from '../errors/app-exception';

type ZodIssueLike = ZodError['issues'][number];

function pathToField(path: ReadonlyArray<PropertyKey>): string {
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else {
      out += out.length > 0 ? `.${String(segment)}` : String(segment);
    }
  }
  return out;
}

function issueToCode(issue: ZodIssueLike): FieldErrorCode {
  switch (issue.code) {
    case 'invalid_type':
      return 'required';
    case 'too_small':
      return 'too_short';
    case 'too_big':
      return 'origin' in issue && issue.origin === 'array' ? 'too_many' : 'too_long';
    case 'invalid_value':
      return 'invalid_enum';
    case 'invalid_format':
      return 'format' in issue && issue.format === 'url' ? 'not_a_url' : 'invalid_format';
    default:
      return 'invalid_format';
  }
}

/**
 * For a strict-object rejection Zod reports the offending names in `issue.keys` with an empty
 * `path`; name them so the client sees the bad field instead of `field: ""`.
 */
function fieldForIssue(issue: ZodIssueLike): string {
  if (
    issue.code === 'unrecognized_keys' &&
    'keys' in issue &&
    Array.isArray(issue.keys) &&
    issue.keys.length > 0
  ) {
    return issue.keys.map((key) => String(key)).join(', ');
  }
  return pathToField(issue.path);
}

export function zodErrorToFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: fieldForIssue(issue),
    code: issueToCode(issue),
    message: issue.message,
  }));
}

interface ZodValidationPipeOptions {
  mapError?: (error: ZodError) => AppException | null;
}

/**
 * Validates a single controller argument against a Zod schema and returns the parsed,
 * fully-typed value. On failure throws the standard VALIDATION_ERROR envelope.
 */
export class ZodValidationPipe<TSchema extends ZodType> implements PipeTransform {
  constructor(
    private readonly schema: TSchema,
    private readonly options: ZodValidationPipeOptions = {},
  ) {}

  /** Exposes schema identity for the controller/OpenAPI contract parity gate. */
  get contractSchema(): TSchema {
    return this.schema;
  }

  transform(value: unknown): zInfer<TSchema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const mapped = this.options.mapError?.(result.error);
      if (mapped) throw mapped;
      throw AppErrors.validation(zodErrorToFieldErrors(result.error));
    }
    return result.data;
  }
}
