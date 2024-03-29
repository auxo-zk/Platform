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
import { ADDRESS_MAX_SIZE } from '../constants.js';

export const ADDRESS_TREE_HEIGHT = Math.ceil(Math.log2(ADDRESS_MAX_SIZE)) + 1;
export class AddressMT extends MerkleTree {}
export class AddressWitness extends MerkleWitness(ADDRESS_TREE_HEIGHT) {}
export const EMPTY_ADDRESS_MT = () => new AddressMT(ADDRESS_TREE_HEIGHT);
export class ReduceWitness extends MerkleMapWitness {}
export const EMPTY_REDUCE_MT = () => new MerkleMap();

export class ZkAppRef extends Struct({
    address: PublicKey,
    witness: AddressWitness,
}) {}

export class AddressStorage {
    private _addressMap: AddressMT;
    private _addresses: {
        [key: string]: { raw: PublicKey | undefined; leaf: Field };
    };

    constructor(addresses?: { index: Field | number; address: PublicKey }[]) {
        this._addressMap = EMPTY_ADDRESS_MT();
        this._addresses = {};
        if (addresses) {
            for (let i = 0; i < addresses.length; i++) {
                this.updateAddress(
                    AddressStorage.calculateIndex(addresses[i].index),
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
        return AddressStorage.calculateLeaf(address);
    }

    static calculateIndex(index: Field | number): Field {
        return Field(index);
    }

    calculateIndex(index: Field | number): Field {
        return AddressStorage.calculateIndex(index);
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

export function getZkAppRef(
    map: AddressMT,
    index: Field | number,
    address: PublicKey
) {
    return new ZkAppRef({
        address: address,
        witness: new AddressWitness(
            map.getWitness(AddressStorage.calculateIndex(index).toBigInt())
        ),
    });
}

export const enum ActionStatus {
    NOT_EXISTED,
    REDUCED,
    ROLL_UPED,
}

export class ReduceStorage {
    private _actionMap: MerkleMap;
    private _actions: { [key: string]: Field };

    constructor(actions?: { actionState: Field; status: ActionStatus }[]) {
        this._actionMap = EMPTY_REDUCE_MT();
        this._actions = {};
        if (actions) {
            for (let i = 0; i < actions.length; i++) {
                this.updateLeaf(
                    actions[i].actionState,
                    ReduceStorage.calculateLeaf(actions[i].status)
                );
            }
        }
    }

    get root(): Field {
        return this._actionMap.getRoot();
    }

    get actionMap(): MerkleMap {
        return this._actionMap;
    }

    get actions(): { [key: string]: Field } {
        return this._actions;
    }

    static calculateLeaf(status: ActionStatus): Field {
        return Field(status);
    }

    calculateLeaf(status: ActionStatus): Field {
        return ReduceStorage.calculateLeaf(status);
    }

    static calculateIndex(actionState: Field): Field {
        return actionState;
    }

    calculateIndex(actionState: Field): Field {
        return ReduceStorage.calculateIndex(actionState);
    }

    getWitness(index: Field): MerkleMapWitness {
        return this._actionMap.getWitness(index);
    }

    updateLeaf(index: Field, leaf: Field): void {
        this._actionMap.set(index, leaf);
        this._actions[index.toString()] = leaf;
    }
}
