import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { failureBody, readQuery } from '../api/query';
import { codeText } from '../components/StandardStates';
import { t } from '../messages/catalogue';
import { useGranted } from '../setup/parts';

/**
 * An attribute's code and name (structure-and-masters 4.1, 4.2), as its option in a list reads. While it is being read
 * the cell stays blank; where it cannot be read, the reason it was refused shows instead (design-language 8,
 * `PRD-MOD-015`): an attribute is never called Unknown for being unread.
 */
export function AttributeName({ attributeId }: { attributeId: string }) {
  const granted = useGranted('merchandise.attribute', 'view');
  const query = useQuery({
    ...readQuery(api, 'readAttribute', { params: { recordId: attributeId } }),
    enabled: granted,
  });
  if (!granted) return <>{codeText('access.not-authorised')}</>;
  if (query.isPending) return <span aria-busy="true" />;
  if (query.isError) {
    const body = failureBody(query.error);
    return <>{body === null ? t('error-state.no-answer') : codeText(body.code)}</>;
  }
  const { record } = query.data;
  const name = record.versions.find((version) => version.state === 'In force')?.name ?? record.versions[0]?.name;
  return <>{t('budget.option', { code: record.code, name: typeof name === 'string' ? name : record.code })}</>;
}
