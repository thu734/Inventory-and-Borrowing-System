
export interface AssetDTO {
  id: string;
  assetCode: string;
  modelName: string;
  category: string;
  serviceability: 'SERVICEABLE' | 'MAINTENANCE' | 'RETIRED';
  available: boolean;
}

export interface CatalogStore {
  list(): Promise<AssetDTO[]>;
  detail(id: string): Promise<AssetDTO | null>
  ;}

export function calculateAvailability(
  serviceability: AssetDTO['serviceability'],
  activeLoanCount: number
): boolean {
  return serviceability === 'SERVICEABLE' && activeLoanCount === 0;
}
