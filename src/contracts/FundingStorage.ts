import { Field, MerkleTree, MerkleWitness, Poseidon, UInt64 } from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import { ZkApp } from '@auxo-dev/dkg';
import { GroupDynamicArray, ScalarDynamicArray } from '@auxo-dev/auxo-libs';
import { Constants as DkgConstants } from '@auxo-dev/dkg';

export const LEVEL_1_CAMPAIGN_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN_TREE_SIZE)) + 1;
export const LEVEL_1_COMMITMENT_HASH_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.COMMITMENT_HASH_TREE_SIZE)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(
    LEVEL_1_CAMPAIGN_TREE_HEIGHT
) {}

export class Level1CHMT extends MerkleTree {}
export class Level1CHWitness extends MerkleWitness(
    LEVEL_1_COMMITMENT_HASH_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_CAMPAIGN_TREE = () =>
    new Level1MT(LEVEL_1_CAMPAIGN_TREE_HEIGHT);
export const EMPTY_LEVEL_1_COMMITMENT_HASH_TREE = () =>
    new Level1CHMT(LEVEL_1_COMMITMENT_HASH_TREE_HEIGHT);

export const DefaultRootForCommitmentHashTree =
    EMPTY_LEVEL_1_COMMITMENT_HASH_TREE().getRoot();

export abstract class CommitmentHashAbstractStorage<RawLeaf> {
    private _level1: Level1MT;
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_COMMITMENT_HASH_TREE();
        this._leafs = {};
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                if (leafs[i].leaf instanceof Field) {
                    this.updateLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as Field
                    );
                } else {
                    this.updateRawLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as RawLeaf
                    );
                }
            }
        }
    }

    get root(): Field {
        return this._level1.getRoot();
    }

    get level1(): Level1MT {
        return this._level1;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return new Level1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getWitness(level1Index: Field): Level1Witness {
        return this.getLevel1Witness(level1Index);
    }

    updateLeaf(level1Index: Field, leaf: Field): void {
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(level1Index: Field, rawLeaf: RawLeaf): void {
        let leaf = this.calculateLeaf(rawLeaf);
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

export type CommitmentHashLeaf = Field;
export class CommitmentHashStorage extends CommitmentHashAbstractStorage<CommitmentHashLeaf> {
    static calculateLeaf(commitmentHash: CommitmentHashLeaf): Field {
        return commitmentHash;
    }
    calculateLeaf(commitmentHash: Field): Field {
        return CommitmentHashStorage.calculateLeaf(commitmentHash);
    }
    static calculateLevel1Index(commitmentHashId: Field): Field {
        return commitmentHashId;
    }
    calculateLevel1Index(commitmentHashId: Field): Field {
        return CommitmentHashStorage.calculateLevel1Index(commitmentHashId);
    }
    getWitness(level1Index: Field): Level1CHWitness {
        return super.getWitness(level1Index) as Level1CHWitness;
    }
    updateLeaf(level1Index: Field, leaf: CommitmentHashLeaf): void {
        super.updateLeaf(level1Index, leaf);
    }
    updateRawLeaf(level1Index: Field, rawLeaf: CommitmentHashLeaf): void {
        super.updateRawLeaf(level1Index, rawLeaf);
    }
}

export abstract class FundingStorage<RawLeaf> {
    private _level1: Level1MT;
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_CAMPAIGN_TREE();
        this._leafs = {};
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                if (leafs[i].leaf instanceof Field) {
                    this.updateLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as Field
                    );
                } else {
                    this.updateRawLeaf(
                        leafs[i].level1Index,
                        leafs[i].leaf as RawLeaf
                    );
                }
            }
        }
    }

    get root(): Field {
        return this._level1.getRoot();
    }

    get level1(): Level1MT {
        return this._level1;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return new Level1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getWitness(level1Index: Field): Level1Witness {
        return this.getLevel1Witness(level1Index);
    }

    updateLeaf(level1Index: Field, leaf: Field): void {
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(level1Index: Field, rawLeaf: RawLeaf): void {
        let leaf = this.calculateLeaf(rawLeaf);
        this._level1.setLeaf(level1Index.toBigInt(), leaf);
        this._leafs[level1Index.toString()] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

export type TotalRLeaf = GroupVector;
export class TotalRStorage extends FundingStorage<TotalRLeaf> {
    static calculateLeaf(totalRLeaf: TotalRLeaf): Field {
        return Poseidon.hash(totalRLeaf.toFields());
    }

    calculateLeaf(totalRLeaf: TotalRLeaf): Field {
        return TotalRStorage.calculateLeaf(totalRLeaf);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return TotalRStorage.calculateLevel1Index(campaignId);
    }
}

export type TotalMLeaf = GroupVector;
export class TotalMStorage extends FundingStorage<TotalMLeaf> {
    static calculateLeaf(totalMLeaf: TotalMLeaf): Field {
        return Poseidon.hash(totalMLeaf.toFields());
    }

    calculateLeaf(totalMLeaf: TotalMLeaf): Field {
        return TotalRStorage.calculateLeaf(totalMLeaf);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return TotalMStorage.calculateLevel1Index(campaignId);
    }
}

export type TotalAmountLeaf = Field;
export class TotalAmountStorage extends FundingStorage<TotalAmountLeaf> {
    static calculateLeaf(totalAmount: TotalAmountLeaf): Field {
        return totalAmount;
    }

    calculateLeaf(totalAmount: TotalAmountLeaf): Field {
        return TotalAmountStorage.calculateLeaf(totalAmount);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return TotalAmountStorage.calculateLevel1Index(campaignId);
    }
}

export class ScalarVector extends ScalarDynamicArray(
    INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE
) {}

export class GroupVector extends GroupDynamicArray(
    INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE
) {}

export function getCommitmentHash(
    nullifier: Field,
    projectId: Field,
    amount: UInt64
): Field {
    return Poseidon.hash(
        nullifier
            .toFields()
            .concat(projectId.toFields())
            .concat(amount.toFields())
    );
}
