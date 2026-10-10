import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t } from '../messages/catalogue';
import { inputClass } from '../setup/parts';

// The book a finance screen shows (books-and-posting 2.1, 14): the accounting books of `organisation`, by code and
// name, as the reader may view them (structure-and-masters 3.2).

export function BookPicker({ value, onChange }: { value: string | null; onChange: (bookId: string | null) => void }) {
  const books = useQuery(readQuery(api, 'listAccountingBooks', { query: {} }));
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="finance-book" className="text-body-sm font-semibold">
        {t('finance.book')}
      </label>
      <select
        id="finance-book"
        className={inputClass}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      >
        <option value="">{t('finance.book.choose')}</option>
        {(books.data?.records ?? []).map((book) => (
          <option key={book.id} value={book.id}>
            {book.code} · {book.versions[0]?.name}
          </option>
        ))}
      </select>
    </div>
  );
}
