import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
    UInt64,
} from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import {
    BoolDynamicArray,
    DynamicArray,
    GroupDynamicArray,
    ScalarDynamicArray,
} from '@auxo-dev/auxo-libs';
import { Constants as DkgConstants, Libs as DkgLibs } from '@auxo-dev/dkg';

const LEVEL_1_FUNDING_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.FUNDING_TREE_SIZE)) + 1;

class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL_1_FUNDING_TREE_HEIGHT) {}

const EMPTY_LEVEL_1_FUNDING_TREE = () =>
    new Level1MT(LEVEL_1_FUNDING_TREE_HEIGHT);

const DefaultRootForFundingTree = EMPTY_LEVEL_1_FUNDING_TREE().getRoot();

abstract class FundingStorage<RawLeaf> {
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
        this._level1 = EMPTY_LEVEL_1_FUNDING_TREE();
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

type FundingInformationLeaf = FundingInformation;
class FundingInformationStorage extends FundingStorage<FundingInformationLeaf> {
    static calculateLeaf(fundingInformation: FundingInformationLeaf): Field {
        return fundingInformation.hash();
    }

    calculateLeaf(fundingInformation: FundingInformationLeaf): Field {
        return FundingInformationStorage.calculateLeaf(fundingInformation);
    }

    static calculateLevel1Index(fundingId: Field): Field {
        return fundingId;
    }

    calculateLevel1Index(fundingId: Field): Field {
        return FundingInformationStorage.calculateLevel1Index(fundingId);
    }
}

enum FundingActionEnum {
    FUND,
    REFUND,
}

enum FundingStateEnum {
    NOT_EXISTED,
    FUNDED,
    REFUNDED,
}

class FundingInformation extends Struct({
    campaignId: Field,
    investor: PublicKey,
    amount: UInt64,
}) {
    hash() {
        return Poseidon.hash(
            [
                this.campaignId,
                this.investor.toFields(),
                this.amount.toFields(),
            ].flat()
        );
    }
}

class ExistedIndexFlag extends BoolDynamicArray(
    DkgConstants.ENCRYPTION_LIMITS.DIMENSION
) {}

class AmountVector extends DynamicArray(
    UInt64,
    DkgConstants.ENCRYPTION_LIMITS.DIMENSION
) {}

export {
    LEVEL_1_FUNDING_TREE_HEIGHT,
    EMPTY_LEVEL_1_FUNDING_TREE,
    DefaultRootForFundingTree,
    FundingStorage,
    FundingInformationStorage,
    FundingInformation,
    FundingInformationLeaf,
    FundingStateEnum,
    FundingActionEnum,
    Level1MT as FundingLevel1MT,
    Level1Witness as FundingLevel1Witness,
    Level1Witness as FundingInformationLevel1Witness,
    ExistedIndexFlag,
    AmountVector
};
