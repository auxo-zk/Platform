import { Field, MerkleTree, MerkleWitness, Poseidon } from 'o1js';
import { INSTANCE_LIMITS } from '../constants.js';
import { IPFSHash } from '@auxo-dev/auxo-libs';

export const LEVEL_1_COMBINED_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN * INSTANCE_LIMITS.PROJECT)) +
    1;

export const LEVEL_1_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN)) + 1;

export class Level1CMT extends MerkleTree {}
export class Level1CWitness extends MerkleWitness(
    LEVEL_1_COMBINED_TREE_HEIGHT
) {}

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_TREE_HEIGHT) {}

export const EMPTY_LEVEL_1_COMBINED_TREE = () =>
    new Level1CMT(LEVEL_1_COMBINED_TREE_HEIGHT);

export const EMPTY_LEVEL_1_TREE = () => new Level1MT(LEVEL_1_TREE_HEIGHT);

export abstract class ParticipationCStorage<RawLeaf> {
    private _level1: Level1CMT;
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_COMBINED_TREE();
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

export abstract class ParticipationStorage<RawLeaf> {
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

export type IndexLeaf = Field;

export class IndexStorage extends ParticipationCStorage<IndexLeaf> {
    static calculateLeaf(index: IndexLeaf): Field {
        return index;
    }

    calculateLeaf(index: IndexLeaf): Field {
        return IndexStorage.calculateLeaf(index);
    }

    static calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return campaignId.mul(INSTANCE_LIMITS.PROJECT).add(projectId);
    }

    calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return IndexStorage.calculateLevel1Index({ campaignId, projectId });
    }
}

export type InfoLeaf = IPFSHash;

export class InfoStorage extends ParticipationCStorage<InfoLeaf> {
    static calculateLeaf(ipfsHash: InfoLeaf): Field {
        return Poseidon.hash(ipfsHash.toFields());
    }

    calculateLeaf(ipfsHash: InfoLeaf): Field {
        return InfoStorage.calculateLeaf(ipfsHash);
    }

    static calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return campaignId.mul(INSTANCE_LIMITS.PROJECT).add(projectId);
    }

    calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return InfoStorage.calculateLevel1Index({ campaignId, projectId });
    }
}

export type CounterLeaf = Field;

export class CounterStorage extends ParticipationStorage<CounterLeaf> {
    static calculateLeaf(counter: CounterLeaf): Field {
        return counter;
    }

    calculateLeaf(counter: CounterLeaf): Field {
        return CounterStorage.calculateLeaf(counter);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return CounterStorage.calculateLevel1Index(campaignId);
    }
}
