import {
  Bool,
  Field,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  PublicKey,
  Struct,
} from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';

export const LEVEL_1_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN * INSTANCE_LIMITS.PROJECT)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

// Storage
export abstract class TreasuryStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
  }

  abstract calculateLeaf(args: any): Field;
  abstract calculateLevel1Index(args: any): Field;
  calculateLevel2Index?(args: any): Field;

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

export class ClaimedStorage extends TreasuryStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(state: Bool): Field {
    return this.calculateLeaf(state);
  }

  static calculateLeaf(state: Bool): Field {
    return state.toField();
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return Field.from(
      campaignId.toBigInt() * BigInt(INSTANCE_LIMITS.PROJECT) +
        projectId.toBigInt()
    );
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}
