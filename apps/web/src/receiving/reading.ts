/**
 * Whether the Arrival is being read again, as it is after every change saved on its screens, which makes the versions
 * it showed stale. An action that names a version the screen shows (issuing the GRN, changing or removing a line,
 * proposing a recount, linking to a booking) waits for the read, so it never sends the version a save has just
 * replaced (code-house-rules 12.7): `shown` disables it on screen, and `now` asks the read itself when it is pressed,
 * before the screen has caught up with a save.
 */
export interface Reading {
  readonly shown: boolean;
  readonly now: () => boolean;
}
