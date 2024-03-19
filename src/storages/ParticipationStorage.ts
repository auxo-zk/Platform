import { Field, MerkleTree, MerkleWitness, Poseidon } from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import { IpfsHash } from '@auxo-dev/auxo-libs';

export const LEVEL_1_PARTICIPATION_INDEX_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.PARTICIPATION_INDEX_TREE_SIZE)) + 1;

export const LEVEL_1_CAMPAIGN_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.CAMPAIGN_TREE_SIZE)) + 1;

export class Level1CMT extends MerkleTree {}
export class Level1CWitness extends MerkleWitness(
    LEVEL_1_PARTICIPATION_INDEX_TREE_HEIGHT
) {}

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(
    LEVEL_1_CAMPAIGN_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_COMBINED_TREE = () =>
    new Level1CMT(LEVEL_1_PARTICIPATION_INDEX_TREE_HEIGHT);

export const EMPTY_LEVEL_1_TREE = () =>
    new Level1MT(LEVEL_1_CAMPAIGN_TREE_HEIGHT);

export const DefaultLevel1Root = EMPTY_LEVEL_1_TREE().getRoot();
export const DefaultLevel1CombinedRoot =
    EMPTY_LEVEL_1_COMBINED_TREE().getRoot();
export const DefaultRootForParticipationIndexRoot =
    EMPTY_LEVEL_1_COMBINED_TREE().getRoot();

export abstract class ParticipationIndexStorage<RawLeaf> {
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

    get level1(): Level1CMT {
        return this._level1;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1CWitness {
        return new Level1CWitness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getWitness(level1Index: Field): Level1CWitness {
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

export type ProjectIndexLeaf = Field;

export class ProjectIndexStorage extends ParticipationIndexStorage<ProjectIndexLeaf> {
    static calculateLeaf(index: ProjectIndexLeaf): Field {
        return index;
    }

    calculateLeaf(index: ProjectIndexLeaf): Field {
        return ProjectIndexStorage.calculateLeaf(index);
    }

    static calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return campaignId.mul(INSTANCE_LIMITS.PROJECT_TREE_SIZE).add(projectId);
    }

    calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return ProjectIndexStorage.calculateLevel1Index({
            campaignId,
            projectId,
        });
    }
}

export type IpfsHashLeaf = IpfsHash;

export class IpfsHashStorage extends ParticipationIndexStorage<IpfsHashLeaf> {
    static calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return Poseidon.hash(ipfsHash.toFields());
    }

    calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return IpfsHashStorage.calculateLeaf(ipfsHash);
    }

    static calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return campaignId.mul(INSTANCE_LIMITS.PROJECT_TREE_SIZE).add(projectId);
    }

    calculateLevel1Index({
        campaignId,
        projectId,
    }: {
        campaignId: Field;
        projectId: Field;
    }): Field {
        return IpfsHashStorage.calculateLevel1Index({ campaignId, projectId });
    }
}

export type ProjectCounterLeaf = Field;

export class ProjectCounterStorage extends ParticipationStorage<ProjectCounterLeaf> {
    static calculateLeaf(counter: ProjectCounterLeaf): Field {
        return counter;
    }

    calculateLeaf(counter: ProjectCounterLeaf): Field {
        return ProjectCounterStorage.calculateLeaf(counter);
    }

    static calculateLevel1Index(campaignId: Field): Field {
        return campaignId;
    }

    calculateLevel1Index(campaignId: Field): Field {
        return ProjectCounterStorage.calculateLevel1Index(campaignId);
    }
}