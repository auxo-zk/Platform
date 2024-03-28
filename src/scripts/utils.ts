import { Field, PublicKey } from 'o1js';
import { ZkAppStorage } from '../storages/SharedStorage';
import { ZkAppEnum } from '../Constants';

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
    }): ZkAppStorage {
        const zkAppStorage = new ZkAppStorage();
        if (addresses.committeeAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.COMMITTEE),
                addresses.committeeAddress
            );
        }
        if (addresses.dkgAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.DKG),
                addresses.dkgAddress
            );
        }
        if (addresses.round1Address) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.ROUND1),
                addresses.round1Address
            );
        }
        if (addresses.round2Address) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.ROUND2),
                addresses.round2Address
            );
        }
        if (addresses.requestAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.REQUEST),
                addresses.requestAddress
            );
        }
        if (addresses.requesterAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.REQUESTER),
                addresses.requesterAddress
            );
        }
        if (addresses.responseAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.RESPONSE),
                addresses.responseAddress
            );
        }
        if (addresses.campaignAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.CAMPAIGN),
                addresses.campaignAddress
            );
        }
        if (addresses.projectAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.PROJECT),
                addresses.projectAddress
            );
        }
        if (addresses.participationAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.PARTICIPATION),
                addresses.participationAddress
            );
        }
        if (addresses.fundingAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.FUNDING),
                addresses.fundingAddress
            );
        }
        if (addresses.treasuryManagerAddress) {
            zkAppStorage.updateAddress(
                Field(ZkAppEnum.TREASURY_MANAGER),
                addresses.treasuryManagerAddress
            );
        }

        return zkAppStorage;
    }
}
