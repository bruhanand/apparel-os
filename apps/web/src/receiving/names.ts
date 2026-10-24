import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t } from '../messages/catalogue';
import { useGranted } from '../setup/parts';

// The names Receive Goods shows beside identifiers: brands, suppliers and products from merchandise, read as the
// person may (structure-and-masters 8; goods-in 11; S2-F02-T02). A record the person may not read, or that is not on
// the list read, is Unknown (PRD-MOD-015; design-language 8), never its identifier.

interface Named {
  readonly id: string;
  readonly code: string;
  readonly versions: readonly { readonly state: string; readonly name?: string; readonly legalName?: string }[];
}

/** "CODE · Name" of the version in force, or the code alone. */
export function optionText(record: Named): string {
  const inForce = record.versions.find((version) => version.state === 'In force');
  const name = inForce?.name ?? inForce?.legalName;
  return name === undefined ? record.code : t('receive.option', { code: record.code, name });
}

/** The records in force. */
export function inForce<T extends Named>(records: readonly T[] | undefined): T[] {
  return (records ?? []).filter((record) => record.versions.some((version) => version.state === 'In force'));
}

/** The word Unknown, as a field or a record shows it (design-language 8). */
export const unknownText = (): string => t('receive.unknown');

/** A style code as the receiving screens compare it: ignoring case and spaces at the ends (goods-in 4.3). */
const styleKey = (code: string) => code.trim().toUpperCase();

/**
 * Brands and parties, and the text of either by its identifier; undefined when it is Unknown to the person, so a field
 * shows the word and a table cell stays blank (design-language 8).
 */
export function useMasterNames() {
  const brands = useQuery({
    ...readQuery(api, 'listBrands', { query: {} }),
    enabled: useGranted('merchandise.brand', 'view'),
  });
  const parties = useQuery({
    ...readQuery(api, 'listParties', { query: {} }),
    enabled: useGranted('merchandise.party', 'view'),
  });
  const textOf = (records: readonly Named[] | undefined, id: string) => {
    const found = records?.find((record) => record.id === id);
    return found === undefined ? undefined : optionText(found);
  };
  return {
    brands: brands.data?.records,
    parties: parties.data?.records,
    brandText: (id: string) => textOf(brands.data?.records, id),
    partyText: (id: string) => textOf(parties.data?.records, id),
  };
}

/**
 * The products a count line may name (goods-in 4.3): the SKUs of the Arrival's brand whose style has the line's style
 * code, and the code of a SKU by its identifier, undefined when it is Unknown to the person.
 */
export function useProducts() {
  const styles = useQuery({
    ...readQuery(api, 'listStyles', { query: {} }),
    enabled: useGranted('merchandise.style', 'view'),
  });
  const skus = useQuery({
    ...readQuery(api, 'listSkus', { query: {} }),
    enabled: useGranted('merchandise.sku', 'view'),
  });
  return {
    of: (brandId: string, styleCode: string) => {
      const styleIds = new Set(
        (styles.data?.records ?? [])
          .filter((style) => style.brandId === brandId && styleKey(style.code) === styleKey(styleCode))
          .map((style) => style.id),
      );
      return (skus.data?.records ?? []).filter((sku) => styleIds.has(sku.styleId));
    },
    skuText: (id: string) => skus.data?.records.find((sku) => sku.id === id)?.code,
  };
}
