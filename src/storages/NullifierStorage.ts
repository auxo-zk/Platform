import {
    Bool,
    PublicKey,
    Field,
    MerkleMap,
    MerkleMapWitness,
    Poseidon,
} from 'o1js';

class Level1MM extends MerkleMap {}
class Level1Witness extends MerkleMapWitness {}
const EMPTY_NULLIFIER_MAP = () => new MerkleMap();

const DefaultRootForNullifierMap = EMPTY_NULLIFIER_MAP().getRoot();

abstract class NullifierStorageBase<RawLeaf> {
    private _level1: Level1MM;
    private _leafs: {
        [key: string]: { raw: RawLeaf | undefined; leaf: Field };
    };

    constructor(
        leafs?: {
            level1Index: Field;
            leaf: RawLeaf | Field;
        }[]
    ) {
        this._level1 = EMPTY_NULLIFIER_MAP();
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

    get level1(): Level1MM {
        return this._level1;
    }

    get leafs(): { [key: string]: { raw: RawLeaf | undefined; leaf: Field } } {
        return this._leafs;
    }

    abstract calculateLeaf(rawLeaf: RawLeaf): Field;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    abstract calculateLevel1Index(args: any): Field;

    getLevel1Witness(level1Index: Field): Level1Witness {
        return this._level1.getWitness(level1Index);
    }

    getWitness(level1Index: Field): Level1Witness {
        return this.getLevel1Witness(level1Index);
    }

    updateLeaf(level1Index: Field, leaf: Field): void {
        this._level1.set(level1Index, leaf);
        this._leafs[level1Index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateRawLeaf(level1Index: Field, rawLeaf: RawLeaf): void {
        let leaf = this.calculateLeaf(rawLeaf);
        this._level1.set(level1Index, leaf);
        this._leafs[level1Index.toString()] = {
            raw: rawLeaf,
            leaf: leaf,
        };
    }
}

type NullifierLeaf = Bool;

class NullifierStorage extends NullifierStorageBase<NullifierLeaf> {
    static calculateLeaf(used: NullifierLeaf): Field {
        return used.toField();
    }

    calculateLeaf(used: NullifierLeaf): Field {
        return NullifierStorage.calculateLeaf(used);
    }

    static calculateLevel1Index({
        nullifier,
        projectId, // since one nullifier can be used for many
        vestingId,
        senderAddress,
    }: {
        nullifier: Field;
        projectId: Field;
        vestingId: Field;
        senderAddress: PublicKey;
    }): Field {
        return Poseidon.hash([
            nullifier,
            projectId,
            vestingId,
            ...senderAddress.toFields(),
        ]);
    }

    calculateLevel1Index({
        nullifier,
        projectId, // since one nullifier can be used for many
        vestingId,
        senderAddress,
    }: {
        nullifier: Field;
        projectId: Field;
        vestingId: Field;
        senderAddress: PublicKey;
    }): Field {
        return NullifierStorage.calculateLevel1Index({
            nullifier,
            projectId, // since one nullifier can be used for many
            vestingId,
            senderAddress,
        });
    }
}

export {
    EMPTY_NULLIFIER_MAP,
    DefaultRootForNullifierMap,
    NullifierStorageBase,
    NullifierStorage,
    NullifierLeaf,
    Level1MM as NullifierLevel1MM,
    Level1Witness as NullifierLevel1Witness,
};
