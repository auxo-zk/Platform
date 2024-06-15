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
import axios from 'axios';
import {
    Timeline,
    TimelineLevel1Witness,
} from '../../../storages/CampaignStorage.js';
import { CampaignMockData } from '../../mock/CampaignMockData.js';
import {
    MemberArray,
    ProjectMemberLevel1Witness,
    ProjectMemberLevel2Witness,
} from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import { CampaignStateStorage } from '../../../storages/TreasuryManagerStorage.js';
import { TimelineStorage } from '../../../storages/CampaignStorage.js';
import { Storage, ZkAppRef } from '@auxo-dev/dkg';
import { ZkAppIndex } from '../../../Constants.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { Participation } from '../../../contracts/index.js';
import { ParticipationMockData } from '../../mock/ParticipationMockData.js';
import { ParticipationContract } from '../../../contracts/Participation.js';
import {
    ProjectCounterLevel1Witness,
    ProjectIndexLevel1Witness,
} from '../../../storages/ParticipationStorage.js';
import { fetchAccounts } from '../../helper/index.js';

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

    // Compile programs
    await compile(_.cache, [], undefined, logger);

    await fetchAccounts([
        _.accounts.participation.publicKey,
        _.accounts.project.publicKey,
        _.accounts.campaign.publicKey,
    ]);

    const campaignId = 1;
    const projectId = 0;

    const input = (
        await axios.get(
            `https://api-dev.auxo.fund/v0/method-inputs/participation-contract/participate-campaign?campaignId=${campaignId}&projectId=${projectId}`
        )
    ).data;

    const partiAddress = _.accounts.participation.publicKey;

    console.log('Participation address: ', partiAddress);

    const partiContract = new ParticipationContract(partiAddress);

    const ipfsHash = IpfsHash.fromString(ParticipationMockData[0].ipfsHash);
    const startParticipation = CampaignMockData[0].timelinePeriod.preparation;
    const startFunding =
        startParticipation + CampaignMockData[0].timelinePeriod.participation;
    const startRequesting =
        startFunding + CampaignMockData[0].timelinePeriod.funding;
    const timeline = new Timeline({
        startParticipation: new UInt64(startParticipation),
        startFunding: new UInt64(startFunding),
        startRequesting: new UInt64(startRequesting),
    });
    const timelineWitness = TimelineLevel1Witness.fromJSON(
        input.timelineWitness
    );
    const memberWitnessLevel1 = ProjectMemberLevel1Witness.fromJSON(
        input.memberWitnessLevel1
    );
    const memberWitnessLevel2 = ProjectMemberLevel2Witness.fromJSON(
        input.memberWitnessLevel2
    );
    const projectCounter = Field(input.projectCounter);
    const projectCounterWitness = ProjectCounterLevel1Witness.fromJSON(
        input.projectCounterWitness
    );
    const projectIndexWitness = ProjectIndexLevel1Witness.fromJSON(
        input.projectIndexWitness
    );
    const campaignContractRef = ZkAppRef.fromJSON(input.campaignContractRef);
    const projectContractRef = ZkAppRef.fromJSON(input.projectContractRef);

    await Utils.proveAndSendTx(
        ParticipationContract.name,
        'participateCampaign',
        async () => {
            await partiContract.participateCampaign(
                Field(campaignId),
                Field(projectId),
                ipfsHash,
                timeline,
                timelineWitness,
                memberWitnessLevel1,
                memberWitnessLevel2,
                projectIndexWitness,
                projectCounter,
                projectCounterWitness,
                campaignContractRef,
                projectContractRef
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
