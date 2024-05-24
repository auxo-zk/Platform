import {
    Field,
    Mina,
    PrivateKey,
    PublicKey,
    AccountUpdate,
    Reducer,
    Provable,
    UInt32,
    Scalar,
    Bool,
    UInt64,
    Group,
    Cache,
    fetchAccount,
    TokenId,
    TokenContract,
    UInt8,
} from 'o1js';
import {
    ProjectAction,
    ProjectContract,
    RollupProject,
} from '../contracts/Project.js';
import { ProjectMockData } from './mock/ProjectMockData.js';
import {
    DefaultRootForProjectTree,
    EMPTY_LEVEL_2_PROJECT_MEMBER_TREE,
    IpfsHashStorage as ProjectIpfsHashStorage,
    MemberArray,
    ProjectMemberStorage,
    ProjectActionEnum,
    TreasuryAddressStorage,
} from '../storages/ProjectStorage.js';
import { IpfsHash, Utils } from '@auxo-dev/auxo-libs';
import { Utilities } from './utils.js';
import {
    INSTANCE_LIMITS,
    MINIMAL_MINA_UNIT,
    ZkAppIndex,
} from '../Constants.js';
import { CommitteeContract, Libs as DkgLibs, Storage } from '@auxo-dev/dkg';
import {
    ProjectCounterStorage,
    ProjectIndexStorage,
    IpfsHashStorage as ParticipationIpfsHashStorage,
} from '../storages/ParticipationStorage.js';
import {
    KeyIndexStorage,
    TimelineStorage,
    IpfsHashStorage as CampaignIpfsHashStorage,
    Timeline,
    CampaignTimelineStateEnum,
    DefaultRootForCampaignTree,
} from '../storages/CampaignStorage.js';
import {
    CampaignAction,
    CampaignContract,
    RollupCampaign,
} from '../contracts/Campaign.js';
import {
    ParticipationAction,
    ParticipationContract,
    RollupParticipation,
} from '../contracts/Participation.js';
import { ZkAppStorage } from '../storages/SharedStorage.js';
import {
    RollupTreasuryManager,
    TreasuryManagerAction,
    TreasuryManagerContract,
    TreasuryManagerContractMock,
} from '../contracts/TreasuryManager.js';
import {
    FundingAction,
    FundingContract,
    FundingContractMock,
    RollupFunding,
} from '../contracts/Funding.js';
import {
    AmountVector,
    DefaultRootForFundingTree,
    FundingInformation,
    FundingInformationStorage,
} from '../storages/FundingStorage.js';
import { CampaignMockData } from './mock/CampaignMockData.js';
import { ParticipationMockData } from './mock/ParticipationMockData.js';
import { FundingMockData } from './mock/FundingMockData.js';
import {
    CampaignStateEnum,
    CampaignStateStorage,
    ClaimedAmountStorage,
    DefaultRootForTreasuryManagerTree,
} from '../storages/TreasuryManagerStorage.js';

import { VestingContract } from '../contracts/Vesting.js';

import {
    DkgContract,
    RequestContract,
    RequesterContract,
    ResponseContract,
    UpdateKey,
    UpdateRequest,
    UpdateTask,
    ZkApp,
} from '@auxo-dev/dkg';

import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { compile } from './helper/compile.js';

import 'dotenv/config';

// const BerkeleyNetwork = Mina.Network({
//     mina: process.env.BERKELEY_MINA as string,
//     archive: process.env.BERKELEY_ARCHIVE as string,
// });
const Lightnet = Mina.Network({
    mina: process.env.LIGHTNET_MINA as string,
    archive: process.env.LIGHTNET_ARCHIVE as string,
});
// const MinaScanNetwork = Mina.Network({
//     mina: process.env.MINA_SCAN_MINA as string,
//     archive: process.env.MINA_SCAN_ARCHIVE as string,
// });

const STEP = 10;
const DEPLOY = 1;
const CREATE_CAMPAIGN = 2;
const ROLLUP_CAMPAIGN = 3;
const CREATE_FIRST_PROJECT = 4;
const CREATE_SECOND_PROJECT = 5;
const FIRST_PROJECT_JOIN = 6;
const SECOND_PROJECT_JOIN = 7;
const ROLLUP_PARTICIPATION = 8;
const FUND_PROJECT = 9;
const ROLLUP_FUNDING = 10;
const COMPLETE_CAMPAIGN = 11;
const ROLLUP_TREASURY_MANAGER = 12;
const CLAIM_FUND_PR1 = 13;
const CLAIM_FUND_PR2 = 14;
const ROLLUP_TREASURY_MANAGER_2 = 15;

async function main() {
    const doProofs = true;
    const logger = {
        info: true,
        debug: true,
        error: true,
    };

    let _ = await prepare(
        './caches',
        { type: Network.Lightnet, doProofs },
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
                'commitment',
                'funding',
                'funding_requester',
                'vesting',
                'vesting_requester',
                'participation',
                'treasurymanager',
            ],
        }
    );

    // compile all contract
    await compile(undefined, [], undefined, {
        error: true,
        info: true,
        memoryUsage: true,
    });

    // Construct address books
    let sharedAddressStorage = new AddressStorage();
    {
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
            Field(ZkAppIndex.COMMITMENT),
            _.accounts.commitment.publicKey
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
            Field(ZkAppIndex.VESTING),
            _.accounts.vesting.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.VESTING_REQUESTER),
            _.accounts.vesting_requester.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.PARTICIPATION),
            _.accounts.participation.publicKey
        );
        sharedAddressStorage.updateAddress(
            Field(ZkAppIndex.TREASURY_MANAGER),
            _.accounts.treasurymanager.publicKey
        );
    }

    const zkAppStorageForFundingRequester =
        Utilities.getZkAppStorageForRequester(
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.dkg.publicKey.toBase58(),
            _.accounts.request.publicKey.toBase58()
        );

    const zkAppStorageForVestingRequester =
        Utilities.getZkAppStorageForRequester(
            _.accounts.vesting.publicKey.toBase58(),
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.vesting.publicKey.toBase58(),
            _.accounts.request.publicKey.toBase58()
        );

    // Prepare zkApps
    let projectZkApp = Utils.getZkApp(
        _.accounts.project,
        new ProjectContract(_.accounts.project.publicKey),
        ProjectContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );
    let dkgZkApp = Utils.getZkApp(
        _.accounts.dkg,
        new DkgContract(_.accounts.dkg.publicKey),
        DkgContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let committeeZkApp = Utils.getZkApp(
        _.accounts.committee,
        new CommitteeContract(_.accounts.committee.publicKey),
        CommitteeContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let requestZkApp = Utils.getZkApp(
        _.accounts.request,
        new RequestContract(_.accounts.request.publicKey),
        RequestContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let responseZkApp = Utils.getZkApp(
        _.accounts.response,
        new ResponseContract(_.accounts.response.publicKey),
        ResponseContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let campaignZkApp = Utils.getZkApp(
        _.accounts.campaign,
        new CampaignContract(_.accounts.campaign.publicKey),
        CampaignContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingZkApp = Utils.getZkApp(
        _.accounts.funding,
        new FundingContract(_.accounts.funding.publicKey),
        FundingContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterZkApp = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(_.accounts.funding_requester.publicKey),
        RequesterContract.name,
        { zkAppRoot: zkAppStorageForFundingRequester.root }
    );

    // not deploy this
    let vestingZkApp = {
        key: _.accounts.vesting,
        contract: new VestingContract(_.accounts.vesting.publicKey),
        name: VestingContract.name,
        // initArgs: { zkAppRoot: sharedAddressStorage.root },
    };

    let vestingRequesterZkApp = Utils.getZkApp(
        _.accounts.vesting_requester,
        new RequesterContract(_.accounts.vesting_requester.publicKey),
        RequesterContract.name,
        { zkAppRoot: zkAppStorageForVestingRequester.root }
    );

    let participationZkApp = Utils.getZkApp(
        _.accounts.participation,
        new ParticipationContract(_.accounts.participation.publicKey),
        ParticipationContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let treasuryManagerZkApp = Utils.getZkApp(
        _.accounts.treasurymanager,
        new TreasuryManagerContract(_.accounts.treasurymanager.publicKey),
        TreasuryManagerContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let requestZkAppWithRequesterToken = {
        ...requestZkApp,
        contract: new RequestContract(
            _.accounts.request.publicKey,
            TokenId.derive(_.accounts.funding_requester.publicKey)
        ),
    };

    let treasuryManagerTokenZkApp = Utils.getZkApp(
        _.accounts.treasurymanager,
        new TreasuryManagerContract(
            _.accounts.treasurymanager.publicKey,
            TokenId.derive(_.accounts.funding.publicKey)
        ),
        TreasuryManagerContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterTokenZkAppForFunding = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(
            _.accounts.funding_requester.publicKey,
            TokenId.derive(_.accounts.funding.publicKey)
        ),
        RequesterContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    let fundingRequesterTokenZkAppForCampaign = Utils.getZkApp(
        _.accounts.funding_requester,
        new RequesterContract(
            _.accounts.funding_requester.publicKey,
            TokenId.derive(_.accounts.campaign.publicKey)
        ),
        RequesterContract.name,
        { zkAppRoot: sharedAddressStorage.root }
    );

    if (STEP >= DEPLOY) {
        await Utils.deployZkApps(
            [
                projectZkApp,
                campaignZkApp,
                participationZkApp,
                fundingZkApp,
                treasuryManagerZkApp,
            ],
            _.feePayer,
            true,
            logger
        );

        await Utils.deployZkAppsWithToken(
            [
                {
                    owner: fundingRequesterZkApp,
                    user: requestZkAppWithRequesterToken,
                },
                {
                    owner: campaignZkApp,
                    user: fundingRequesterTokenZkAppForCampaign,
                },
                {
                    owner: fundingZkApp,
                    user: fundingRequesterTokenZkAppForFunding,
                },
            ],
            _.feePayer,
            true,
            logger
        );
    }

    console.log('Successfully deployed!');
}

main();
