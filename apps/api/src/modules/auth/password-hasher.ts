import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordHasher {
  // Unknown-account login still performs one real Argon2 verification. The promise is shared so
  // a burst cannot trigger an unbounded number of dummy-hash computations during construction.
  private readonly dummyHash = hash('linkedout uniform login timing sentinel', ARGON2_OPTIONS);

  create(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, candidate: string): Promise<boolean> {
    return verify(passwordHash, candidate);
  }

  async verifyDummy(candidate: string): Promise<void> {
    await verify(await this.dummyHash, candidate);
  }
}
