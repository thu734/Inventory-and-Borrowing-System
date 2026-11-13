
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '../../lib/api-client';
import { CustodianWorkspace } from './CustodianWorkspace';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  retry: vi.fn()
}));

vi.mock('../../lib/api-client', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../lib/api-client')>();

  return {
    ...actual,
    request: mocks.request
  };
});

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({
    session: {
      user: {
        id: 'custodian-1',
        displayName: 'Demo Custodian',
        role: 'CUSTODIAN'
      },
      csrfToken: 'f04-ui-csrf'
    },
    retry: mocks.retry
  })
}));

const id = '31f81203-9156-4be0-8488-e72fdc734301';
const loanId = '51f81203-9156-4be0-8488-e72fdc734301';
const base = '/custodian/borrow-requests';

const pending = {
  id,
  borrower: {
    id: 'borrower-1',
    displayName: 'Demo Borrower'
  },
  status: 'PENDING',
  createdAt: '2026-11-12T09:00:00.000Z',
  fulfilledAt: null,
  asset: {
    id: '41f81203-9156-4be0-8488-e72fdc734301',
    assetCode: 'BB-LAP-001',
    modelName: 'ThinkPad Laptop',
    category: 'Computers',
    serviceability: 'SERVICEABLE',
    available: true
  }
};

const fulfilled = {
  ...pending,
  status: 'FULFILLED',
  fulfilledAt: '2026-11-12T10:00:00.000Z',
  asset: {
    ...pending.asset,
    available: false
  }
};

const loan = {
  id: loanId,
  borrowRequestId: id,
  borrower: pending.borrower,
  asset: fulfilled.asset,
  checkedOutAt: '2026-11-12T10:00:00.000Z'
};

let checkedOut = false;

async function standardResponse(path: string) {
  if (path === `${base}?status=PENDING`) {
    return {
      items: checkedOut ? [] : [pending]
    };
  }

  if (path === base) {
    return {
      items: checkedOut ? [fulfilled] : [pending]
    };
  }

  if (path === '/custodian/loans') {
    return {
      items: checkedOut ? [loan] : []
    };
  }

  if (path === `${base}/${id}/checkout`) {
    checkedOut = true;

    return {
      request: fulfilled,
      loan
    };
  }

  throw new Error(`Unexpected API path: ${path}`);
}

function apiFailure(status: number, message: string) {
  const error = new Error(message);

  Object.setPrototypeOf(error, ApiError.prototype);

  return Object.assign(error, { status });
}

beforeEach(() => {
  checkedOut = false;
  mocks.request.mockReset();
  mocks.retry.mockReset();
  mocks.request.mockImplementation(standardResponse);
});

describe('F-04 Custodian Workspace', () => {
  it('UI-F04-01 displays pending requests', async () => {
    render(<CustodianWorkspace />);

    expect(
      await screen.findByRole('button', { name: 'Checkout' })
    ).toBeDefined();

    expect(screen.getByText('BB-LAP-001')).toBeDefined();
    expect(screen.getByText('Demo Borrower')).toBeDefined();
    expect(screen.getByText('No active Loans.')).toBeDefined();
  });

  it('UI-F04-02 displays loading state', () => {
    mocks.request.mockImplementation(
      () => new Promise(() => {})
    );

    render(<CustodianWorkspace />);

    expect(
      screen.getByText('Loading Custodian records...')
    ).toBeDefined();
  });

  it('UI-F04-03 displays empty states', async () => {
    mocks.request.mockImplementation(async () => ({
      items: []
    }));

    render(<CustodianWorkspace />);

    expect(
      await screen.findByText('No pending requests.')
    ).toBeDefined();

    expect(
      screen.getByText('No active Loans.')
    ).toBeDefined();
  });

  it('UI-F04-04 switches between Pending and All requests', async () => {
    checkedOut = true;

    render(<CustodianWorkspace />);

    expect(
      await screen.findByText('No pending requests.')
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', { name: 'All requests' })
    );

    expect(
      await screen.findByText('FULFILLED')
    ).toBeDefined();

    expect(mocks.request).toHaveBeenCalledWith(base);
  });

  it('UI-F04-05 confirms checkout and refreshes active Loans', async () => {
    render(<CustodianWorkspace />);

    const checkout = await screen.findByRole('button', {
      name: 'Checkout'
    });

    fireEvent.click(checkout);

    expect(
      screen.getByText(/Confirm checkout of BB-LAP-001/)
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm checkout'
      })
    );

    expect(
      await screen.findByText('Checkout successful')
    ).toBeDefined();

    await waitFor(() => {
      expect(
        screen.getByText('No pending requests.')
      ).toBeDefined();
    });

    expect(
      screen.getByText(`Loan ID: ${loanId}`)
    ).toBeDefined();

    expect(mocks.request).toHaveBeenCalledWith(
      `${base}/${id}/checkout`,
      {
        body: {},
        csrf: 'f04-ui-csrf'
      }
    );
  });

  it('UI-F04-06 disables checkout for unavailable assets', async () => {
    const unavailable = {
      ...pending,
      asset: {
        ...pending.asset,
        serviceability: 'MAINTENANCE',
        available: false
      }
    };

    mocks.request.mockImplementation(async (path: string) => {
      if (path.includes('borrow-requests')) {
        return { items: [unavailable] };
      }

      return { items: [] };
    });

    render(<CustodianWorkspace />);

    const button = await screen.findByRole('button', {
      name: 'Checkout unavailable'
    });

    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('UI-F04-07 displays a checkout conflict', async () => {
    mocks.request.mockImplementation(async (path: string) => {
      if (path.endsWith('/checkout')) {
        throw apiFailure(
          409,
          'This asset is unavailable for checkout.'
        );
      }

      return standardResponse(path);
    });

    render(<CustodianWorkspace />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Checkout' })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm checkout'
      })
    );

    expect(
      await screen.findByText(
        'This asset is unavailable for checkout.'
      )
    ).toBeDefined();

    expect(
      screen.queryByText('Checkout successful')
    ).toBeNull();

    expect(checkedOut).toBe(false);
  });

  it('UI-F04-08 prevents retry after uncertain failure', async () => {
    mocks.request.mockImplementation(async (path: string) => {
      if (path.endsWith('/checkout')) {
        throw new Error('Network disconnected');
      }

      return standardResponse(path);
    });

    render(<CustodianWorkspace />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Checkout' })
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Confirm checkout'
      })
    );

    expect(
      await screen.findByText(/The checkout result is uncertain/)
    ).toBeDefined();

    await waitFor(() => {
      const button = screen.getByRole('button', {
        name: 'Checkout'
      });

      expect((button as HTMLButtonElement).disabled).toBe(true);
    });

    expect(
      mocks.request.mock.calls.filter(
        ([path]) => String(path).endsWith('/checkout')
      )
    ).toHaveLength(1);
  });

  it('UI-F04-09 recovers from a loading error', async () => {
    let failing = true;

    mocks.request.mockImplementation(async (path: string) => {
      if (failing) {
        throw new Error('Service unavailable');
      }

      return standardResponse(path);
    });

    render(<CustodianWorkspace />);

    expect(
      await screen.findByText('Service unavailable')
    ).toBeDefined();

    failing = false;

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Try again'
      })
    );

    expect(
      await screen.findByRole('button', {
        name: 'Checkout'
      })
    ).toBeDefined();
  });
});
