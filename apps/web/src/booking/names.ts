import type { PartyRecord } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t } from '../messages/catalogue';
import { useMarkedAttribute } from '../merchandise/marked';
import { inForce, optionText } from '../receiving/names';
import { useGranted } from '../setup/parts';

// The names the booking screens show beside identifiers (goods-in 3.1, section 11; structure-and-masters 8;
// S2-F01-T03): brands, suppliers, Sites and seasons, read as the person may. A record the person may not read, or that
// is not on the list read, is Unknown (PRD-MOD-015; design-language 8), never its identifier: a field shows the word, a
// table cell stays blank, and while a list is still being read both stay blank.

/** Whether a party holds the supplier role in force today (structure-and-masters 5.1). */
function isSupplier(party: PartyRecord): boolean {
  return party.roles.some(
    (role) => role.role === 'supplier' && role.versions.some((version) => version.state === 'In force' && version.held),
  );
}

/** One list of records with their names, and whether it is still being read. */
interface Named {
  readonly id: string;
  readonly code: string;
  readonly versions: readonly { readonly state: string; readonly name?: string; readonly legalName?: string }[];
}

function lookup(records: readonly Named[] | undefined, reading: boolean) {
  return {
    /** "CODE · Name", or undefined while it is Unknown to the person or being read. */
    text: (id: string): string | undefined => {
      const found = records?.find((record) => record.id === id);
      return found === undefined ? undefined : optionText(found);
    },
    /** As a field shows it: the name, blank while being read, or the word Unknown. */
    field: (id: string): string => {
      const found = records?.find((record) => record.id === id);
      if (found !== undefined) return optionText(found);
      return reading ? '' : t('receive.unknown');
    },
  };
}

/** The lists the booking form chooses from, and the text of each record by its identifier. */
export function useBookingNames() {
  const brands = useQuery({
    ...readQuery(api, 'listBrands', { query: {} }),
    enabled: useGranted('merchandise.brand', 'view'),
  });
  const parties = useQuery({
    ...readQuery(api, 'listParties', { query: {} }),
    enabled: useGranted('merchandise.party', 'view'),
  });
  const sites = useQuery({
    ...readQuery(api, 'listSites', { query: {} }),
    enabled: useGranted('organisation.site', 'view'),
  });
  // The seasons are the values of the attribute the Organisation marks as its season (RR-550).
  const seasonMark = useMarkedAttribute('season');
  const values = useQuery({
    ...readQuery(api, 'listVocabularyValues', { query: {} }),
    enabled: useGranted('merchandise.vocabulary_value', 'view'),
  });
  const seasonAttributeId = seasonMark.kind === 'set' ? seasonMark.attributeId : undefined;
  // A query that is not enabled is pending but never read: it is Unknown, not being read.
  const reading = (query: { readonly isLoading: boolean }) => query.isLoading;
  return {
    brands: inForce(brands.data?.records),
    suppliers: inForce(parties.data?.records).filter(isSupplier),
    sites: inForce(sites.data?.records),
    seasons: inForce(values.data?.records).filter((value) => value.attributeId === seasonAttributeId),
    seasonMarked: seasonMark.kind,
    brand: lookup(brands.data?.records, reading(brands)),
    party: lookup(parties.data?.records, reading(parties)),
    site: lookup(sites.data?.records, reading(sites)),
    season: lookup(values.data?.records, reading(values)),
  };
}
