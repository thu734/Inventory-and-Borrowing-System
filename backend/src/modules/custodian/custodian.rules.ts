
import { ApiError } from '../../app.ts';

type RequestStatus = 'PENDING' | 'FULFILLED';

type Serviceability =
  | 'SERVICEABLE'
  | 'MAINTENANCE'
  | 'RETIRED';

export function assertCheckoutEligible(
  status: RequestStatus,
  serviceability: Serviceability,
  hasActiveLoan: boolean
): void {
  if (status !== 'PENDING') {
    throw new ApiError(
      409,
      'REQUEST_NOT_PENDING',
      'Request is no longer pending.'
    );
  }

  if (serviceability !== 'SERVICEABLE' || hasActiveLoan) {
    throw new ApiError(
      409,
      'ASSET_UNAVAILABLE',
      'This asset is unavailable for checkout.'
    );
  }
}
