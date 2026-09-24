import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Only 'date' and 'price' are offered -- the backend's `sort=relevance`
 * throws NotImplementedError (event.service.ts listEvents). */
export type EventSort = 'date' | 'price';

/** Mirrors event.validation.ts's listEventsSchema query fields, minus the
 * ones Discovery's filter UI doesn't expose (q, venueId, status, limit, cursor). */
export interface EventFilters {
  city?: string;
  state?: string;
  startsAfter?: string;
  startsBefore?: string;
  genreId?: string;
  ageRestriction?: string;
  priceMin?: number;
  priceMax?: number;
  sort?: EventSort;
}

export type FilterKey =
  | 'city'
  | 'state'
  | 'startsAfter'
  | 'startsBefore'
  | 'genreId'
  | 'ageRestriction'
  | 'priceMin'
  | 'priceMax'
  | 'sort';

export type SetFilterFn = (key: FilterKey, value: string | number | undefined) => void;

/**
 * Discovery filters live in the URL (shareable/bookmarkable) rather than
 * component state.
 */
export function useEventFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: EventFilters = useMemo(() => {
    const result: EventFilters = {};
    const city = searchParams.get('city');
    if (city) result.city = city;
    const state = searchParams.get('state');
    if (state) result.state = state;
    const startsAfter = searchParams.get('startsAfter');
    if (startsAfter) result.startsAfter = startsAfter;
    const startsBefore = searchParams.get('startsBefore');
    if (startsBefore) result.startsBefore = startsBefore;
    const genreId = searchParams.get('genreId');
    if (genreId) result.genreId = genreId;
    const ageRestriction = searchParams.get('ageRestriction');
    if (ageRestriction) result.ageRestriction = ageRestriction;
    const priceMin = searchParams.get('priceMin');
    if (priceMin !== null && priceMin !== '') result.priceMin = Number(priceMin);
    const priceMax = searchParams.get('priceMax');
    if (priceMax !== null && priceMax !== '') result.priceMax = Number(priceMax);
    const sort = searchParams.get('sort');
    if (sort === 'date' || sort === 'price') result.sort = sort;
    return result;
  }, [searchParams]);

  function setFilter(key: FilterKey, value: string | number | undefined) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === undefined || value === '') {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
      return next;
    });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  function setSort(sort: EventSort | undefined) {
    setFilter('sort', sort);
  }

  return { filters, setFilter, clearFilters, setSort };
}
