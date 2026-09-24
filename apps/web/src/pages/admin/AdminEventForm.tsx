import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { CreateAdminEventInput, EventStatus } from '@the-drop/types';
import { AdminArtistPicker, type AdminArtistPickerValue } from '../../components/admin/AdminArtistPicker';
import { AdminGenrePicker } from '../../components/admin/AdminGenrePicker';
import { VenuePicker, type VenuePickerValue } from '../../components/submissions/VenuePicker';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAdminEvent, useCreateEvent, useUpdateEvent } from '../../hooks/admin/useAdminEvents';
import { ApiRequestError } from '../../services/api';
import styles from './AdminEventForm.module.css';

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_AGE_RESTRICTION_LENGTH = 20;
const CREATE_STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED'];
// @the-drop/types ships a CommonJS build apps/web's Rollup bundler can't
// statically resolve runtime enum-array exports from (see AdminEvents.tsx for
// detail); mirrors admin-event.validation.ts updateAdminEventSchema's status enum.
const EDIT_STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'POSTPONED', 'COMPLETED'];

function emptyVenue(): VenuePickerValue {
  return { mode: 'search', venueId: null, venueNameRaw: '', venueAddressRaw: '' };
}

/** Converts an <input type="datetime-local"> value to an ISO string, or
 * undefined for a blank input. */
function toIso(localValue: string): string | undefined {
  if (!localValue) return undefined;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Converts an ISO string to the value <input type="datetime-local"> expects
 * (local time, no timezone/seconds). */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ZodIssueLike {
  path?: (string | number)[];
  message?: string;
}

function fieldErrors(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details.map((issue: ZodIssueLike) => {
    const field = issue.path?.join('.') ?? 'field';
    return `${field}: ${issue.message ?? 'invalid value'}`;
  });
}

/** Create (/admin/events/new) and edit (/admin/events/:id/edit) share one
 * form: edit mode pre-fills every field from useAdminEvent(id), including
 * artistIds/genreIds extracted from the full artists/genres arrays. */
export default function AdminEventForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = id !== undefined;
  const navigate = useNavigate();

  const { data: existing, isLoading: isLoadingExisting } = useAdminEvent(id);
  const { mutate: createEvent, isPending: isCreating, error: createError } = useCreateEvent();
  const { mutate: updateEvent, isPending: isUpdating, error: updateError } = useUpdateEvent(id ?? '');

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [venue, setVenue] = useState<VenuePickerValue>(emptyVenue());
  const [artists, setArtists] = useState<AdminArtistPickerValue[]>([]);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [status, setStatus] = useState<EventStatus>('DRAFT');
  const [ageRestriction, setAgeRestriction] = useState('');
  const [doorTime, setDoorTime] = useState('');
  const [reentryPolicy, setReentryPolicy] = useState('');
  const [bagPolicy, setBagPolicy] = useState('');
  const [prohibitedItems, setProhibitedItems] = useState('');
  const [dressCode, setDressCode] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setStartsAt(toLocalInput(existing.startsAt));
    setEndsAt(toLocalInput(existing.endsAt));
    setTimezone(existing.timezone);
    setVenue(
      existing.venue
        ? { mode: 'search', venueId: existing.venue.id, venueNameRaw: existing.venue.name, venueAddressRaw: '' }
        : emptyVenue(),
    );
    setArtists(existing.artists.map((artist) => ({ id: artist.id, name: artist.name })));
    setGenreIds(existing.genres.map((genre) => genre.id));
    setDescription(existing.description ?? '');
    setImageUrl(existing.imageUrl ?? '');
    setStatus(existing.status);
    setAgeRestriction(existing.ageRestriction ?? '');
    setDoorTime(existing.doorTime ?? '');
    setReentryPolicy(existing.reentryPolicy ?? '');
    setBagPolicy(existing.bagPolicy ?? '');
    setProhibitedItems(existing.prohibitedItems ?? '');
    setDressCode(existing.dressCode ?? '');
  }, [existing]);

  if (isEdit && isLoadingExisting) {
    return <LoadingSpinner size="lg" />;
  }
  if (isEdit && !isLoadingExisting && !existing) {
    return <EmptyState title="Event not found" description="It may have been deleted." />;
  }

  const isPending = isCreating || isUpdating;
  const error = isEdit ? updateError : createError;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    const startsAtIso = toIso(startsAt);
    if (!startsAtIso) {
      setClientError('Start date and time is required.');
      return;
    }
    const endsAtIso = toIso(endsAt);
    const venueId = venue.mode === 'search' && venue.venueId ? venue.venueId : undefined;

    if (isEdit) {
      // UpdateAdminEventInput's optional fields are nullable: an empty field must send `null`
      // to clear a previously-set value, not `undefined` (which admin-event.service.ts treats
      // as "no change").
      const empty = <T,>(value: string, mapped: T): T | null => (value.trim() ? mapped : null);
      updateEvent(
        {
          title,
          startsAt: startsAtIso,
          endsAt: endsAtIso ?? null,
          timezone,
          venueId: venueId ?? null,
          artistIds: artists.map((artist) => artist.id),
          genreIds,
          description: empty(description, description.trim()),
          imageUrl: empty(imageUrl, imageUrl.trim()),
          ageRestriction: empty(ageRestriction, ageRestriction.trim()),
          doorTime: empty(doorTime, doorTime.trim()),
          reentryPolicy: empty(reentryPolicy, reentryPolicy.trim()),
          bagPolicy: empty(bagPolicy, bagPolicy.trim()),
          prohibitedItems: empty(prohibitedItems, prohibitedItems.trim()),
          dressCode: empty(dressCode, dressCode.trim()),
          status,
        },
        { onSuccess: () => navigate('/admin/events') },
      );
    } else {
      const input: CreateAdminEventInput = {
        title,
        startsAt: startsAtIso,
        endsAt: endsAtIso,
        timezone,
        venueId,
        artistIds: artists.map((artist) => artist.id),
        genreIds,
        description: description.trim() || undefined,
        imageUrl: imageUrl.trim() || undefined,
        ageRestriction: ageRestriction.trim() || undefined,
        doorTime: doorTime.trim() || undefined,
        reentryPolicy: reentryPolicy.trim() || undefined,
        bagPolicy: bagPolicy.trim() || undefined,
        prohibitedItems: prohibitedItems.trim() || undefined,
        dressCode: dressCode.trim() || undefined,
        status: status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      };
      createEvent(input, { onSuccess: () => navigate('/admin/events') });
    }
  }

  const apiFieldErrors =
    error instanceof ApiRequestError && error.code === 'VALIDATION_ERROR' ? fieldErrors(error.details) : [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{isEdit ? 'Edit Event' : 'Create Event'}</h1>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            maxLength={MAX_TITLE_LENGTH}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="startsAt">Starts at</label>
            <input
              id="startsAt"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="endsAt">Ends at</label>
            <input
              id="endsAt"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="timezone">Timezone (IANA)</label>
            <input
              id="timezone"
              type="text"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Venue</label>
          <VenuePicker value={venue} onChange={setVenue} />
        </div>

        <div className={styles.field}>
          <label>Artists</label>
          <AdminArtistPicker selected={artists} onChange={setArtists} />
        </div>

        <div className={styles.field}>
          <label>Genres</label>
          <AdminGenrePicker selectedIds={genreIds} onChange={setGenreIds} />
        </div>

        <div className={styles.field}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            maxLength={MAX_DESCRIPTION_LENGTH}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="imageUrl">Image URL</label>
          <input
            id="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as EventStatus)}
          >
            {(isEdit ? EDIT_STATUSES : CREATE_STATUSES).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="ageRestriction">Age restriction</label>
            <input
              id="ageRestriction"
              type="text"
              maxLength={MAX_AGE_RESTRICTION_LENGTH}
              placeholder="e.g. 18+, 21+, All Ages"
              value={ageRestriction}
              onChange={(event) => setAgeRestriction(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="doorTime">Door time (HH:MM)</label>
            <input
              id="doorTime"
              type="text"
              placeholder="22:00"
              value={doorTime}
              onChange={(event) => setDoorTime(event.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="reentryPolicy">Re-entry policy</label>
          <textarea
            id="reentryPolicy"
            rows={2}
            value={reentryPolicy}
            onChange={(event) => setReentryPolicy(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="bagPolicy">Bag policy</label>
          <textarea
            id="bagPolicy"
            rows={2}
            value={bagPolicy}
            onChange={(event) => setBagPolicy(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="prohibitedItems">Prohibited items</label>
          <textarea
            id="prohibitedItems"
            rows={2}
            value={prohibitedItems}
            onChange={(event) => setProhibitedItems(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="dressCode">Dress code</label>
          <textarea
            id="dressCode"
            rows={2}
            value={dressCode}
            onChange={(event) => setDressCode(event.target.value)}
          />
        </div>

        {clientError && <p className={styles.error}>{clientError}</p>}
        {error && !(error instanceof ApiRequestError && error.code === 'VALIDATION_ERROR') && (
          <p className={styles.error}>
            {error instanceof ApiRequestError ? error.message : 'Something went wrong.'}
          </p>
        )}
        {apiFieldErrors.length > 0 && (
          <ul className={styles.error}>
            {apiFieldErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}

        <button type="submit" className={styles.submitButton} disabled={isPending}>
          {isPending ? 'Saving...' : isEdit ? 'Save changes' : 'Create event'}
        </button>
      </form>
    </div>
  );
}
