import {
  Field,
  MerkleTree,
  MerkleWitness,
  Poseidon,
  PublicKey,
  Struct,
} from 'o1js';
import { PROJECT_MEMBER_MAX_SIZE, INSTANCE_LIMITS } from '../constants.js';
import { RequestVector } from '@auxo-dev/dkg/build/esm/src/contracts/Request';

export const LEVEL_1_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

// Storage
export abstract class FundingStorage {
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

export class MStorage extends FundingStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(m: RequestVector): Field {
    return Poseidon.hash(m.toFields());
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return campaignId.mul(Field.from(INSTANCE_LIMITS.PROJECT)).add(projectId);
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class RStorage extends FundingStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(m: RequestVector): Field {
    return Poseidon.hash(m.toFields());
  }

  calculateLevel1Index({
    campaignId,
    projectId,
  }: {
    campaignId: Field;
    projectId: Field;
  }): Field {
    return campaignId.mul(Field.from(INSTANCE_LIMITS.PROJECT)).add(projectId);
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}
