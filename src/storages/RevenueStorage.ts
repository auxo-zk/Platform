import {
    Bool,
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
    UInt64,
} from 'o1js';
import { CampaignStorage } from './CampaignStorage.js';
import { INSTANCE_LIMITS } from '../Constants.js';

const LEVEL_1_REVENUE_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.REVENUE_TREE_SIZE)) + 1;

class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL_1_REVENUE_TREE_HEIGHT) {}

const EMPTY_LEVEL_1_REVENUE_TREE = () =>
    new Level1MT(LEVEL_1_REVENUE_TREE_HEIGHT);

const DefaultRootForRevenueTree = EMPTY_LEVEL_1_REVENUE_TREE().getRoot();

abstract class RevenueStorage<RawLeaf> {
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
        this._level1 = EMPTY_LEVEL_1_REVENUE_TREE();
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

class RevenueInfo extends Struct({
    campaignId: Field,
    projectId: Field,
    amount: UInt64, // in MINIMAL_MINA_UNIT
}) {
    static fromFields(fields: Field[]): RevenueInfo {
        return super.fromFields(fields) as RevenueInfo;
    }
}

type RevenueInfoLeaf = RevenueInfo;
class RevenueInfoStorage extends RevenueStorage<RevenueInfoLeaf> {
    static calculateLeaf(revenueInfo: RevenueInfoLeaf): Field {
        return Poseidon.hash(RevenueInfo.toFields(revenueInfo));
    }

    calculateLeaf(revenueInfo: RevenueInfoLeaf): Field {
        return RevenueInfoStorage.calculateLeaf(revenueInfo);
    }

    static calculateLevel1Index(revenueId: Field): Field {
        return revenueId;
    }

    calculateLevel1Index(revenueId: Field): Field {
        return RevenueInfoStorage.calculateLevel1Index(revenueId);
    }
}

export {
    LEVEL_1_REVENUE_TREE_HEIGHT,
    EMPTY_LEVEL_1_REVENUE_TREE,
    DefaultRootForRevenueTree,
    RevenueStorage,
    RevenueInfo,
    RevenueInfoLeaf,
    RevenueInfoStorage,
    Level1MT as RevenueLevel1MT,
    Level1Witness as RevenueLevel1Witness,
};
