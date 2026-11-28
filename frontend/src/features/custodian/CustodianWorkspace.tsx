
import { useEffect, useRef, useState } from 'react';
import { ApiError, request } from '../../lib/api-client';
import { useAuth } from '../auth/AuthProvider';
import './custodian.css';

type RequestStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED';

interface CustodianAsset {
  id: string;
  assetCode: string;
  modelName: string;
  category: string;
  serviceability: 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED';
  available: boolean;
}

interface CustodianRequest {
  id: string;
  borrower: {
    id: string;
    displayName: string;
  };
  status: RequestStatus;
  createdAt: string;
  fulfilledAt: string | null;
  asset: CustodianAsset;
}

interface CustodianLoan {
  id: string;
  borrowRequestId: string;
  borrower: {
    id: string;
    displayName: string;
  };
  asset: CustodianAsset;
  checkedOutAt: string;
}

interface CheckoutResult {
  request: CustodianRequest;
  loan: CustodianLoan;
}

type Filter = 'PENDING' | 'ALL';

function displayDate(value: string): string {
  return new Date(value).toLocaleString();
}

function messageFromError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Unable to complete this operation.';
}

export function CustodianWorkspace({ onReturned }: { onReturned?: () => void } = {}) {
  const { session, retry } = useAuth();

  const [filter, setFilter] = useState<Filter>('PENDING');
  const [requests, setRequests] = useState<CustodianRequest[]>([]);
  const [loans, setLoans] = useState<CustodianLoan[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [uncertainId, setUncertainId] = useState<string | null>(null);

  const [success, setSuccess] = useState<CheckoutResult | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  const checkoutInFlight = useRef(false);
  const returnInFlight = useRef(false);
  const [confirmReturnId, setConfirmReturnId] = useState<string | null>(null);
  const [returnId, setReturnId] = useState<string | null>(null);
  const [uncertainReturnId, setUncertainReturnId] = useState<string | null>(null);
  const [returnError, setReturnError] = useState('');
  const [returnSuccess, setReturnSuccess] = useState<CustodianLoan | null>(null);
  const confirmReturnButton = useRef<HTMLButtonElement>(null);
  const returnAlert = useRef<HTMLDivElement>(null);
  const loansHeading = useRef<HTMLHeadingElement>(null);
  const restoreReturnFocus = useRef<string | null>(null);

  useEffect(() => { if (confirmReturnId) confirmReturnButton.current?.focus(); }, [confirmReturnId]);
  useEffect(() => { if (returnError) returnAlert.current?.focus(); }, [returnError]);
  useEffect(() => { if (returnSuccess) loansHeading.current?.focus(); }, [returnSuccess]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setLoadError('');

    const requestPath =
      filter === 'PENDING'
        ? '/custodian/borrow-requests?status=PENDING'
        : '/custodian/borrow-requests';

    Promise.all([
      request<{ items: CustodianRequest[] }>(requestPath),
      request<{ items: CustodianLoan[] }>('/custodian/loans')
    ])
      .then(([requestData, loanData]) => {
        if (!active) return;

        setRequests(requestData.items);
        setLoans(loanData.items);
      })
      .catch(error => {
        if (!active) return;

        if (error instanceof ApiError && error.status === 401) {
          retry();
        }

        setLoadError(messageFromError(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filter, refreshVersion]);

  function refresh() {
    if (checkoutInFlight.current || returnInFlight.current) return;

    setConfirmId(null);
    setUncertainId(null);
    setActionError('');
    setConfirmReturnId(null);
    setUncertainReturnId(null);
    setReturnError('');
    setRefreshVersion(version => version + 1);
  }

  async function checkout(requestId: string) {
    if (
      checkoutInFlight.current || returnInFlight.current ||
      uncertainId === requestId
    ) {
      return;
    }

    checkoutInFlight.current = true;

    setCheckoutId(requestId);
    setConfirmId(null);
    setActionError('');
    setSuccess(null);

    try {
      const result = await request<CheckoutResult>(
        `/custodian/borrow-requests/${encodeURIComponent(requestId)}/checkout`,
        {
          body: {},
          csrf: session?.csrfToken
        }
      );

      setSuccess(result);
      setRefreshVersion(version => version + 1);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        retry();
      }

      const uncertain =
        !(error instanceof ApiError) ||
        error.status === 0 ||
        error.status >= 500;

      if (uncertain) {
        setUncertainId(requestId);
      }

      setActionError(
        messageFromError(error) +
        (uncertain
          ? ' The checkout result is uncertain. Refresh and review the request and active Loans before trying again.'
          : '')
      );
    } finally {
      checkoutInFlight.current = false;
      setCheckoutId(null);
    }
  }

  async function returnLoan(loanId: string) {
    if (checkoutInFlight.current || returnInFlight.current || uncertainReturnId === loanId) return;
    returnInFlight.current = true;
    setReturnId(loanId);
    setReturnError('');
    setReturnSuccess(null);
    setSuccess(null);
    try {
      const result = await request<CustodianLoan>(
        `/custodian/loans/${encodeURIComponent(loanId)}/return`,
        { body: {}, csrf: session?.csrfToken }
      );
      setConfirmReturnId(null);
      setReturnSuccess(result);
      setRefreshVersion(version => version + 1);
      onReturned?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) retry();
      const uncertain = !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
      if (uncertain) setUncertainReturnId(loanId);
      setConfirmReturnId(null);
      setReturnError(messageFromError(error) + (uncertain
        ? ' The return result is uncertain. Refresh records and review the Loan before trying again.' : ''));
    } finally {
      returnInFlight.current = false;
      setReturnId(null);
    }
  }

  const busy = checkoutId !== null || returnId !== null;

  return (
    <section
      className="custodian-workspace"
      aria-labelledby="custodian-heading"
    >
      <header className="custodian-header">
        <div>
          <h2 id="custodian-heading">Custodian Workspace</h2>
          <p>
            Review borrowing requests, check out equipment
            and monitor active Loans.
          </p>
        </div>

        <button
          type="button"
          className="custodian-button"
          onClick={refresh}
          disabled={busy || loading}
        >
          Refresh records
        </button>
      </header>

      {success && (
        <div className="custodian-success" role="status">
          <strong>Checkout successful</strong>
          <p>
            {success.request.asset.assetCode} was checked out
            to {success.request.borrower.displayName}.
          </p>
          <p className="custodian-record-id">
            Request: {success.request.id}
          </p>
          <p className="custodian-record-id">
            Active Loan: {success.loan.id}
          </p>
        </div>
      )}

      {returnSuccess && (
        <div className="custodian-success" role="status">
          <strong>Return successful</strong>
          <p>{returnSuccess.asset.assetCode} was returned by {returnSuccess.borrower.displayName}.</p>
        </div>
      )}
      {returnError && (
        <div className="custodian-error" role="alert" ref={returnAlert} tabIndex={-1}>
          <strong>Return could not be confirmed</strong>
          <p>{returnError}</p>
        </div>
      )}

      {actionError && (
        <div className="custodian-error" role="alert">
          <strong>Checkout could not be confirmed</strong>
          <p>{actionError}</p>
        </div>
      )}

      <section
        className="custodian-section"
        aria-labelledby="queue-heading"
      >
        <div className="custodian-section-header">
          <div>
            <h3 id="queue-heading">Borrowing Requests</h3>
            <p>
              Review requests and select eligible equipment
              for checkout.
            </p>
          </div>

          <div
            className="custodian-filters"
            role="group"
            aria-label="Request status filter"
          >
            <button
              type="button"
              className={filter === 'PENDING' ? 'selected' : ''}
              aria-pressed={filter === 'PENDING'}
              onClick={() => setFilter('PENDING')}
              disabled={busy}
            >
              Pending
            </button>

            <button
              type="button"
              className={filter === 'ALL' ? 'selected' : ''}
              aria-pressed={filter === 'ALL'}
              onClick={() => setFilter('ALL')}
              disabled={busy}
            >
              All requests
            </button>
          </div>
        </div>

        {loading && (
          <p role="status" className="custodian-muted">
            Loading Custodian records...
          </p>
        )}

        {loadError && (
          <div className="custodian-error" role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              className="custodian-button"
              onClick={refresh}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && requests.length === 0 && (
          <div className="custodian-empty">
            <p>
              {filter === 'PENDING'
                ? 'No pending requests.'
                : 'No borrowing requests found.'}
            </p>
          </div>
        )}

        {!loading && !loadError && requests.length > 0 && (
          <div className="custodian-grid">
            {requests.map(item => {
              const eligible =
                item.status === 'PENDING' &&
                item.asset.available;

              const confirming = confirmId === item.id;
              const checkingOut = checkoutId === item.id;
              const uncertain = uncertainId === item.id;

              return (
                <article
                  className="custodian-card"
                  key={item.id}
                >
                  <div className="custodian-card-header">
                    <div>
                      <h4>{item.asset.assetCode}</h4>
                      <p>{item.asset.modelName}</p>
                    </div>

                    <span
                      className={
                        `custodian-status ${item.status.toLowerCase()}`
                      }
                    >
                      {item.status}
                    </span>
                  </div>

                  <dl className="custodian-details">
                    <div>
                      <dt>Borrower</dt>
                      <dd>{item.borrower.displayName}</dd>
                    </div>

                    <div>
                      <dt>Category</dt>
                      <dd>{item.asset.category}</dd>
                    </div>

                    <div>
                      <dt>Requested</dt>
                      <dd>
                        <time dateTime={item.createdAt}>
                          {displayDate(item.createdAt)}
                        </time>
                      </dd>
                    </div>

                    <div>
                      <dt>Serviceability</dt>
                      <dd>{item.asset.serviceability}</dd>
                    </div>

                    <div>
                      <dt>Availability</dt>
                      <dd>
                        {item.asset.available
                          ? 'Available'
                          : 'Unavailable'}
                      </dd>
                    </div>

                    {item.fulfilledAt && (
                      <div>
                        <dt>Fulfilled</dt>
                        <dd>
                          <time dateTime={item.fulfilledAt}>
                            {displayDate(item.fulfilledAt)}
                          </time>
                        </dd>
                      </div>
                    )}
                  </dl>

                  <p className="custodian-record-id">
                    Request ID: {item.id}
                  </p>

                  {item.status === 'PENDING' && (
                    <div className="custodian-actions">
                      {confirming ? (
                        <>
                          <p className="custodian-confirm-text">
                            Confirm checkout of {item.asset.assetCode}
                            {' '}to {item.borrower.displayName}?
                          </p>

                          <button
                            type="button"
                            className="custodian-primary"
                            onClick={() => void checkout(item.id)}
                            disabled={busy || uncertain}
                          >
                            Confirm checkout
                          </button>

                          <button
                            type="button"
                            className="custodian-button"
                            onClick={() => setConfirmId(null)}
                            disabled={busy}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="custodian-primary"
                          onClick={() => {
                            setActionError('');
                            setConfirmId(item.id);
                          }}
                          disabled={
                            busy ||
                            loading ||
                            !eligible ||
                            uncertain
                          }
                        >
                          {checkingOut
                            ? 'Checking out...'
                            : eligible
                              ? 'Checkout'
                              : 'Checkout unavailable'}
                        </button>
                      )}

                      {!eligible && (
                        <p className="custodian-muted">
                          This request cannot be checked out
                          until the equipment is available.
                        </p>
                      )}

                      {uncertain && (
                        <p className="custodian-muted">
                          Review the latest request and Loan
                          state before another attempt.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="custodian-section"
        aria-labelledby="loans-heading"
      >
        <div className="custodian-section-header">
          <div>
            <h3 id="loans-heading" ref={loansHeading} tabIndex={-1}>Active Loans</h3>
            <p>
              Equipment currently checked out to Borrowers.
            </p>
          </div>
        </div>

        {!loading && !loadError && loans.length === 0 && (
          <div className="custodian-empty">
            <p>No active Loans.</p>
          </div>
        )}

        {!loading && !loadError && loans.length > 0 && (
          <ul className="custodian-loan-list">
            {loans.map(loan => (
              <li key={loan.id} className="custodian-loan">
                <div>
                  <strong>{loan.asset.assetCode}</strong>
                  <p>{loan.asset.modelName}</p>
                  <p>
                    Borrower: {loan.borrower.displayName}
                  </p>
                  <p>
                    Checked out:{' '}
                    <time dateTime={loan.checkedOutAt}>
                      {displayDate(loan.checkedOutAt)}
                    </time>
                  </p>
                  <p className="custodian-record-id">
                    Loan ID: {loan.id}
                  </p>
                </div>

                <div className="custodian-actions" aria-busy={returnId === loan.id}>
                  <span className="custodian-status active">Active</span>
                  {confirmReturnId === loan.id ? (
                    <>
                      <p>Confirm return of {loan.asset.assetCode} ({loan.asset.modelName}) from {loan.borrower.displayName}, checked out {displayDate(loan.checkedOutAt)}?</p>
                      <button type="button" className="custodian-primary" ref={confirmReturnButton}
                        disabled={busy} onClick={() => void returnLoan(loan.id)}>
                        {returnId === loan.id ? 'Returning...' : 'Confirm return'}
                      </button>
                      <button type="button" className="custodian-button" disabled={busy} onClick={() => {
                        restoreReturnFocus.current = loan.id;
                        setConfirmReturnId(null);
                      }}>Cancel</button>
                    </>
                  ) : (
                    <button type="button" className="custodian-primary"
                      ref={node => {
                        if (node && restoreReturnFocus.current === loan.id) {
                          node.focus(); restoreReturnFocus.current = null;
                        }
                      }}
                      disabled={busy || loading || uncertainReturnId === loan.id}
                      onClick={() => { setConfirmId(null); setActionError(''); setReturnError(''); setConfirmReturnId(loan.id); }}>
                      Return
                    </button>
                  )}
                  {uncertainReturnId === loan.id && <p>Refresh records to confirm the Loan state before another return attempt.</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
