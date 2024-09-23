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

import axios from 'axios';

import { compile } from '../../helper/compile.js';

import {
    fetchActions,
    fetchZkAppState,
} from '@auxo-dev/auxo-libs/build/types/src/utils/network.js';

import {
    RollupTreasuryManager,
    TreasuryManagerContract,
} from '../../../contracts/TreasuryManager.js';

import {
    Timeline,
    TimelineLevel1Witness,
} from '../../../storages/CampaignStorage.js';
import { CampaignMockData } from '../../mock/CampaignMockData.js';
import { MemberArray } from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import {
    CampaignStateLevel1Witness,
    CampaignStateStorage,
} from '../../../storages/TreasuryManagerStorage.js';
import { TimelineStorage } from '../../../storages/CampaignStorage.js';
import { Storage } from '@auxo-dev/dkg';
import { ZkAppIndex } from '../../../Constants.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { ZkAppRef } from '@auxo-dev/dkg';

async function main() {
    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs: true },
        {
            aliases: [
                'rollup',
                'committee',
                'dkg',
                'round1',
                'round2',
                'request',
                'response',
                'project',
                'campaign',
                'nullifier',
                'funding',
                'funding_requester',
                'vesting',
                'vesting_requester',
                'participation',
                'treasury_manager',
            ],
        }
    );

    const logger: Utils.Logger = {
        info: true,
        error: true,
        memoryUsage: true,
    };

    const campaignId = 7;

    const input = (
        await axios.get(
            `https://api-dev.auxo.fund/v0/method-inputs/treasury-manager-contract/complete-campaign?campaignId=${campaignId}`
        )
    ).data;

    const treasuryManagerAddress = _.accounts.treasury_manager.publicKey;

    const treasuryManagerContract = new TreasuryManagerContract(
        treasuryManagerAddress
    );

    const requestId = input.requestId!;

    const timeline = new Timeline({
        startParticipation: new UInt64(input.timeline.startParticipation),
        startFunding: new UInt64(input.timeline.startFunding),
        startRequesting: new UInt64(input.timeline.startRequesting),
    });

    const timelineWitness = TimelineLevel1Witness.fromJSON(
        input.timelineWitness!
    );

    const campaignStateWitness = CampaignStateLevel1Witness.fromJSON(
        input.campaignStateWitness!
    );

    const taskWitness = Storage.RequestStorage.RequestLevel1Witness.fromJSON(
        input.taskWitness!
    );
    const expirationTimestamp = UInt64.from(input.expirationTimestamp!);
    const expirationWitness =
        Storage.RequestStorage.RequestLevel1Witness.fromJSON(
            input.expirationWitness!
        );
    const resultWitness = Storage.RequestStorage.RequestLevel1Witness.fromJSON(
        input.resultWitness!
    );

    const campaignContractRef = ZkAppRef.fromJSON(input.campaignContractRef!);
    const requesterContractRef = ZkAppRef.fromJSON(input.requesterContractRef!);
    const requestContractRef = ZkAppRef.fromJSON(input.requestContractRef!);

    // Compile programs
    await compile(_.cache, [], undefined, logger);

    const trreasuryManagerContract = new TreasuryManagerContract(
        _.accounts.treasury_manager.publicKey
    );

    await Utils.proveAndSendTx(
        TreasuryManagerContract.name,
        'completeCampaign',
        async () => {
            await trreasuryManagerContract.completeCampaign(
                Field(campaignId),
                Field(requestId),
                timeline,
                timelineWitness,
                campaignStateWitness,
                taskWitness,
                expirationTimestamp,
                expirationWitness,
                resultWitness,
                campaignContractRef,
                requesterContractRef,
                requestContractRef
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
