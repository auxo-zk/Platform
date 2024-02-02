import { Field, MerkleTree, MerkleWitness, Poseidon } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { ZkApp } from '@auxo-dev/dkg';

export const LEVEL_1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

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
        this._level1 = EMPTY_LEVEL_1_TREE();
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

export type ValueLeaf = ZkApp.Request.RequestVector;

export class ValueStorage extends FundingStorage<ValueLeaf> {
    static calculateLeaf(requestVecor: ValueLeaf): Field {
        return Poseidon.hash(requestVecor.toFields());
    }

    calculateLeaf(requestVecor: ValueLeaf): Field {
        return ValueStorage.calculateLeaf(requestVecor);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return ValueStorage.calculateLevel1Index(campaignId);
    }
}

export type RequestIdLeaf = Field;

export class RequestIdStorage extends FundingStorage<RequestIdLeaf> {
    static calculateLeaf(requestId: RequestIdLeaf): Field {
        return requestId;
    }

    calculateLeaf(requestId: RequestIdLeaf): Field {
        return RequestIdStorage.calculateLeaf(requestId);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return RequestIdStorage.calculateLevel1Index(campaignId);
    }
}

export type TotalFundLeaf = Field;

export class TotalFundStorage extends FundingStorage<RequestIdLeaf> {
    static calculateLeaf(totalFundAmount: TotalFundLeaf): Field {
        return totalFundAmount;
    }

    calculateLeaf(totalFundAmount: TotalFundLeaf): Field {
        return TotalFundStorage.calculateLeaf(totalFundAmount);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return TotalFundStorage.calculateLevel1Index(campaignId);
    }
}
