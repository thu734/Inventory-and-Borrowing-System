
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

import { createApp, finishApp } from '../src/app.ts';
import { hashPassword } from '../src/modules/auth/credentials.ts';
import { MemoryAuthStore } from './helpers/memory-auth-store.ts';

import { mountCustodianRoutes } from '../src/modules/custodian/custodian.routes.ts';
import type {
  CustodianStore,
  CustodianRequestDTO,
  CustodianLoanDTO
} from '../src/modules/custodian/custodian.store.ts';

const origin = 'http://localhost:5173';
const password = 'synthetic-f04-api-password';

const requestId = '31f81203-9156-4be0-8488-e72fdc734301';
const assetId = '41f81203-9156-4be0-8488-e72fdc734301';
const loanId = '51f81203-9156-4be0-8488-e72fdc734301';

const pendingRequest: CustodianRequestDTO = {
  id: requestId,
  borrower: {
    id: 'borrower-1',
    displayName: 'Demo Borrower'
  },
  status: 'PENDING',
  createdAt: '2026-11-12T09:00:00.000Z',
  fulfilledAt: null,
  asset: {
    id: assetId,
    assetCode: 'BB-LAP-001',
    modelName: 'ThinkPad Laptop',
    category: 'Computers',
    serviceability: 'SERVICEABLE',
    available: true
  }
};

const fulfilledRequest: CustodianRequestDTO = {
  ...pendingRequest,
  status: 'FULFILLED',
  fulfilledAt: '2026-11-12T10:00:00.000Z',
  asset: {
    ...pendingRequest.asset,
    available: false
  }
};

const activeLoan: CustodianLoanDTO = {
  id: loanId,
  borrowRequestId: requestId,
  borrower: {
    id: 'borrower-1',
    displayName: 'Demo Borrower'
  },
  asset: {
    ...pendingRequest.asset,
    available: false
  },
  checkedOutAt: '2026-11-12T10:00:00.000Z'
};

describe('F-04 Custodian API security and behavior', () => {
  let passwordHash: string;
  let authStore: MemoryAuthStore;
  let custodianStore: CustodianStore;
  let app: ReturnType<typeof finishApp>;

  beforeAll(async () => {
    passwordHash = await hashPassword(password);
  });

  beforeEach(() => {
    authStore = new MemoryAuthStore();

    authStore.users.set('borrower-1', {
      id: 'borrower-1',
      normalizedEmail: 'borrower@example.test',
      displayName: 'Demo Borrower',
      passwordHash,
      role: 'BORROWER',
      isActive: true
    });

    authStore.users.set('custodian-1', {
      id: 'custodian-1',
      normalizedEmail: 'custodian@example.test',
      displayName: 'Demo Custodian',
      passwordHash,
      role: 'CUSTODIAN',
      isActive: true
    });

    custodianStore = {
      requests: vi.fn(async status => {
        const items = [pendingRequest, fulfilledRequest];

        return status
          ? items.filter(item => item.status === status)
          : items;
      }),

      request: vi.fn(async id => {
        return id === requestId ? pendingRequest : null;
      }),

      loans: vi.fn(async () => [activeLoan]),

      checkout: vi.fn(async () => ({
        request: fulfilledRequest,
        loan: activeLoan
      }))
    };

    const auth = createApp({
      store: authStore,
      origin,
      csrfSecret: 'f04-test-only-secret-with-at-least-32-bytes',
      secureCookies: false
    });

    mountCustodianRoutes(auth, custodianStore);
    app = finishApp(auth.app);
  });

  async function login(role: 'BORROWER' | 'CUSTODIAN') {
    const agent = request.agent(app);

    const response = await agent
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({
        email: `${role.toLowerCase()}@example.test`,
        password
      });

    expect(response.status).toBe(200);

    return {
      agent,
      csrf: response.body.data.csrfToken as string
    };
  }

  it('TEST-F04-01 lists all requests for a Custodian', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent.get(
      '/api/v1/custodian/borrow-requests'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(2);

    expect(response.body.data.items[0]).toMatchObject({
      id: requestId,
      status: 'PENDING',
      borrower: {
        id: 'borrower-1',
        displayName: 'Demo Borrower'
      }
    });

    expect(custodianStore.requests).toHaveBeenCalledWith(
      undefined
    );
  });

  it('TEST-F04-01 filters the pending queue', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent.get(
      '/api/v1/custodian/borrow-requests?status=PENDING'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].status).toBe('PENDING');

    expect(custodianStore.requests).toHaveBeenCalledWith(
      'PENDING'
    );
  });

  it('TEST-F04-01 retrieves request details', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent.get(
      `/api/v1/custodian/borrow-requests/${requestId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: requestId,
      status: 'PENDING',
      asset: {
        id: assetId,
        assetCode: 'BB-LAP-001'
      }
    });
  });

  it('TEST-F04-01 lists active Loans', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent.get(
      '/api/v1/custodian/loans'
    );

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);

    expect(response.body.data.items[0]).toMatchObject({
      id: loanId,
      borrowRequestId: requestId
    });
  });

  it('TEST-F04-02 rejects unauthenticated access', async () => {
    const paths = [
      '/api/v1/custodian/borrow-requests',
      `/api/v1/custodian/borrow-requests/${requestId}`,
      '/api/v1/custodian/loans'
    ];

    for (const path of paths) {
      const response = await request(app).get(path);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(
        'UNAUTHENTICATED'
      );
    }

    const checkout = await request(app)
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .send({});

    expect(checkout.status).toBe(401);
    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-02 blocks Borrower access', async () => {
    const { agent, csrf } = await login('BORROWER');

    const list = await agent.get(
      '/api/v1/custodian/borrow-requests'
    );

    const loans = await agent.get(
      '/api/v1/custodian/loans'
    );

    const checkout = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({});

    for (const response of [list, loans, checkout]) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    }

    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-02 blocks an inactive Custodian', async () => {
    const { agent } = await login('CUSTODIAN');

    authStore.users.get('custodian-1')!.isActive = false;

    const response = await agent.get(
      '/api/v1/custodian/borrow-requests'
    );

    expect(response.status).toBe(401);
  });

  it('TEST-F04-03 performs an authorized checkout', async () => {
    const { agent, csrf } = await login('CUSTODIAN');

    const response = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(response.status).toBe(201);

    expect(response.body.data.request).toMatchObject({
      id: requestId,
      status: 'FULFILLED'
    });

    expect(response.body.data.loan).toMatchObject({
      id: loanId,
      borrowRequestId: requestId
    });

    expect(custodianStore.checkout).toHaveBeenCalledWith(
      requestId,
      'custodian-1'
    );
  });

  it('TEST-F04-08 rejects invalid query parameters', async () => {
    const { agent } = await login('CUSTODIAN');

    const invalid = await agent.get(
      '/api/v1/custodian/borrow-requests?status=INVALID'
    );

    const extra = await agent.get(
      '/api/v1/custodian/borrow-requests?sort=asc'
    );

    const loans = await agent.get(
      '/api/v1/custodian/loans?status=PENDING'
    );

    expect(invalid.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(loans.status).toBe(400);

    expect(custodianStore.requests).not.toHaveBeenCalled();
  });

  it('TEST-F04-08 rejects invalid request IDs', async () => {
    const { agent, csrf } = await login('CUSTODIAN');

    const detail = await agent.get(
      '/api/v1/custodian/borrow-requests/invalid-id'
    );

    expect(detail.status).toBe(400);

    const checkout = await agent
      .post(
        '/api/v1/custodian/borrow-requests/invalid-id/checkout'
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(checkout.status).toBe(400);
    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-08 returns 404 for an unknown request', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent.get(
      '/api/v1/custodian/borrow-requests/61f81203-9156-4be0-8488-e72fdc734301'
    );

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('TEST-F04-08 rejects a foreign Origin', async () => {
    const { agent, csrf } = await login('CUSTODIAN');

    const response = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', 'https://foreign.example')
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(
      'ORIGIN_FORBIDDEN'
    );

    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-08 rejects a missing CSRF token', async () => {
    const { agent } = await login('CUSTODIAN');

    const response = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', origin)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe(
      'CSRF_FORBIDDEN'
    );

    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-08 blocks client-supplied identity fields', async () => {
    const { agent, csrf } = await login('CUSTODIAN');

    const response = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({
        borrowerId: 'forged-borrower',
        assetId: 'forged-asset'
      });

    expect(response.status).toBe(400);
    expect(custodianStore.checkout).not.toHaveBeenCalled();
  });

  it('TEST-F04-08 sanitizes unexpected database errors', async () => {
    const { agent, csrf } = await login('CUSTODIAN');

    vi.spyOn(custodianStore, 'checkout')
      .mockRejectedValueOnce(
        new Error('SQL secret password=do-not-expose')
      );

    const response = await agent
      .post(
        `/api/v1/custodian/borrow-requests/${requestId}/checkout`
      )
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({});

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');

    expect(JSON.stringify(response.body)).not.toContain(
      'SQL secret'
    );

    expect(JSON.stringify(response.body)).not.toContain(
      'do-not-expose'
    );
  });
});
