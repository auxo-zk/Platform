import {
    Field,
    MerkleMap,
    MerkleMapWitness,
    MerkleTree,
    MerkleWitness,
    Poseidon,
    PublicKey,
    Struct,
} from 'o1js';
import { ErrorEnum, INSTANCE_LIMITS, ZkAppEnum } from '../Constants.js';
import { Utils } from '@auxo-dev/auxo-libs';
// import { buildAssertMessage } from '../libs/utils.js';

export const ZKAPP_TREE_HEIGHT =
    Math.ceil(Math.log2(INSTANCE_LIMITS.ZKAPP_ADDRESS_TREE_SIZE)) + 1;
export class AddressMT extends MerkleTree {}
export class AddressWitness extends MerkleWitness(ZKAPP_TREE_HEIGHT) {}
export const EMPTY_ZKAPP_MT = () => new AddressMT(ZKAPP_TREE_HEIGHT);
export class ReduceWitness extends MerkleMapWitness {}
export const EMPTY_REDUCE_MT = () => new MerkleMap();

export const DefaultRootForZkAppTree = EMPTY_ZKAPP_MT().getRoot();

export class ZkAppRef extends Struct({
    address: PublicKey,
    witness: AddressWitness,
}) {}

export class ZkAppStorage {
    private _addressMap: AddressMT;
    private _addresses: {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    };

    constructor(addresses?: { index: Field | number; address: PublicKey }[]) {
        this._addressMap = EMPTY_ZKAPP_MT();
        this._addresses = {};
        if (addresses) {
            for (let i = 0; i < addresses.length; i++) {
                this.updateAddress(
                    ZkAppStorage.calculateIndex(addresses[i].index),
                    addresses[i].address
                );
            }
        }
    }

    get root(): Field {
        return this._addressMap.getRoot();
    }

    get addressMap(): AddressMT {
        return this._addressMap;
    }

    get addresses(): {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    } {
        return this._addresses;
    }

    static calculateLeaf(address: PublicKey): Field {
        return Poseidon.hash(address.toFields());
    }

    calculateLeaf(address: PublicKey): Field {
        return ZkAppStorage.calculateLeaf(address);
    }

    static calculateIndex(index: Field | number): Field {
        return Field(index);
    }

    calculateIndex(index: Field | number): Field {
        return ZkAppStorage.calculateIndex(index);
    }

    getWitness(index: Field): AddressWitness {
        return new AddressWitness(
            this._addressMap.getWitness(index.toBigInt())
        );
    }

    getAddresses(): (PublicKey | undefined)[] {
        return Object.values(this._addressMap);
    }

    updateLeaf(index: Field, leaf: Field): void {
        this._addressMap.setLeaf(index.toBigInt(), leaf);
        this._addresses[index.toString()] = {
            raw: undefined,
            leaf: leaf,
        };
    }

    updateAddress(index: Field, address: PublicKey) {
        let leaf = this.calculateLeaf(address);
        this._addressMap.setLeaf(index.toBigInt(), leaf);
        this._addresses[index.toString()] = {
            raw: address,
            leaf: leaf,
        };
    }

    getZkAppRef(index: Field | number, address: PublicKey) {
        return new ZkAppRef({
            address: address,
            witness: this.getWitness(this.calculateIndex(index)),
        });
    }
}

export const enum ActionStatus {
    NOT_EXISTED,
    REDUCED,
}

export function getZkAppRef(
    map: AddressMT,
    index: ZkAppEnum | number,
    address: PublicKey
) {
    return new ZkAppRef({
        address: address,
        witness: new AddressWitness(
            map.getWitness(ZkAppStorage.calculateIndex(index).toBigInt())
        ),
    });
}

/**
 * Verify the address of a zkApp
 * @param ref Reference to a zkApp
 * @param key Index of its address in MT
 */
export function verifyZkApp(
    programName: string,
    ref: ZkAppRef,
    root: Field,
    key: Field
) {
    root.assertEquals(
        ref.witness.calculateRoot(Poseidon.hash(ref.address.toFields())),
        Utils.buildAssertMessage(
            programName,
            'verifyZkApp',
            ErrorEnum.ZKAPP_ROOT
        )
    );

    key.assertEquals(
        ref.witness.calculateIndex(),
        Utils.buildAssertMessage(
            programName,
            'verifyZkApp',
            ErrorEnum.ZKAPP_INDEX
        )
    );
}
