/** Domain conflict surfaced by any persistence adapter when a username uniqueness race is lost. */
export class UsernameConflictError extends Error {
  constructor() {
    super('Username already exists.');
    this.name = 'UsernameConflictError';
  }
}

/** Persistence-level race result: cleanup claimed this immutable object key first. */
export class AvatarObjectUnavailableError extends Error {
  constructor() {
    super('Avatar object is already claimed for deletion.');
    this.name = 'AvatarObjectUnavailableError';
  }
}
