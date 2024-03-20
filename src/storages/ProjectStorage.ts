import {
    Field,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import { INSTANCE_LIMITS } from '../Constants.js';
import { IpfsHash, PublicKeyDynamicArray } from '@auxo-dev/auxo-libs';

export const LEVEL_1_PROJECT_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.PROJECT_TREE_SIZE)) + 1;
export const LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.PROJECT_MEMBER_TREE_SIZE)) + 1;

export class Level1MT extends MerkleTree {}
export class Level1Witness extends MerkleWitness(LEVEL_1_PROJECT_TREE_HEIGHT) {}
export class Level2MT extends MerkleTree {}
export class Level2Witness extends MerkleWitness(
    LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT
) {}

export const EMPTY_LEVEL_1_PROJECT_TREE = () =>
    new Level1MT(LEVEL_1_PROJECT_TREE_HEIGHT);
export const EMPTY_LEVEL_2_PROJECT_MEMBER_TREE = () =>
    new Level2MT(LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT);

export const DefaultRootForProjectTree = EMPTY_LEVEL_1_PROJECT_TREE().getRoot();
export const DefaultRootForProjectMemberTree =
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE().getRoot();

export class FullMTWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

// Storage
export abstract class ProjectStorage<RawLeaf> {
    private _level1: Level1MT;
    private _level2s: { [key: string]: Level2MT };
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            level2Index?: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_LEVEL_1_PROJECT_TREE();
        this._level2s = {};
        this._leafs = {};
        if (leafs) {
            for (let i = 0; i < leafs.length; i++) {
                if (leafs[i].leaf instanceof Field) {
                    this.updateLeaf(
                        {
                            level1Index: leafs[i].level1Index,
                            level2Index: leafs[i].level2Index,
                        },
                        leafs[i].leaf as Field
                    );
                } else {
                    this.updateRawLeaf(
                        {
                            level1Index: leafs[i].level1Index,
                            level2Index: leafs[i].level2Index,
                        },
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

    get level2s(): { [key: string]: Level2MT } {
        return this._level2s;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    calculateLevel2Index?(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return new Level1Witness(
            this._level1.getWitness(level1Index.toBigInt())
        );
    }

    getLevel2Witness(level1Index: Field, level2Index: Field): Level2Witness {
        let level2 = this._level2s[level1Index.toString()];
        if (level2 === undefined)
            throw new Error('Level 2 MT does not exist at this index');
        return new Level2Witness(level2.getWitness(level2Index.toBigInt()));
    }

    getWitness(
        level1Index: Field,
        level2Index?: Field
    ): Level1Witness | FullMTWitness {
        if (level2Index) {
            return new FullMTWitness({
                level1: this.getLevel1Witness(level1Index),
                level2: this.getLevel2Witness(level1Index, level2Index),
            });
        } else {
            return this.getLevel1Witness(level1Index);
        }
    }

    updateInternal(level1Index: Field, level2: Level2MT) {
        Object.assign(this._level2s, {
            [level1Index.toString()]: level2,
        });
        this._level1.setLeaf(level1Index.toBigInt(), level2.getRoot());
    }

    updateLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        leaf: Field
    ): void {
        let leafId = level1Index.toString();
        if (level2Index) {
            leafId += '-' + level2Index.toString();
            let level2 = this._level2s[level1Index.toString()];
            if (level2 === undefined)
                level2 = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();

            level2.setLeaf(level2Index.toBigInt(), leaf);
            this.updateInternal(level1Index, level2);
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index?: Field },
        rawLeaf: RawLeaf
    ): void {
        let leafId = level1Index.toString();
        let leaf = this.calculateLeaf(rawLeaf);
        if (level2Index) {
            leafId += '-' + level2Index.toString();
            let level2 = this._level2s[level1Index.toString()];
            if (level2 === undefined)
                level2 = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();

            level2.setLeaf(level2Index.toBigInt(), leaf);
            this.updateInternal(level1Index, level2);
        } else this._level1.setLeaf(level1Index.toBigInt(), leaf);

        this._leafs[leafId] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

export type MemberLeaf = PublicKey;

export class MemberStorage extends ProjectStorage<MemberLeaf> {
    static calculateLeaf(publicKey: MemberLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: MemberLeaf): Field {
        return MemberStorage.calculateLeaf(publicKey);
    }

    static calculateLevel1Index(projectId: Field): Field {
        return projectId;
    }

    calculateLevel1Index(projectId: Field): Field {
        return MemberStorage.calculateLevel1Index(projectId);
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return MemberStorage.calculateLevel2Index(memberId);
    }

    getWitness(level1Index: Field, level2Index: Field): FullMTWitness {
        return super.getWitness(level1Index, level2Index) as FullMTWitness;
    }

    updateLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index: Field },
        leaf: Field
    ): void {
        super.updateLeaf({ level1Index, level2Index }, leaf);
    }

    updateRawLeaf(
        {
            level1Index,
            level2Index,
        }: { level1Index: Field; level2Index: Field },
        rawLeaf: MemberLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

export type TreasuryAddressLeaf = PublicKey;

export class TreasuryAddressStorage extends ProjectStorage<TreasuryAddressLeaf> {
    static calculateLeaf(address: TreasuryAddressLeaf): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLeaf(address: TreasuryAddressLeaf): Field {
        return TreasuryAddressStorage.calculateLeaf(address);
    }

    static calculateLevel1Index(projectId: Field): Field {
        return projectId;
    }

    calculateLevel1Index(projectId: Field): Field {
        return TreasuryAddressStorage.calculateLevel1Index(projectId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: TreasuryAddressLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export type IpfsHashLeaf = IpfsHash;

export class IpfsHashStorage extends ProjectStorage<IpfsHashLeaf> {
    static calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return Poseidon.hash(ipfsHash.toFields());
    }

    calculateLeaf(ipfsHash: IpfsHashLeaf): Field {
        return IpfsHashStorage.calculateLeaf(ipfsHash);
    }

    static calculateLevel1Index(projectId: Field): Field {
        return projectId;
    }

    calculateLevel1Index(projectId: Field): Field {
        return IpfsHashStorage.calculateLevel1Index(projectId);
    }

    getWitness(level1Index: Field): Level1Witness {
        return super.getWitness(level1Index) as Level1Witness;
    }

    updateLeaf({ level1Index }: { level1Index: Field }, leaf: Field): void {
        super.updateLeaf({ level1Index }, leaf);
    }

    updateRawLeaf(
        { level1Index }: { level1Index: Field },
        rawLeaf: IpfsHashLeaf
    ): void {
        super.updateRawLeaf({ level1Index }, rawLeaf);
    }
}

export class MemberArray extends PublicKeyDynamicArray(
    INSTANCE_LIMITS.PROJECT_MEMBER_TREE_SIZE
) {}

export enum ProjectActionEnum {
    CREATE_PROJECT,
    UPDATE_PROJECT,
}
