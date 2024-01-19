/* eslint-disable @typescript-eslint/no-explicit-any */
import { Field, MerkleTree, MerkleWitness, Poseidon, PublicKey } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';

export const LEVEL_1_TREE_HEIGHT =
  Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

// Storage
export abstract class CampaignStorage {
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

export class InfoStorage extends CampaignStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  static calculateLeaf(ipfsHash: IPFSHash): Field {
    return Poseidon.hash(ipfsHash.toFields());
  }

  calculateLeaf(ipfsHash: IPFSHash): Field {
    return InfoStorage.calculateLeaf(ipfsHash);
  }

  calculateLevel1Index(campaignId: Field): Field {
    return campaignId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class OwnerStorage extends CampaignStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(publicKey: PublicKey): Field {
    return OwnerStorage.calculateLeaf(publicKey);
  }

  static calculateLeaf(publicKey: PublicKey): Field {
    return Poseidon.hash(publicKey.toFields());
  }

  calculateLevel1Index(campaignId: Field): Field {
    return campaignId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class StatusStorage extends CampaignStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf(status: StatusEnum): Field {
    return StatusStorage.calculateLeaf(status);
  }

  static calculateLeaf(status: StatusEnum): Field {
    return Field(status);
  }

  calculateLevel1Index(campaignId: Field): Field {
    return campaignId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

export class ConfigStorage extends CampaignStorage {
  level1: Level1MT;

  constructor(level1?: Level1MT) {
    super(level1);
  }

  calculateLeaf({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return ConfigStorage.calculateLeaf({
      committeeId,
      keyId,
    });
  }

  static calculateLeaf({
    committeeId,
    keyId,
  }: {
    committeeId: Field;
    keyId: Field;
  }): Field {
    return Poseidon.hash([committeeId, keyId]);
  }

  calculateLevel1Index(projectId: Field): Field {
    return projectId;
  }

  getWitness(level1Index: Field): Level1Witness {
    return super.getWitness(level1Index) as Level1Witness;
  }

  updateLeaf(leaf: Field, level1Index: Field): void {
    super.updateLeaf(leaf, level1Index);
  }
}

// Type
export const enum StatusEnum {
  NOT_STARTED,
  APPLICATION,
  FUNDING,
  ALLOCATED,
  FINALIZE_ROUND_1, // check this again
  __LENGTH,
}

export function getStatusFromNumber(num: number): StatusEnum {
  switch (num) {
    case 0:
      return StatusEnum.NOT_STARTED;
    case 1:
      return StatusEnum.APPLICATION;
    case 2:
      return StatusEnum.FUNDING;
    case 3:
      return StatusEnum.ALLOCATED;
    case 4:
      return StatusEnum.FINALIZE_ROUND_1;
    default:
      throw new Error('Invalid number');
  }
}
