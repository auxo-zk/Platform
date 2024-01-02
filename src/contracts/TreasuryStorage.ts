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

export const LEVEL_1_COMBINED_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN * INSTANCE_LIMITS.PROJECT)) + 1;

export class Level1CMT extends MerkleTree {}
export class Level1CWitness extends MerkleWitness(
  LEVEL_1_COMBINED_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_TREE = () =>
  new Level1CMT(LEVEL_1_COMBINED_TREE_HEIGHT);

// Storage
export abstract class TreasuryStorage {
  level1: Level1CMT;

  constructor(level1?: Level1CMT) {
    this.level1 = level1 || EMPTY_LEVEL_1_TREE();
  }

  abstract calculateLeaf(args: any): Field;
  abstract calculateLevel1Index(args: any): Field;
  calculateLevel2Index?(args: any): Field;

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

export class ClaimedStorage extends TreasuryStorage {
  level1: Level1CMT;

  constructor(level1?: Level1CMT) {
    super(level1);
  }

  calculateLeaf(state: Bool): Field {
    return this.calculateLeaf(state);
  }

  static calculateLeaf(state: Bool): Field {
    return state.toField();
  }

  static calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return campaignId.mul(Field(INSTANCE_LIMITS.PROJECT)).add(projectId);
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return this.calculateLevel1Index({
      campaignId: campaignId,
      projectId: projectId,
    });
  }

  getWitness(level1Index: Field): Level1CWitness {
    return super.getWitness(level1Index) as Level1CWitness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}
