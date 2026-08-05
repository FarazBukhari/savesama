/**
 * Threads' web app id, required on its `api/v1/media/{id}/info/` requests. Unlike a
 * GraphQL doc_id this is stable, but it is *not* interchangeable with Instagram's
 * (936619743392459): sending the Instagram id to the Threads endpoint answers
 * `400 {"message":"Media not found or unavailable","status":"fail"}` for every post,
 * which reads like a deleted post but is really a wrong-app-id error.
 * (Verified August 2026.)
 */
export const THREADS_APP_ID = '238260118697367';

/** Origin whose session cookie authorizes the media-info fetch. */
export const THREADS_ORIGIN = 'https://www.threads.com';

/** Threads posts reuse Instagram's api/v1 media-info payload shape. */
export { mapMediaInfo } from './instagramApi';
