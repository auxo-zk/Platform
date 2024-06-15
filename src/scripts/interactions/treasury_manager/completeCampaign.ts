import {
    Cache,
    Field,
    Mina,
    PrivateKey,
    Provable,
    PublicKey,
    Reducer,
    fetchAccount,
    UInt64,
} from 'o1js';

import { compile } from '../../helper/compile.js';

import {
    fetchActions,
    fetchZkAppState,
} from '@auxo-dev/auxo-libs/build/types/src/utils/network.js';

import {
    RollupTreasuryManager,
    TreasuryManagerContract,
} from '../../../contracts/TreasuryManager.js';

import { Timeline } from '../../../storages/CampaignStorage.js';
import { CampaignMockData } from '../../mock/CampaignMockData.js';
import { MemberArray } from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import { CampaignStateStorage } from '../../../storages/TreasuryManagerStorage.js';
import { TimelineStorage } from '../../../storages/CampaignStorage.js';
import { Storage } from '@auxo-dev/dkg';
import { ZkAppIndex } from '../../../Constants.js';
import { AddressStorage } from '@auxo-dev/dkg';

async function main() {
    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
        {
            aliases: ['treasury_manager'],
        }
    );

    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: true,
    };

    // Compile programs
    await compile(
        _.cache,
        [RollupTreasuryManager, TreasuryManagerContract],
        undefined,
        logger
    );

    const treasuryManagerAddress = _.accounts.treasury_manager.publicKey;

    console.log('Project address: ', treasuryManagerAddress);

    const trreasuryManagerContract = new TreasuryManagerContract(
        treasuryManagerAddress
    );

    const campaignId = Field(0);
    const requestId = Field(0);
    const start = 0;
    const startParticipation =
        start + CampaignMockData[0].timelinePeriod.preparation;
    const startFunding =
        startParticipation + CampaignMockData[0].timelinePeriod.participation;
    const startRequesting =
        startFunding + CampaignMockData[0].timelinePeriod.funding;
    const timeline = new Timeline({
        startParticipation: new UInt64(startParticipation),
        startFunding: new UInt64(startFunding),
        startRequesting: new UInt64(startRequesting),
    });

    //#region "Construct address books"
    const sharedAddressStorage = new AddressStorage();

    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROLLUP),
        _.accounts.rollup.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.COMMITTEE),
        _.accounts.committee.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.DKG),
        _.accounts.dkg.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND1),
        _.accounts.round1.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.ROUND2),
        _.accounts.round2.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.REQUEST),
        _.accounts.request.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.RESPONSE),
        _.accounts.response.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.PROJECT),
        _.accounts.project.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.CAMPAIGN),
        _.accounts.campaign.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.NULLIFIER),
        _.accounts.nullifier.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.FUNDING),
        _.accounts.funding.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.FUNDING_REQUESTER),
        _.accounts.funding_requester.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.PARTICIPATION),
        _.accounts.participation.publicKey
    );
    sharedAddressStorage.updateAddress(
        Field(ZkAppIndex.TREASURY_MANAGER),
        _.accounts.treasury_manager.publicKey
    );

    const campaignStateTree = new CampaignStateStorage();
    const timelineTree = new TimelineStorage();
    const taskIdTree = new Storage.RequestStorage.TaskStorage(); // api
    const expirationTimestamp = new UInt64(0); // expirationTimestamp api
    const expirationTree = new Storage.RequestStorage.ExpirationStorage(); // api
    const resultTree = new Storage.RequestStorage.ResultStorage(); // api

    await Utils.proveAndSendTx(
        TreasuryManagerContract.name,
        'completeCampaign',
        async () => {
            await trreasuryManagerContract.completeCampaign(
                campaignId,
                requestId,
                timeline,
                timelineTree.getLevel1Witness(campaignId),
                campaignStateTree.getLevel1Witness(campaignId),
                taskIdTree.getLevel1Witness(Field(0)), // update từ api
                new UInt64(0), // expirationTimestamp
                expirationTree.getLevel1Witness(Field(0)), // update từ api
                resultTree.getLevel1Witness(Field(0)), // update từ api
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.CAMPAIGN,
                    _.accounts.campaign.publicKey
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.FUNDING_REQUESTER,
                    _.accounts.requester.publicKey
                ),
                sharedAddressStorage.getZkAppRef(
                    ZkAppIndex.REQUEST,
                    _.accounts.request.publicKey
                )
            );
        },
        _.feePayer,
        true,
        undefined,
        logger
    );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
