import { Bool, Field, MerkleTree, MerkleWitness, UInt8 } from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import { CampaignStorage, CampaignLevel1Witness } from './CampaignStorage.js';

const LEVEL_1_TREASURY_MANAGER_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.TREASURY_MANAGER_TREE_SIZE)) + 1;

class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(
    LEVEL_1_TREASURY_MANAGER_TREE_HEIGHT
) {}

const EMPTY_LEVEL_1_TREASURY_MANAGER_TREE = () =>
    new Level1MT(LEVEL_1_TREASURY_MANAGER_TREE_HEIGHT);

const DefaultRootForTreasuryManagerTree =
    EMPTY_LEVEL_1_TREASURY_MANAGER_TREE().getRoot();

// Storage
abstract class TreasuryManagerStorage<RawLeaf> {
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
        this._level1 = EMPTY_LEVEL_1_TREASURY_MANAGER_TREE();
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

type ClaimedIndexLeaf = Bool;
class ClaimedIndexStorage extends TreasuryManagerStorage<ClaimedIndexLeaf> {
    static calculateLeaf(claimed: ClaimedIndexLeaf): Field {
        return claimed.toField();
    }

    calculateLeaf(claimed: ClaimedIndexLeaf): Field {
        return ClaimedIndexStorage.calculateLeaf(claimed);
    }

    static calculateLevel1Index({
        campaignId,
        dimensionIndex,
    }: {
        campaignId: Field;
        dimensionIndex: UInt8;
    }): Field {
        return campaignId
            .mul(INSTANCE_LIMITS.PARTICIPATION_SLOT_TREE_SIZE)
            .add(Field.fromFields(dimensionIndex.toUInt64().toFields()));
    }

    calculateLevel1Index({
        campaignId,
        dimensionIndex,
    }: {
        campaignId: Field;
        dimensionIndex: UInt8;
    }): Field {
        return ClaimedIndexStorage.calculateLevel1Index({
            campaignId,
            dimensionIndex,
        });
    }
}

enum CampaignStateEnum {
    NOT_ENDED,
    COMPLETED,
    ABORTED,
}

type CampaignStateLeaf = CampaignStateEnum;
class CampaignStateStorage extends CampaignStorage<CampaignStateLeaf> {
    static calculateLeaf(campaignState: CampaignStateLeaf): Field {
        return Field(campaignState);
    }

    calculateLeaf(campaignState: CampaignStateLeaf): Field {
        return CampaignStateStorage.calculateLeaf(campaignState);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return CampaignStateStorage.calculateLevel1Index(campaignId);
    }
}

enum TreasuryManagerActionEnum {
    COMPLETE_CAMPAIGN,
    ABORT_CAMPAIGN,
    CLAIM_FUND,
}

export {
    LEVEL_1_TREASURY_MANAGER_TREE_HEIGHT,
    EMPTY_LEVEL_1_TREASURY_MANAGER_TREE,
    DefaultRootForTreasuryManagerTree,
    TreasuryManagerStorage,
    ClaimedIndexStorage,
    CampaignStateStorage,
    ClaimedIndexLeaf,
    CampaignStateLeaf,
    CampaignStateEnum,
    TreasuryManagerActionEnum,
    Level1MT as TreasuryManagerLevel1MT,
    Level1Witness as TreasuryManagerLevel1Witness,
    Level1Witness as ClaimedIndexLevel1Witness,
    CampaignLevel1Witness as CampaignStateLevel1Witness,
};
