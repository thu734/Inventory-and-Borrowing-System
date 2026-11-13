
import type { PrismaClient } from '@prisma/client';
import {
  calculateAvailability,
  type AssetDTO,
  type CatalogStore
} from './catalog.store.ts';

export class PrismaCatalogStore implements CatalogStore {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  private toDTO(asset: {
    id: string;
    assetCode: string;
    serviceability: AssetDTO['serviceability'];
    equipmentModel: {
      name: string;
      category: string;
    };
    loans: { id: string }[];
  }): AssetDTO {
    return {
      id: asset.id,
      assetCode: asset.assetCode,
      modelName: asset.equipmentModel.name,
      category: asset.equipmentModel.category,
      serviceability: asset.serviceability,
      available: calculateAvailability(
        asset.serviceability,
        asset.loans.length
      )
    };
  }

  async list(): Promise<AssetDTO[]> {
    const assets = await this.db.asset.findMany({
      select: {
        id: true,
        assetCode: true,
        serviceability: true,
        equipmentModel: {
          select: {
            name: true,
            category: true
          }
        },
        loans: {
          where: {
            returnedAt: null
          },
          select: {
            id: true
          }
        }
      },
      orderBy: {
        assetCode: 'asc'
      }
    });

    return assets.map(asset => this.toDTO(asset));
  }

  async detail(id: string): Promise<AssetDTO | null> {
    const asset = await this.db.asset.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        assetCode: true,
        serviceability: true,
        equipmentModel: {
          select: {
            name: true,
            category: true
          }
        },
        loans: {
          where: {
            returnedAt: null
          },
          select: {
            id: true
          }
        }
      }
    });

    if (!asset) {
      return null;
    }

    return this.toDTO(asset);
  }
}
