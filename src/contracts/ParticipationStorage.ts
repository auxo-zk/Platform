import { Field, MerkleTree, MerkleWitness, Poseidon } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';

export const LEVEL_1_COMBINED_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN * INSTANCE_LIMITS.PROJECT)) + 1;

export const LEVEL_1_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1CMT extends MerkleTree {}
export class Level1CWitness extends MerkleWitness(
  LEVEL_1_COMBINED_TREE_HEIGHT
) {}

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(
  LEVEL_1_COMBINED_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_COMBINED_TREE = () =>
  new Level1CMT(LEVEL_1_COMBINED_TREE_HEIGHT);

export const EMPTY_LEVEL_1_TREE = () => new Level1CMT(LEVEL_1_TREE_HEIGHT);

// Storage
export class IndexStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
  }

  calculateLeaf(index: Field): Field {
    return IndexStorage.calculateLeaf(index);
  }

  static calculateLeaf(index: Field): Field {
    return Poseidon.hash([index]);
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return IndexStorage.calculateLevel1Index({ campaignId, projectId });
  }

  static calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return campaignId.mul(INSTANCE_LIMITS.PROJECT).add(projectId);
  }

  getLevel1Witness(level1Index: Field): Level1CWitness {
    return new Level1CWitness(this.level1.getWitness(level1Index.toBigInt()));
  }

  getWitness(level1Index: Field): Level1CWitness {
    return this.getLevel1Witness(level1Index);
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    this.level1.setLeaf(level1Index.toBigInt(), leaf);
  }
}

export class InfoStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
  }

  calculateLeaf(ipfshash: IPFSHash): Field {
    return InfoStorage.calculateLeaf(ipfshash);
  }

  static calculateLeaf(ipfshash: IPFSHash): Field {
    return Poseidon.hash(ipfshash.toFields());
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return campaignId.mul(INSTANCE_LIMITS.PROJECT).add(projectId);
  }

  getLevel1Witness(level1Index: Field): Level1CWitness {
    return new Level1CWitness(this.level1.getWitness(level1Index.toBigInt()));
  }

  getWitness(level1Index: Field): Level1CWitness {
    return this.getLevel1Witness(level1Index);
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    this.level1.setLeaf(level1Index.toBigInt(), leaf);
  }
}

export class CounterStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
  }

  calculateLeaf(counter: Field): Field {
    return CounterStorage.calculateLeaf(counter);
  }

  static calculateLeaf(counter: Field): Field {
    return Poseidon.hash([counter]);
  }

  calculateLevel1Index(campaignId: Field): Field {
    return campaignId;
  }

  getLevel1Witness(level1Index: Field): Level1Witness {
    return new Level1Witness(this.level1.getWitness(level1Index.toBigInt()));
  }

  getWitness(level1Index: Field): Level1Witness {
    return this.getLevel1Witness(level1Index);
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    this.level1.setLeaf(level1Index.toBigInt(), leaf);
  }
}
