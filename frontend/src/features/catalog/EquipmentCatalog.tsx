
import { useEffect, useState } from 'react';
import { request } from '../../lib/api-client';
import { openBorrowRequest } from '../borrowing/BorrowerWorkspace';
import './catalog.css';

type Serviceability = 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED';

interface Asset {
  id: string;
  assetCode: string;
  modelName: string;
  category: string;
  serviceability: Serviceability;
  available: boolean;
}

interface AssetListResponse {
  items: Asset[];
}

export function EquipmentCatalog({ canBorrow }: { canBorrow: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const [selected, setSelected] = useState<Asset | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');

    request<AssetListResponse>('/assets')
      .then(data => {
        if (!cancelled) {
          setAssets(data.items);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load equipment.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function viewDetails(assetId: string) {
    if (detailLoading) return;

    if (selected?.id === assetId) {
      setSelected(null);
      setDetailError('');
      return;
    }

    setSelected(null);
    setDetailError('');
    setDetailLoading(true);

    try {
      const asset = await request<Asset>(
        `/assets/${encodeURIComponent(assetId)}`
      );

      setSelected(asset);
    } catch (err) {
      setDetailError(
        err instanceof Error
          ? err.message
          : 'Unable to load equipment details.'
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function reload() {
    setSelected(null);
    setDetailError('');
    setRefresh(value => value + 1);
  }

  return (
    <section className="equipment-catalog" aria-labelledby="catalog-title">
      <h2 id="catalog-title">Equipment Catalog</h2>

      <p className="muted">
        Browse department equipment and check its availability.
      </p>

      <button
        type="button"
        className="secondary-button"
        onClick={reload}
        disabled={loading || detailLoading}
      >
        Refresh Equipment
      </button>

      {loading && (
        <p role="status">Loading equipment...</p>
      )}

      {error && (
        <p role="alert" className="error">{error}</p>
      )}

      {!loading && !error && assets.length === 0 && (
        <p>No equipment is currently listed.</p>
      )}

      {!loading && !error && assets.length > 0 && (
        <ul className="equipment-list">
          {assets.map(asset => (
            <li key={asset.id} className="equipment-item">
              <h3>{asset.modelName}</h3>

              <p>
                <strong>Asset Code:</strong> {asset.assetCode}
              </p>

              <p>
                <strong>Category:</strong> {asset.category}
              </p>

              <p>
                <strong>Condition:</strong> {asset.serviceability}
              </p>

              <p>
                <strong>Availability:</strong>{' '}
                {asset.available ? 'Available' : 'Unavailable'}
              </p>

              <button
                type="button"
                className="secondary-button"
                onClick={() => void viewDetails(asset.id)}
                disabled={detailLoading}
              >
                {selected?.id === asset.id
                  ? 'Hide Details'
                  : 'View Details'}
              </button>

{canBorrow && asset.available && (
  <button
    type="button"
    className="primary-button"
    onClick={() =>
      openBorrowRequest({
        assetId: asset.id,
        assetCode: asset.assetCode,
        modelName: asset.modelName,
        category: asset.category
      })
    }
  >
    Request {asset.assetCode}
  </button>
)}

            </li>
          ))}
        </ul>
      )}

      {detailLoading && (
        <p role="status">Loading equipment details...</p>
      )}

      {detailError && (
        <p role="alert" className="error">{detailError}</p>
      )}

      {selected && (
        <section className="equipment-detail" aria-label="Equipment details">
          <h3>Equipment Details</h3>

          <p><strong>Model:</strong> {selected.modelName}</p>
          <p><strong>Asset Code:</strong> {selected.assetCode}</p>
          <p><strong>Category:</strong> {selected.category}</p>
          <p><strong>Condition:</strong> {selected.serviceability}</p>
          <p>
            <strong>Status:</strong>{' '}
            {selected.available ? 'Available' : 'Unavailable'}
          </p>
        </section>
      )}
    </section>
  );
}
