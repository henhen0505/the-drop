import type {
  ConfidenceLevel,
  DedupMatchStatus,
  EventStatus,
  NotificationType,
  SourceType,
  SubmissionStatus,
  UserEventState,
  UserRole,
  VendorClassification,
} from './enums';

/**
 * Full user profile, as returned by GET/PATCH /users/me
 * (apps/api/src/modules/users/user.service.ts ProfileResponse).
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
  preferredCity: string | null;
  preferredState: string | null;
  travelRadiusKm: number | null;
  priceMin: number | null; // cents
  priceMax: number | null; // cents
  emailVerified: boolean;
  createdAt: string;
}

/**
 * Minimal user shape returned by the auth endpoints (login/register/refresh/google)
 * (apps/api/src/modules/auth/auth.service.ts AuthUser).
 */
export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  avatarUrl: string | null;
}

// --- Genre (apps/api/src/modules/genres/genre.service.ts GenreNode) ---
export interface GenreSummary {
  id: string;
  name: string;
}

export interface GenreDetail extends GenreSummary {
  slug: string;
}

export interface GenreNode extends GenreDetail {
  children: GenreNode[];
}

// --- Venue (embedded in events; apps/api/src/modules/events/event.service.ts
// EventVenueSummary/EventVenueDetail) ---
export interface VenueSummary {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
}

export interface VenueDetail extends VenueSummary {
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  typicalAgeRestriction: string | null;
}

// --- Venue (standalone list item, for search results etc -- full profile
// page is Phase 3; apps/api/src/modules/venues/venue.service.ts VenueListItem) ---
export interface VenueListItem {
  id: string;
  name: string;
  slug: string;
  city: string;
  state: string | null;
  country: string;
  imageUrl: string | null;
  venueType: string | null;
  capacity: number | null;
}

// --- Artist (apps/api/src/modules/events/event.service.ts
// EventArtistSummary/EventArtistDetail) ---
export interface ArtistSummary {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  isHeadliner: boolean;
}

export interface ArtistDetail extends ArtistSummary {
  genres: GenreDetail[];
}

// --- Ticket Link (apps/api/src/db/schema/ticket-links.ts,
// apps/api/src/modules/events/event.service.ts TicketLinkSummary) ---
export interface TicketLink {
  id: string;
  vendorName: string;
  vendorClassification: VendorClassification;
  url: string;
  affiliateUrl: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  currency: string;
  ticketType: string | null;
  feesKnown: boolean;
  lastCheckedAt: string | null;
  ftcDisclosure: string | null;
}

// --- Event Source (apps/api/src/modules/events/event.service.ts EventSourceSummary) ---
export interface EventSource {
  sourceType: SourceType;
  sourceUrl: string | null;
  lastSyncedAt: string;
  confidence: ConfidenceLevel;
}

// --- Event List Item (apps/api/src/modules/events/event.service.ts EventListItem) ---
export interface EventListItem {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  venue: VenueSummary | null;
  artists: ArtistSummary[];
  genres: GenreSummary[];
  minPriceCents: number | null;
  status: string;
  ageRestriction: string | null;
  artistCount: number;
  userState: string | null;
  recommendationScore: number | null;
}

// --- Event Detail (apps/api/src/modules/events/event.service.ts EventDetail) ---
export interface EventDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  venue: VenueDetail | null;
  artists: ArtistDetail[];
  genres: GenreDetail[];
  ticketLinks: TicketLink[];
  sources: EventSource[];
  status: string;
  ageRestriction: string | null;
  doorTime: string | null;
  reentryPolicy: string | null;
  bagPolicy: string | null;
  prohibitedItems: string | null;
  dressCode: string | null;
  minPriceCents: number | null;
  artistCount: number;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  lastVerifiedAt: string | null;
  userState: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Event State (apps/api/src/modules/events/user-event-state.service.ts
// SetEventStateResult) ---
export interface EventStateResponse {
  eventId: string;
  state: UserEventState;
  updatedAt: string;
}

// --- Recommendation (apps/api/src/modules/recommendations/recommendation.service.ts
// RecommendationItem; apps/api/src/recommendations/scorer.ts RecommendationFactors) ---
export interface RecommendationFactors {
  artistAffinity: number;
  genreAffinity: number;
  distanceScore: number;
  priceFit: number;
  venueAffinity: number;
}

export interface RecommendationItem {
  event: EventListItem;
  score: number;
  explanation: string;
  factors: RecommendationFactors;
}

// --- Search (apps/api/src/modules/search/search.service.ts) ---
export interface SearchEventResult {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  venue: { name: string; city: string } | null;
  rank: number;
}

export interface SearchArtistResult {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  rank: number;
}

export interface SearchVenueResult {
  id: string;
  name: string;
  slug: string;
  city: string;
  rank: number;
}

export interface SearchResult {
  events: SearchEventResult[];
  artists: SearchArtistResult[];
  venues: SearchVenueResult[];
}

export interface AutocompleteItem {
  type: 'artist' | 'event' | 'venue';
  id: string;
  name: string;
  slug: string;
  subtitle: string;
  similarity: number;
}

// --- Artist Profile (apps/api/src/modules/artists/artist.service.ts ArtistDetail) ---
export interface ArtistProfile {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  bio: string | null;
  genres: GenreDetail[];
  spotifyUrl: string | null;
  soundcloudUrl: string | null;
  appleMusicUrl: string | null;
  followerCount: number;
  isFollowed: boolean;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  upcomingEventCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- Venue Profile (apps/api/src/modules/venues/venue.service.ts VenueDetail) ---
export interface VenueProfile {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  city: string;
  state: string | null;
  country: string;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  capacity: number | null;
  venueType: string | null;
  imageUrl: string | null;
  typicalAgeRestriction: string | null;
  typicalBagPolicy: string | null;
  confidence: ConfidenceLevel;
  primarySource: SourceType;
  upcomingEventCount: number;
  createdAt: string;
  updatedAt: string;
}

// --- My Raves (apps/api/src/modules/events/user-event-state.service.ts
// MyRaveEventSummary/MyRaveItem) ---
export interface MyRaveEventSummary {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  timezone: string;
  imageUrl: string | null;
  venue: { name: string; city: string } | null;
  artists: ArtistSummary[];
}

export interface MyRaveItem {
  event: MyRaveEventSummary;
  state: UserEventState;
  updatedAt: string;
}

// --- Follow Artist (apps/api/src/modules/artists/artist.service.ts FollowArtistResult) ---
export interface FollowArtistResult {
  artistId: string;
  followedAt: string;
}

// --- Notifications (apps/api/src/modules/notifications/notification.service.ts) ---
export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface MarkReadResult {
  id: string;
  readAt: string;
}

export interface MarkAllReadResult {
  markedCount: number;
}

// --- Notification Preferences (apps/api/src/modules/users/user.service.ts
// NotificationPrefsResponse) ---
export interface NotificationPreferences {
  eventTomorrow: boolean;
  eventCancelled: boolean;
  eventRescheduled: boolean;
  artistNewEvent: boolean;
  submissionUpdates: boolean;
}

export type UpdateNotificationPreferences = Partial<NotificationPreferences>;

// --- Submissions (apps/api/src/modules/submissions/submission.validation.ts
// createSubmissionSchema / submission.service.ts CreateSubmissionResult /
// submission-view.ts SubmissionView) ---
export interface CreateSubmissionInput {
  eventTitle: string;
  eventStartsAt: string;
  venueId?: string;
  venueNameRaw?: string;
  venueAddressRaw?: string;
  artistNames?: string[];
  description?: string;
  posterImageUrl?: string;
  ticketUrl?: string;
  sourceUrl?: string;
  ageRestriction?: string;
}

export interface CreateSubmissionResult {
  id: string;
  status: SubmissionStatus;
  createdAt: string;
}

export interface SubmissionView {
  id: string;
  eventTitle: string;
  eventStartsAt: string;
  venueId: string | null;
  venueNameRaw: string | null;
  venueAddressRaw: string | null;
  artistNames: string[];
  description: string | null;
  posterImageUrl: string | null;
  ticketUrl: string | null;
  sourceUrl: string | null;
  ageRestriction: string | null;
  status: SubmissionStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  mergedEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Admin: Events (apps/api/src/modules/admin/admin-event.service.ts
// AdminEventSource/AdminEventListItem/AdminEventDetail;
// admin-event.validation.ts CreateAdminEventInput/UpdateAdminEventInput/
// MergeableEventField/MergeEventsInput) ---
export interface AdminEventSource {
  sourceType: SourceType;
  externalId: string | null;
  sourceUrl: string | null;
  lastSyncedAt: string;
}

// The list query selects fewer venue columns than the detail query (no
// slug) -- apps/api/src/modules/admin/admin-event.service.ts:190-213.
export interface AdminEventListItem {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  status: EventStatus;
  venue: { id: string; name: string; city: string; state: string | null } | null;
  artistCount: number;
  primarySource: SourceType;
  confidence: ConfidenceLevel;
  createdAt: string;
  updatedAt: string;
  sources: AdminEventSource[];
}

// venue/artists/genres reuse the same shapes as the public EventDetail
// (EventVenueSummary/EventArtistSummary/EventGenreDetail in
// event.service.ts are structurally identical to VenueSummary/
// ArtistSummary/GenreDetail above).
export interface AdminEventDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  status: EventStatus;
  venue: VenueSummary | null;
  artists: ArtistSummary[];
  genres: GenreDetail[];
  ageRestriction: string | null;
  doorTime: string | null;
  reentryPolicy: string | null;
  bagPolicy: string | null;
  prohibitedItems: string | null;
  dressCode: string | null;
  primarySource: SourceType;
  confidence: ConfidenceLevel;
  fieldProvenance: Record<string, string>;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sources: AdminEventSource[];
}

export interface CreateAdminEventInput {
  title: string;
  startsAt: string;
  endsAt?: string;
  timezone?: string;
  venueId?: string;
  artistIds?: string[];
  genreIds?: string[];
  description?: string;
  imageUrl?: string;
  ageRestriction?: string;
  doorTime?: string;
  reentryPolicy?: string;
  bagPolicy?: string;
  prohibitedItems?: string;
  dressCode?: string;
  status?: 'DRAFT' | 'PUBLISHED';
}

export interface UpdateAdminEventInput {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  timezone?: string;
  venueId?: string | null;
  artistIds?: string[];
  genreIds?: string[];
  description?: string | null;
  imageUrl?: string | null;
  ageRestriction?: string | null;
  doorTime?: string | null;
  reentryPolicy?: string | null;
  bagPolicy?: string | null;
  prohibitedItems?: string | null;
  dressCode?: string | null;
  status?: EventStatus;
}

export type MergeableEventField =
  | 'title'
  | 'description'
  | 'imageUrl'
  | 'startsAt'
  | 'endsAt'
  | 'venueId'
  | 'ageRestriction'
  | 'doorTime'
  | 'reentryPolicy'
  | 'bagPolicy'
  | 'prohibitedItems'
  | 'dressCode';

export interface MergeEventsInput {
  keepEventId: string;
  mergeEventId: string;
  fieldOverrides?: Partial<Record<MergeableEventField, 'keep' | 'merge'>>;
}

// --- Admin: Submissions (apps/api/src/modules/admin/
// submission-review.service.ts AdminSubmissionView/ReviewedSubmission;
// submission-review.validation.ts ReviewSubmissionInput;
// apps/api/src/dedup/types.ts MatchDecision) ---
export interface AdminSubmissionView extends SubmissionView {
  submitter: { id: string; displayName: string; role: UserRole };
  venue: { id: string; name: string; city: string; state: string | null } | null;
}

export type MatchDecision = 'AUTO_MERGE' | 'REVIEW' | 'NO_MATCH';

export interface ReviewedSubmission extends SubmissionView {
  resultEventId: string | null;
  dedupDecision: MatchDecision | null;
}

export interface ReviewSubmissionInput {
  status: 'APPROVED' | 'REJECTED' | 'MERGED';
  reviewNotes?: string;
  mergedEventId?: string;
}

// --- Admin: Dedup (apps/api/src/modules/admin/dedup.service.ts
// DedupCandidateItem/ResolvedCandidate; dedup.validation.ts
// ResolveCandidateInput) ---
export interface DedupCandidateItem {
  id: string;
  status: DedupMatchStatus;
  incoming: {
    title: string;
    startsAt: string;
    venueName: string | null;
    artists: string[];
    sourceType: string | null;
  };
  candidate: {
    id: string;
    title: string;
    startsAt: string;
    venue: { id: string; name: string; city: string } | null;
    artists: string[];
  };
  score: number;
  venueScore: number | null;
  dateScore: number | null;
  titleScore: number | null;
  artistScore: number | null;
  matchDetails: unknown;
  createdAt: string;
}

export interface ResolveCandidateInput {
  action: 'merge' | 'reject';
}

export interface ResolvedCandidate {
  id: string;
  status: DedupMatchStatus;
  resultEventId: string;
  reviewedBy: string;
  reviewedAt: string;
}

// --- Admin: Sync (apps/api/src/db/schema/admin.ts syncStatus;
// apps/api/src/modules/admin/sync.validation.ts triggerSyncSchema) ---
export interface SyncStatusItem {
  sourceType: SourceType;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  eventsSynced: number;
  createdAt: string;
  updatedAt: string;
}

export interface TriggerSyncInput {
  sourceType: 'TICKETMASTER';
}

export interface TriggerSyncResult {
  message: string;
}
