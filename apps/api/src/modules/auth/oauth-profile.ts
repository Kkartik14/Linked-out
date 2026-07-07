import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import type { Profile as GithubProfile } from 'passport-github2';

export type OAuthProvider = 'google' | 'github';

export interface NormalizedOAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string | null;
  name: string | null;
  image: string | null;
}

export function normalizeGoogleProfile(profile: GoogleProfile): NormalizedOAuthProfile {
  return {
    provider: 'google',
    providerAccountId: profile.id,
    email: profile.emails?.[0]?.value ?? null,
    name: profile.displayName ?? null,
    image: profile.photos?.[0]?.value ?? null,
  };
}

export function normalizeGithubProfile(profile: GithubProfile): NormalizedOAuthProfile {
  return {
    provider: 'github',
    providerAccountId: profile.id,
    email: profile.emails?.[0]?.value ?? null,
    name: profile.displayName ?? profile.username ?? null,
    image: profile.photos?.[0]?.value ?? null,
  };
}
