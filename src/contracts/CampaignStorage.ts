import { Field, MerkleTree, MerkleWitness, Poseidon, PublicKey } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';

export const LEVEL_1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

// Storage
export abstract class CampaignStorage<RawLeaf> {
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

export type InfoLeaf = IPFSHash;

export class InfoStorage extends CampaignStorage<InfoLeaf> {
    static calculateLeaf(ipfsHash: InfoLeaf): Field {
        return Poseidon.hash(ipfsHash.toFields());
    }

    calculateLeaf(ipfsHash: InfoLeaf): Field {
        return InfoStorage.calculateLeaf(ipfsHash);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return InfoStorage.calculateLevel1Index(campaignId);
    }
}

export type OwnerLeaf = PublicKey;

export class OwnerStorage extends CampaignStorage<OwnerLeaf> {
    static calculateLeaf(publicKey: OwnerLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: OwnerLeaf): Field {
        return OwnerStorage.calculateLeaf(publicKey);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return OwnerStorage.calculateLevel1Index(campaignId);
    }
}

export type StatusLeaf = StatusEnum;

export class StatusStorage extends CampaignStorage<StatusLeaf> {
    static calculateLeaf(status: StatusLeaf): Field {
        return Field(status);
    }

    calculateLeaf(status: StatusLeaf): Field {
        return StatusStorage.calculateLeaf(status);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return StatusStorage.calculateLevel1Index(campaignId);
    }
}

export type ConfigLeaf = {
    committeeId: Field;
    keyId: Field;
};

export class ConfigStorage extends CampaignStorage<ConfigLeaf> {
    static calculateLeaf(rawLeaf: ConfigLeaf): Field {
        return Poseidon.hash([rawLeaf.committeeId, rawLeaf.keyId]);
    }

    calculateLeaf(rawLeaf: ConfigLeaf): Field {
        return ConfigStorage.calculateLeaf(rawLeaf);
    }

    static calculateLevel1Index(projectId: Field): Field {
        return projectId;
    }

    calculateLevel1Index(projectId: Field): Field {
        return ConfigStorage.calculateLevel1Index(projectId);
    }
}

// Type
export const enum StatusEnum {
    NOT_STARTED,
    APPLICATION,
    FUNDING,
    ALLOCATED,
    FINALIZE_ROUND_1,
    __LENGTH,
}
