import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t } from '../messages/catalogue';
import { useGranted } from '../setup/parts';

// The names Receive Goods shows beside identifiers: brands and suppliers from merchandise, read as the person may
// (structure-and-masters 8; goods-in 11; S2-F02-T02). A record the person may not read shows its identifier.

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

/** Brands and parties, and the text of either by its identifier. */
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
    return found === undefined ? id : optionText(found);
  };
  return {
    brands: brands.data?.records,
    parties: parties.data?.records,
    brandText: (id: string) => textOf(brands.data?.records, id),
    partyText: (id: string) => textOf(parties.data?.records, id),
  };
}
