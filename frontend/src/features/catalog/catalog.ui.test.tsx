
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EquipmentCatalog } from './EquipmentCatalog';
import { request } from '../../lib/api-client';

vi.mock('../../lib/api-client', () => ({
  request: vi.fn()
}));

const mockedRequest = vi.mocked(request);

const laptop = {
  id: '31f81203-9156-4be0-8488-e72fdc734301',
  assetCode: 'BB-LAP-001',
  modelName: 'ThinkPad Laptop',
  category: 'Computers',
  serviceability: 'SERVICEABLE',
  available: true
};

const board = {
  id: '41f81203-9156-4be0-8488-e72fdc734301',
  assetCode: 'BB-RPI-001',
  modelName: 'Raspberry Pi Kit',
  category: 'Embedded',
  serviceability: 'MAINTENANCE',
  available: false
};

beforeEach(() => {
  mockedRequest.mockReset();
  window.location.hash = '';
});

describe('F-02 Equipment Catalog UI', () => {

  it('UI-01 displays loading and equipment records', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: [laptop, board]
    });

    render(<EquipmentCatalog canBorrow />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading equipment'
    );

    expect(
      await screen.findByRole('heading', {
        name: 'ThinkPad Laptop'
      })
    ).toBeInTheDocument();

    expect(
      screen.getByRole('heading', {
        name: 'Raspberry Pi Kit'
      })
    ).toBeInTheDocument();

    expect(mockedRequest).toHaveBeenCalledWith('/assets');
  });

  it('UI-02 shows correct availability states', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: [laptop, board]
    });

    render(<EquipmentCatalog canBorrow />);

    expect(
      await screen.findByText('Available')
    ).toBeInTheDocument();

    expect(
      screen.getByText('Unavailable')
    ).toBeInTheDocument();

    expect(
      screen.getByText('MAINTENANCE')
    ).toBeInTheDocument();
  });

  it('UI-03 shows an empty equipment message', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: []
    });

    render(<EquipmentCatalog canBorrow />);

    expect(
      await screen.findByText(
        'No equipment is currently listed.'
      )
    ).toBeInTheDocument();
  });

  it('UI-04 displays an API error', async () => {
    mockedRequest.mockRejectedValueOnce(
      new Error('Catalog temporarily unavailable')
    );

    render(<EquipmentCatalog canBorrow />);

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent('Catalog temporarily unavailable');

    expect(
      screen.queryByRole('heading', {
        name: 'ThinkPad Laptop'
      })
    ).not.toBeInTheDocument();
  });

  it('UI-05 opens and closes equipment details', async () => {
    mockedRequest
      .mockResolvedValueOnce({ items: [laptop] })
      .mockResolvedValueOnce(laptop);

    render(<EquipmentCatalog canBorrow />);

    await screen.findByRole('heading', {
      name: 'ThinkPad Laptop'
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'View Details'
      })
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Equipment Details'
      })
    ).toBeInTheDocument();

    expect(mockedRequest).toHaveBeenNthCalledWith(
      2,
      `/assets/${laptop.id}`
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Hide Details'
      })
    );

    expect(
      screen.queryByRole('heading', {
        name: 'Equipment Details'
      })
    ).not.toBeInTheDocument();
  });

  it('UI-06 refreshes the equipment list', async () => {
    mockedRequest
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [laptop] });

    render(<EquipmentCatalog canBorrow />);

    await screen.findByText(
      'No equipment is currently listed.'
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Refresh Equipment'
      })
    );

    expect(
      await screen.findByRole('heading', {
        name: 'ThinkPad Laptop'
      })
    ).toBeInTheDocument();

    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it('UI-07 borrower can request only available equipment', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: [laptop, board]
    });

    render(<EquipmentCatalog canBorrow />);

    await screen.findByRole('heading', {
      name: 'ThinkPad Laptop'
    });

    expect(
      screen.getByRole('button', {
        name: 'Request BB-LAP-001'
      })
    ).toBeInTheDocument();

    expect(
      screen.queryByRole('button', {
        name: 'Request BB-RPI-001'
      })
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Request BB-LAP-001'
      })
    );

    expect(
      window.location.hash.startsWith('#request?')
    ).toBe(true);

    const params = new URLSearchParams(
      window.location.hash.split('?')[1]
    );

    expect(params.get('assetId')).toBe(laptop.id);
    expect(params.get('assetCode')).toBe('BB-LAP-001');
    expect(params.get('modelName')).toBe('ThinkPad Laptop');
  });

  it('UI-08 custodian has no request equipment button', async () => {
    mockedRequest.mockResolvedValueOnce({
      items: [laptop, board]
    });

    render(<EquipmentCatalog canBorrow={false} />);

    await screen.findByRole('heading', {
      name: 'ThinkPad Laptop'
    });

    expect(
      screen.queryByRole('button', {
        name: /Request BB-/
      })
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByRole('button', {
        name: 'View Details'
      })
    ).toHaveLength(2);
  });

});
