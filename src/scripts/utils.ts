import { Field, PublicKey } from 'o1js';
import { ZkAppStorage } from '../storages/SharedStorage.js';
import { ZkAppIndex } from '../Constants.js';
import { Storage as DkgStorage, ZkApp } from '@auxo-dev/dkg';

export class Utilities {
    static stringArrayToFields(input: string[]): Field[] {
        const result: Field[] = [];
        for (let i = 0; i < input.length; i++) {
            result.push(Field(input[i]));
        }
        return result;
    }

    static getZkAppStorage(addresses: {
        committeeAddress?: PublicKey;
        dkgAddress?: PublicKey;
        round1Address?: PublicKey;
        round2Address?: PublicKey;
        requestAddress?: PublicKey;
        requesterAddress?: PublicKey;
        responseAddress?: PublicKey;
        campaignAddress?: PublicKey;
        projectAddress?: PublicKey;
        participationAddress?: PublicKey;
        fundingAddress?: PublicKey;
        treasuryManagerAddress?: PublicKey;
        vestingAddress?: PublicKey;
        commitmentAddress?: PublicKey;
    }): ZkAppStorage {
        const zkAppStorage = new ZkAppStorage();
        if (addresses.committeeAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.COMMITTEE),
                addresses.committeeAddress
            );
        }
        if (addresses.dkgAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.DKG),
                addresses.dkgAddress
            );
        }
        if (addresses.round1Address) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.ROUND1),
                addresses.round1Address
            );
        }
        if (addresses.round2Address) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.ROUND2),
                addresses.round2Address
            );
        }
        if (addresses.requestAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.REQUEST),
                addresses.requestAddress
            );
        }
        if (addresses.requesterAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.FUNDING_REQUESTER),
                addresses.requesterAddress
            );
        }
        if (addresses.responseAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.RESPONSE),
                addresses.responseAddress
            );
        }
        if (addresses.campaignAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.CAMPAIGN),
                addresses.campaignAddress
            );
        }
        if (addresses.projectAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.PROJECT),
                addresses.projectAddress
            );
        }
        if (addresses.participationAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.PARTICIPATION),
                addresses.participationAddress
            );
        }
        if (addresses.fundingAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.FUNDING),
                addresses.fundingAddress
            );
        }
        if (addresses.treasuryManagerAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.TREASURY_MANAGER),
                addresses.treasuryManagerAddress
            );
        }
        if (addresses.commitmentAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.COMMITMENT),
                addresses.commitmentAddress
            );
        }
        if (addresses.vestingAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppIndex.VESTING),
                addresses.vestingAddress
            );
        }

        return zkAppStorage;
    }

    static getZkAppStorageForRequester(
        taskManager: string,
        submission: string,
        dkgAddress: string,
        requestAddress: string
    ): DkgStorage.AddressStorage.AddressStorage {
        const zkAppStorage = new DkgStorage.AddressStorage.AddressStorage();
        zkAppStorage.updateAddress(
            Field(ZkApp.Requester.RequesterAddressBook.TASK_MANAGER),
            PublicKey.fromBase58(taskManager)
        );
        zkAppStorage.updateAddress(
            Field(ZkApp.Requester.RequesterAddressBook.SUBMISSION),
            PublicKey.fromBase58(submission)
        );
        zkAppStorage.updateAddress(
            Field(ZkApp.Requester.RequesterAddressBook.DKG),
            PublicKey.fromBase58(dkgAddress)
        );
        zkAppStorage.updateAddress(
            Field(ZkApp.Requester.RequesterAddressBook.REQUEST),
            PublicKey.fromBase58(requestAddress)
        );
        return zkAppStorage;
    }
}
