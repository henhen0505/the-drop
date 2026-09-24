import { useState, type FormEvent } from 'react';
import type { CreateSubmissionInput } from '@the-drop/types';
import { ArtistNameInput } from '../components/submissions/ArtistNameInput';
import { VenuePicker, type VenuePickerValue } from '../components/submissions/VenuePicker';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../hooks/useAuth';
import { useSubmitEvent } from '../hooks/useSubmitEvent';
import { ApiRequestError } from '../services/api';
import styles from './SubmitEvent.module.css';

const MAX_ARTIST_NAMES = 30;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_AGE_RESTRICTION_LENGTH = 20;

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

function emptyVenue(): VenuePickerValue {
  return { mode: 'search', venueId: null, venueNameRaw: '', venueAddressRaw: '' };
}

export default function SubmitEvent() {
  const { user } = useAuth();
  const { submit, isPending, isSuccess, error, data, reset } = useSubmitEvent();

  const [eventTitle, setEventTitle] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [venue, setVenue] = useState<VenuePickerValue>(emptyVenue());
  const [artistNames, setArtistNames] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [posterImageUrl, setPosterImageUrl] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [ageRestriction, setAgeRestriction] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);

  // Server enforces this too (submission.router.ts requireRole('USER', 'PROMOTER'));
  // this is only a UX nicety to avoid a doomed round trip.
  if (user && user.role !== 'USER' && user.role !== 'PROMOTER') {
    return (
      <EmptyState
        title="Submissions aren't available for this account"
        description="Only regular users and promoters can submit events."
      />
    );
  }

  function resetForm() {
    setEventTitle('');
    setEventStartsAt('');
    setVenue(emptyVenue());
    setArtistNames([]);
    setDescription('');
    setPosterImageUrl('');
    setTicketUrl('');
    setSourceUrl('');
    setAgeRestriction('');
    setClientError(null);
    reset();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    if (eventStartsAt.length === 0) {
      setClientError('Event date and time is required.');
      return;
    }
    const startsAtDate = new Date(eventStartsAt);
    if (Number.isNaN(startsAtDate.getTime()) || startsAtDate.getTime() <= Date.now()) {
      setClientError('Event date and time must be in the future.');
      return;
    }
    if (venue.mode === 'search' && !venue.venueId) {
      setClientError('Select a venue, or switch to "Enter manually".');
      return;
    }
    if (venue.mode === 'manual' && venue.venueNameRaw.trim().length === 0) {
      setClientError('Venue name is required.');
      return;
    }

    const input: CreateSubmissionInput = {
      eventTitle,
      eventStartsAt: startsAtDate.toISOString(),
      artistNames,
      description: description.trim() || undefined,
      posterImageUrl: posterImageUrl.trim() || undefined,
      ticketUrl: ticketUrl.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
      ageRestriction: ageRestriction.trim() || undefined,
      ...(venue.mode === 'search'
        ? { venueId: venue.venueId ?? undefined }
        : {
            venueNameRaw: venue.venueNameRaw.trim(),
            venueAddressRaw: venue.venueAddressRaw.trim() || undefined,
          }),
    };

    submit(input);
  }

  if (isSuccess && data) {
    return (
      <div className={styles.page}>
        <div className={styles.successCard}>
          <h1 className={styles.title}>Thanks for the submission!</h1>
          <p className={styles.successText}>
            Your event is {data.status === 'APPROVED' ? 'published' : 'awaiting review'}.
          </p>
          <button type="button" className={styles.submitButton} onClick={resetForm}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  const apiFieldErrors =
    error instanceof ApiRequestError && error.code === 'VALIDATION_ERROR'
      ? fieldErrors(error.details)
      : [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Submit an Event</h1>
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.field}>
          <label htmlFor="eventTitle">Event title</label>
          <input
            id="eventTitle"
            type="text"
            maxLength={MAX_TITLE_LENGTH}
            value={eventTitle}
            onChange={(event) => setEventTitle(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="eventStartsAt">Date &amp; time</label>
          <input
            id="eventStartsAt"
            type="datetime-local"
            value={eventStartsAt}
            onChange={(event) => setEventStartsAt(event.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label>Venue</label>
          <VenuePicker value={venue} onChange={setVenue} />
        </div>

        <div className={styles.field}>
          <label>Artists</label>
          <ArtistNameInput names={artistNames} onChange={setArtistNames} max={MAX_ARTIST_NAMES} />
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
          <label htmlFor="posterImageUrl">Poster image URL</label>
          <input
            id="posterImageUrl"
            type="url"
            value={posterImageUrl}
            onChange={(event) => setPosterImageUrl(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="ticketUrl">Ticket URL</label>
          <input
            id="ticketUrl"
            type="url"
            value={ticketUrl}
            onChange={(event) => setTicketUrl(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="sourceUrl">Source URL</label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
          />
        </div>

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
          {isPending ? 'Submitting...' : 'Submit event'}
        </button>
      </form>
    </div>
  );
}
