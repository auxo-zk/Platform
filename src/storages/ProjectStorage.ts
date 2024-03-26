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

const LEVEL_1_PROJECT_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.PROJECT_TREE_SIZE)) + 1;
const LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.PROJECT_MEMBER_TREE_SIZE)) + 1;

class Level1MT extends MerkleTree {}
class Level1Witness extends MerkleWitness(LEVEL_1_PROJECT_TREE_HEIGHT) {}
class Level2MT extends MerkleTree {}
class Level2Witness extends MerkleWitness(LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT) {}

const EMPTY_LEVEL_1_PROJECT_TREE = () =>
    new Level1MT(LEVEL_1_PROJECT_TREE_HEIGHT);
const EMPTY_LEVEL_2_PROJECT_MEMBER_TREE = () =>
    new Level2MT(LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT);

const DefaultRootForProjectTree = EMPTY_LEVEL_1_PROJECT_TREE().getRoot();
const DefaultRootForProjectMemberTree =
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE().getRoot();

class FullWitness extends Struct({
    level1: Level1Witness,
    level2: Level2Witness,
}) {}

// Storage
abstract class ProjectStorage<RawLeaf> {
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
    ): Level1Witness | FullWitness {
        if (level2Index) {
            return new FullWitness({
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

type ProjectMemberLeaf = PublicKey;

class ProjectMemberStorage extends ProjectStorage<ProjectMemberLeaf> {
    static calculateLeaf(publicKey: ProjectMemberLeaf): Field {
        return Poseidon.hash(publicKey.toFields());
    }

    calculateLeaf(publicKey: ProjectMemberLeaf): Field {
        return ProjectMemberStorage.calculateLeaf(publicKey);
    }

    static calculateLevel1Index(projectId: Field): Field {
        return projectId;
    }

    calculateLevel1Index(projectId: Field): Field {
        return ProjectMemberStorage.calculateLevel1Index(projectId);
    }

    static calculateLevel2Index(memberId: Field): Field {
        return memberId;
    }

    calculateLevel2Index(memberId: Field): Field {
        return ProjectMemberStorage.calculateLevel2Index(memberId);
    }

    getWitness(level1Index: Field, level2Index: Field): FullWitness {
        return super.getWitness(level1Index, level2Index) as FullWitness;
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
        rawLeaf: ProjectMemberLeaf
    ): void {
        super.updateRawLeaf({ level1Index, level2Index }, rawLeaf);
    }
}

type TreasuryAddressLeaf = PublicKey;

class TreasuryAddressStorage extends ProjectStorage<TreasuryAddressLeaf> {
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

type IpfsHashLeaf = IpfsHash;

class IpfsHashStorage extends ProjectStorage<IpfsHashLeaf> {
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

class MemberArray extends PublicKeyDynamicArray(
    INSTANCE_LIMITS.PROJECT_MEMBER_TREE_SIZE
) {}

enum ProjectActionEnum {
    CREATE_PROJECT,
    UPDATE_PROJECT,
}

export {
    LEVEL_1_PROJECT_TREE_HEIGHT,
    LEVEL_2_PROJECT_MEMBER_TREE_HEIGHT,
    EMPTY_LEVEL_1_PROJECT_TREE,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    DefaultRootForProjectTree,
    DefaultRootForProjectMemberTree,
    ProjectStorage,
    ProjectMemberStorage,
    TreasuryAddressStorage,
    IpfsHashStorage,
    ProjectMemberLeaf,
    TreasuryAddressLeaf,
    IpfsHashLeaf,
    MemberArray,
    ProjectActionEnum,
    Level1MT as ProjectLevel1MT,
    Level2MT as ProjectLevel2MT,
    FullWitness as ProjectFullWitness,
    Level1Witness as ProjectMemberLevel1Witness,
    Level2Witness as ProjectMemberLevel2Witness,
    Level1Witness as TreasuryAddressLevel1Witness,
    Level1Witness as IpfsHashLevel1Witness,
};
