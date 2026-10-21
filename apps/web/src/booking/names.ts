import type { PartyRecord } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t } from '../messages/catalogue';
import { useMarkedAttribute } from '../merchandise/marked';
import { inForce, optionText, useMasterNames } from '../receiving/names';
import { useGranted } from '../setup/parts';

// The names the booking screens show beside identifiers (goods-in 3.1, section 11; structure-and-masters 8;
// S2-F01-T03): brands, suppliers, Sites and seasons, read as the person may. A record the person may not read, or that
// is not on the list read, is Unknown (PRD-MOD-015; design-language 8), never its identifier.

/** Whether a party holds the supplier role in force today (structure-and-masters 5.1). */
function isSupplier(party: PartyRecord): boolean {
  return party.roles.some(
    (role) => role.role === 'supplier' && role.versions.some((version) => version.state === 'In force' && version.held),
  );
}

/** The lists the booking form chooses from, and the text of each record by its identifier. */
export function useBookingNames() {
  const masters = useMasterNames();
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
  const siteRecords = sites.data?.records;
  const valueRecords = values.data?.records;
  return {
    brands: inForce(masters.brands),
    suppliers: inForce(masters.parties).filter(isSupplier),
    sites: inForce(siteRecords),
    seasons: inForce(valueRecords).filter((value) => value.attributeId === seasonAttributeId),
    seasonMarked: seasonMark.kind,
    brandText: masters.brandText,
    partyText: masters.partyText,
    siteText: (id: string) => {
      const found = siteRecords?.find((record) => record.id === id);
      return found === undefined ? undefined : optionText(found);
    },
    seasonText: (id: string) => {
      const found = valueRecords?.find((record) => record.id === id);
      return found === undefined ? undefined : optionText(found);
    },
  };
}

/** The word Unknown, as a field shows a record the person may not read (design-language 8). */
export const unknown = (): string => t('receive.unknown');
