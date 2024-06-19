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
    Proof,
    Transaction,
    PendingTransaction,
    RejectedTransaction,
    IncludedTransaction,
    Keypair,
    SmartContract,
} from 'o1js';
import fs from 'fs';
import axios from 'axios';
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
import { IpfsHash, Utils, CustomScalar } from '@auxo-dev/auxo-libs';
import { Utilities } from './utils.js';
import {
    INSTANCE_LIMITS,
    MINIMAL_MINA_UNIT,
    ZkAppIndex,
} from '../Constants.js';
import {
    CommitteeContract,
    Libs as DkgLibs,
    RequesterAddressBook,
    Round2ContributionStorage,
    Storage,
} from '@auxo-dev/dkg';
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
    Round1Contribution,
    Round2Contribution,
    SecretPolynomial,
    SecretVector,
    RandomVector,
    NullifierArray,
    SecretNote,
    ResponseContribution,
    ResponseContributionStorage,
    ResponseStorage,
    ProcessStorage,
    TimestampStorage,
    CommitmentStorage,
    RequesterKeyIndexStorage,
    RequesterAccumulationStorage,
    generateRandomPolynomial,
    getRound1Contribution,
    calculatePublicKeyFromContribution,
    getRound2Contribution,
    KeyStatus,
    KeyStorage,
    PublicKeyStorage,
    Round1ContributionStorage,
    EncryptionStorage,
} from '@auxo-dev/dkg';

import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { compile } from './helper/compile.js';
import { fetchAccounts } from './helper/index.js';
import { Action } from './interfaces/action.interface.js';

import 'dotenv/config';

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

    const zkAppStorageForFundingRequester =
        Utilities.getZkAppStorageForRequester(
            _.accounts.campaign.publicKey.toBase58(),
            _.accounts.funding.publicKey.toBase58(),
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
    //#endregion

    //#region "Prepare zkApps"
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

    // not this yet
    let vestingZkApp = {
        key: _.accounts.vesting,
        contract: new VestingContract(_.accounts.vesting.publicKey),
        name: VestingContract.name,
        initArgs: { zkAppRoot: sharedAddressStorage.root },
    };

    // not this yet
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
        _.accounts.treasury_manager,
        new TreasuryManagerContract(_.accounts.treasury_manager.publicKey),
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
        _.accounts.treasury_manager,
        new TreasuryManagerContract(
            _.accounts.treasury_manager.publicKey,
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
    //#endregion

    // compile all contract
    await compile(undefined, [], undefined, {
        error: true,
        info: true,
        memoryUsage: true,
    });

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    //#region "Init trees for zkApps"
    const committeeTrees = {
        memberTree: new Storage.CommitteeStorage.MemberStorage(),
        settingTree: new Storage.CommitteeStorage.SettingStorage(),
        counterTree: new Storage.CommitteeStorage.KeyCounterStorage(),
    };

    const campaignTrees = {
        timelineTree: new TimelineStorage(),
        ipfsHashTree: new CampaignIpfsHashStorage(),
        keyIndexTree: new KeyIndexStorage(),
    };

    const projectTrees = {
        memberTree: new ProjectMemberStorage(),
        ipfsHashTree: new ProjectIpfsHashStorage(),
        treasuryAddressTree: new TreasuryAddressStorage(),
    };

    const participationTrees = {
        projectIndexTree: new ProjectIndexStorage(),
        projectCounterTree: new ProjectCounterStorage(),
        ipfsHashTree: new ParticipationIpfsHashStorage(),
    };

    const fundingTrees = {
        fundingInformationTree: new FundingInformationStorage(),
    };

    const treasuryManagerTrees = {
        campaignStateTree: new CampaignStateStorage(),
        claimedAmountTree: new ClaimedAmountStorage(),
    };

    const dkgTrees = {
        encryptionTree: new EncryptionStorage(),
        round1ContributionTree: new Round1ContributionStorage(),
        round2ContributionTree: new Round2ContributionStorage(),
        publicKeyTree: new Storage.DKGStorage.PublicKeyStorage(),
        keyStatusTree: new Storage.DKGStorage.KeyStatusStorage(),
        keyTree: new Storage.DKGStorage.KeyStorage(),
    };

    const requestTrees = {
        taskIdTree: new Storage.RequestStorage.TaskStorage(),
        requestKeyIndexTree:
            new Storage.RequestStorage.RequestKeyIndexStorage(),
        taskTree: new Storage.RequestStorage.TaskStorage(),
        expirationTree: new Storage.RequestStorage.ExpirationStorage(),
        requestAccumulationTree:
            new Storage.RequestStorage.RequestAccumulationStorage(),
        resultTree: new Storage.RequestStorage.ResultStorage(),
    };

    const fundingRequesterTrees = {
        timestampTree: new TimestampStorage(),
        nullifierTree: new CommitmentStorage(),
        requesterKeyIndexTree: new RequesterKeyIndexStorage(),
        requesterAccumulationTree: new RequesterAccumulationStorage(),
    };

    const responseTrees = {
        responseTree: new ResponseStorage(),
        responseProcessTree: new ProcessStorage(),
        responseContributionTree: new ResponseContributionStorage(),
    };

    //#endregion
}

main();
