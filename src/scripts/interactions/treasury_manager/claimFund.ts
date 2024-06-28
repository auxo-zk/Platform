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
    Account,
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
    TreasuryAddressLevel1Witness,
} from '../../../storages/ProjectStorage.js';
import { Network } from '../../helper/config.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { prepare } from '../../helper/prepare.js';
import {
    CampaignStateStorage,
    ClaimedAmountLevel1Witness,
} from '../../../storages/TreasuryManagerStorage.js';
import { TimelineStorage } from '../../../storages/CampaignStorage.js';
import { Storage, ZkAppRef } from '@auxo-dev/dkg';
import { ZkAppIndex } from '../../../Constants.js';
import { AddressStorage, RequestKeyIndexStorage } from '@auxo-dev/dkg';
import { Participation, TreasuryManager } from '../../../contracts/index.js';
import { ParticipationMockData } from '../../mock/ParticipationMockData.js';
import { ParticipationContract } from '../../../contracts/Participation.js';
import {
    ParticipationStorage,
    ProjectCounterLevel1Witness,
    ProjectIndexLevel1Witness,
} from '../../../storages/ParticipationStorage.js';
import { fetchAccounts } from '../../helper/index.js';
import { TreasuryManagerContract } from '../../../contracts/TreasuryManager.js';
import { TreasuryAddressStorage } from '../../../storages/ProjectStorage.js';
import { ProjectContract } from '../../../contracts/Project.js';

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

    const campaignId = 0;
    const projectId = 1;

    const input = (
        await axios.get(
            `https://api-dev.auxo.fund/v0/method-inputs/treasury-manager-contract/claim-fund?campaignId=${campaignId}&projectId=${projectId}`
        )
    ).data;

    const treasuryManagerAddress = _.accounts.treasury_manager.publicKey;

    const treasuryManagerContract = new TreasuryManagerContract(
        treasuryManagerAddress
    );

    const requestId = input.requestId!;
    const projectIndex = input.projectIndex!;
    const projectIndexWitness = ProjectIndexLevel1Witness.fromJSON(
        input.projectIndexWitness!
    );
    const taskWitness = Storage.RequestStorage.RequestLevel1Witness.fromJSON(
        input.taskWitness!
    );
    const resultVectorWitness =
        Storage.RequestStorage.RequestLevel1Witness.fromJSON(
            input.resultVectorWitness!
        );

    const resultValueWitness =
        Storage.RequestStorage.RequestLevel2Witness.fromJSON(
            input.resultValueWitness!
        );

    const treasuryAddress = PublicKey.fromBase58(input.treasuryAddress);
    const treasuryAddressWitness = TreasuryAddressLevel1Witness.fromJSON(
        input.treasuryAddressWitness!
    );
    const claimedAmountWitness = ClaimedAmountLevel1Witness.fromJSON(
        input.claimedAmountWitness!
    );
    const amount = UInt64.from(input.amount!);
    const participationContractRef = ZkAppRef.fromJSON(
        input.participationContractRef!
    );
    const requestContractRef = ZkAppRef.fromJSON(input.requestContractRef!);
    const requesterContractRef = ZkAppRef.fromJSON(input.requesterContractRef!);
    const projectContractRef = ZkAppRef.fromJSON(input.projectContractRef!);

    await fetchAccounts([
        _.accounts.participation.publicKey,
        _.accounts.project.publicKey,
        _.accounts.campaign.publicKey,
        _.accounts.funding.publicKey,
        _.accounts.treasury_manager.publicKey,
        _.accounts.request.publicKey,
        _.accounts.funding_requester.publicKey,
        treasuryAddress,
    ]);

    Provable.log(
        `root onchain: `,
        new ProjectContract(
            _.accounts.project.publicKey
        ).treasuryAddressRoot.get()
    );
    Provable.log('treasuryAddress: ', treasuryAddress);
    Provable.log('balance before: ', Account(treasuryAddress).balance.get());

    // Compile programs
    await compile(_.cache, [], undefined, logger);

    await Utils.proveAndSendTx(
        TreasuryManagerContract.name,
        'claimFund',
        async () => {
            await treasuryManagerContract.claimFund(
                Field(campaignId),
                Field(projectId),
                Field(projectIndex),
                projectIndexWitness,
                Field(requestId),
                taskWitness,
                resultVectorWitness,
                resultValueWitness,
                treasuryAddress,
                treasuryAddressWitness,
                claimedAmountWitness,
                amount,
                participationContractRef,
                requestContractRef,
                requesterContractRef,
                projectContractRef
            );
        },
        _.feePayer,
        true,
        undefined,
        logger
    );

    Provable.log('balance after: ', Account(treasuryAddress).balance.get());
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
