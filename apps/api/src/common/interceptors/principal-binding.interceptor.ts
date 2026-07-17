import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import {
  PRINCIPAL_BINDING_HEADER,
  principalBindingHeaderSchema,
} from '@linkedout/contracts';
import type { Observable } from 'rxjs';

import { AppErrors } from '../errors/app-exception';
import type { AuthedRequest } from '../types/auth';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HEADER_KEY = PRINCIPAL_BINDING_HEADER.toLowerCase();

/** Rejects a stale mutation when its render-time identity differs from the live credential. */
@Injectable()
export class PrincipalBindingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user || SAFE_METHODS.has(request.method.toUpperCase())) {
      return next.handle();
    }

    const declaredPrincipal = request.headers[HEADER_KEY];
    const parsed = principalBindingHeaderSchema.safeParse(declaredPrincipal);
    if (!parsed.success || parsed.data.toUpperCase() !== request.user.id.toUpperCase()) {
      throw AppErrors.principalMismatch();
    }
    return next.handle();
  }
}
