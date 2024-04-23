import {
    Bool,
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    Struct,
    UInt64,
} from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';

const LEVEL_1_VESTING_COMBINE_TREE_HEIGHT =
    Math.ceil(
        Math.log2(
            INSTANCE_LIMITS.VESTING_MAX_TIMES *
                INSTANCE_LIMITS.CAMPAIGN_TREE_SIZE
        )
    ) + 1;

const LEVEL_1_VESTING_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN_TREE_SIZE)) + 1;

class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL_1_VESTING_TREE_HEIGHT) {}
class Level1CombineWitness extends MerkleWitness(
    LEVEL_1_VESTING_COMBINE_TREE_HEIGHT
) {}

const EMPTY_LEVEL_1_VESTING_TREE = () =>
    new Level1MT(LEVEL_1_VESTING_TREE_HEIGHT);

const EMPTY_LEVEL_1_VESTING_COMBINE_TREE = () =>
    new Level1MT(LEVEL_1_VESTING_COMBINE_TREE_HEIGHT);

const DefaultRootForVestingTree = EMPTY_LEVEL_1_VESTING_TREE().getRoot();
const DefaultRootForVestingCombineTree =
    EMPTY_LEVEL_1_VESTING_COMBINE_TREE().getRoot();

abstract class VestingStorage<RawLeaf> {
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
        this._level1 = EMPTY_LEVEL_1_VESTING_TREE();
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

abstract class VestingStorageForCombineTree<RawLeaf> {
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
        this._level1 = EMPTY_LEVEL_1_VESTING_COMBINE_TREE();
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

    getLevel1Witness(level1Index: Field): Level1CombineWitness {
        return new Level1CombineWitness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getWitness(level1Index: Field): Level1CombineWitness {
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

type LastVestingIdLeaf = Field;

class VestingIdStorage extends VestingStorage<LastVestingIdLeaf> {
    static calculateLeaf(lastVestingId: LastVestingIdLeaf): Field {
        return lastVestingId;
    }

    calculateLeaf(lastVestingId: LastVestingIdLeaf): Field {
        return VestingIdStorage.calculateLeaf(lastVestingId);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return VestingIdStorage.calculateLevel1Index(campaignId);
    }
}

type BalanceLeaf = Field;
class VestingBalanceStorage extends VestingStorage<BalanceLeaf> {
    static calculateLeaf(balance: BalanceLeaf): Field {
        return balance;
    }

    calculateLeaf(balance: BalanceLeaf): Field {
        return VestingBalanceStorage.calculateLeaf(balance);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return VestingBalanceStorage.calculateLevel1Index(campaignId);
    }
}

class VestingInfo extends Struct({
    campaignId: Field,
    amount: UInt64,
    deadline: UInt64,
    claimed: Bool,
}) {
    static fromFields(fields: Field[]): VestingInfo {
        return super.fromFields(fields) as VestingInfo;
    }
}

type VestingInfoLeaf = VestingInfo;
class VestingInfoStorage extends VestingStorageForCombineTree<VestingInfoLeaf> {
    static calculateLeaf(vestingInfo: VestingInfoLeaf): Field {
        return Poseidon.hash(VestingInfo.toFields(vestingInfo));
    }

    calculateLeaf(vestingInfo: VestingInfoLeaf): Field {
        return VestingInfoStorage.calculateLeaf(vestingInfo);
    }

    static calculateLevel1Index({
        campaignId,
        vestingId,
    }: {
        campaignId: Field;
        vestingId: Field;
    }): Field {
        return campaignId.mul(INSTANCE_LIMITS.VESTING_MAX_TIMES).add(vestingId);
    }

    calculateLevel1Index({
        campaignId,
        vestingId,
    }: {
        campaignId: Field;
        vestingId: Field;
    }): Field {
        return VestingInfoStorage.calculateLevel1Index({
            campaignId,
            vestingId,
        });
    }
}

export {
    LEVEL_1_VESTING_TREE_HEIGHT,
    LEVEL_1_VESTING_COMBINE_TREE_HEIGHT,
    EMPTY_LEVEL_1_VESTING_TREE,
    EMPTY_LEVEL_1_VESTING_COMBINE_TREE,
    DefaultRootForVestingTree,
    DefaultRootForVestingCombineTree,
    VestingStorage,
    VestingStorageForCombineTree,
    LastVestingIdLeaf,
    VestingIdStorage,
    BalanceLeaf,
    VestingBalanceStorage,
    VestingInfo,
    VestingInfoLeaf,
    VestingInfoStorage,
    Level1MT as VestingLevel1MT,
    Level1Witness as VestingLevel1Witness,
    Level1CombineWitness as VestingLevel1CombineWitness,
};
