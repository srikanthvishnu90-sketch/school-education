import { describe, expect, it } from "vitest";

import type { Id } from "@/domain/common";

/**
 * A reusable repository contract. Every id-keyed adapter must satisfy the same
 * save/find semantics; `save`/`findById` are passed in so the contract is
 * decoupled from each port's concrete method names (e.g. LearningMap looks up by
 * skillId). Run it against each adapter to prove they are interchangeable.
 */
export interface RepositoryContract<Repo, E> {
  name: string;
  makeRepo: () => Repo;
  /** Two entities that resolve to the SAME stored key, differing in content. */
  entityA: E;
  entityB: E;
  /** The key `findById` should resolve `entityA`/`entityB` by. */
  keyA: Id;
  unknownKey: Id;
  save: (repo: Repo, entity: E) => Promise<void>;
  findById: (repo: Repo, key: Id) => Promise<E | null>;
}

export function defineRepositoryContract<Repo, E>(
  contract: RepositoryContract<Repo, E>,
): void {
  describe(`${contract.name} — repository contract`, () => {
    it("returns null for an unknown key", async () => {
      const repo = contract.makeRepo();
      expect(await contract.findById(repo, contract.unknownKey)).toBeNull();
    });

    it("persists and retrieves an entity", async () => {
      const repo = contract.makeRepo();
      await contract.save(repo, contract.entityA);
      expect(await contract.findById(repo, contract.keyA)).toEqual(
        contract.entityA,
      );
    });

    it("overwrites in place when saving the same key", async () => {
      const repo = contract.makeRepo();
      await contract.save(repo, contract.entityA);
      await contract.save(repo, contract.entityB);
      expect(await contract.findById(repo, contract.keyA)).toEqual(
        contract.entityB,
      );
    });
  });
}
