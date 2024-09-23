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
import {
    AddressWitness,
    RequesterContract,
    Storage,
    ZkApp,
    ZkAppRef,
} from '@auxo-dev/dkg';
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
import { FundingContract } from '../../../contracts/Funding.js';

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

    const input = (
        await axios.get(
            `https://api-dev.auxo.fund/v0/method-inputs/funding-contract/fund?campaignId=${campaignId}`
        )
    ).data;

    const FundingRequesterContractAddress =
        _.accounts.funding_requester.publicKey;

    const treasuryManagerContract = new RequesterContract(
        FundingRequesterContractAddress
    );

    const fundingContractWitness = AddressWitness.fromJSON(
        input.fundingContractWitness!
    );

    const dkgContractRef = ZkAppRef.fromJSON(input.dkgContractRef!);

    Provable.log('address: ', dkgContractRef.address);

    Provable.log(
        'root: ',
        dkgContractRef.witness.calculateRoot(
            AddressStorage.calculateLeaf(dkgContractRef.address)
        )
    );

    // await fetchAccounts([
    //     _.accounts.participation.publicKey,
    //     _.accounts.project.publicKey,
    //     _.accounts.campaign.publicKey,
    //     _.accounts.funding.publicKey,
    //     _.accounts.treasury_manager.publicKey,
    //     _.accounts.request.publicKey,
    //     _.accounts.funding_requester.publicKey,
    //     treasuryAddress,
    // ]);

    // Compile programs
    // await compile(_.cache, [], undefined, logger);

    // await Utils.proveAndSendTx(
    //     TreasuryManagerContract.name,
    //     'claimFund',
    //     async () => {
    //         await treasuryManagerContract.claimFund(
    //             Field(campaignId),
    //             Field(projectId),
    //             Field(projectIndex),
    //             projectIndexWitness,
    //             Field(requestId),
    //             taskWitness,
    //             resultVectorWitness,
    //             resultValueWitness,
    //             treasuryAddress,
    //             treasuryAddressWitness,
    //             claimedAmountWitness,
    //             amount,
    //             participationContractRef,
    //             requestContractRef,
    //             requesterContractRef,
    //             projectContractRef
    //         );
    //     },
    //     _.feePayer,
    //     true,
    //     undefined,
    //     logger
    // );
}

main()
    .then()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
