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
    provable,
} from 'o1js';
import fs from 'fs';
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
import {
    CommitteeContract,
    Libs as DkgLibs,
    RequesterAddressBook,
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
} from '@auxo-dev/dkg';

import { prepare } from './helper/prepare.js';
import { Network } from './helper/config.js';
import { AddressStorage } from '@auxo-dev/dkg';
import { compile } from './helper/compile.js';
import { fetchAccounts } from './helper/index.js';
import { Action } from './interfaces/action.interface.js';

import 'dotenv/config';
import { Participation } from '../contracts/index.js';

const Lightnet = Mina.Network({
    mina: process.env.LIGHTNET_MINA as string,
    archive: process.env.LIGHTNET_ARCHIVE as string,
});

const DEPLOY = false;
const CREATE_CAMPAIGN = false;
const ROLLUP_CAMPAIGN = false;
const CREATE_FIRST_PROJECT = false;
const CREATE_SECOND_PROJECT = false;
const ROLLUP_PROJECT = false;
const FIRST_PROJECT_JOIN = true;
const SECOND_PROJECT_JOIN = true;
const ROLLUP_PARTICIPATION = true;
const FUND_PROJECT = true;
const ROLLUP_FUNDING = true;
const COMPLETE_CAMPAIGN = true;
const ROLLUP_TREASURY_MANAGER = false;
const CLAIM_FUND_PR1 = false;
const CLAIM_FUND_PR2 = false;
const ROLLUP_TREASURY_MANAGER_2 = false;

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
                'treasury_manager',
            ],
        }
    );

    Provable.log('rollup: ', _.accounts.rollup.publicKey);
    Provable.log('committee: ', _.accounts.committee.publicKey);
    Provable.log('dkg: ', _.accounts.dkg.publicKey);
    Provable.log('round1: ', _.accounts.round1.publicKey);
    Provable.log('round2: ', _.accounts.round2.publicKey);
    Provable.log('request: ', _.accounts.request.publicKey);
    Provable.log('response: ', _.accounts.response.publicKey);
    Provable.log('project: ', _.accounts.project.publicKey);
    Provable.log('campaign: ', _.accounts.campaign.publicKey);
    Provable.log('commitment: ', _.accounts.commitment.publicKey);
    Provable.log('funding: ', _.accounts.funding.publicKey);
    Provable.log('funding_requester: ', _.accounts.funding_requester.publicKey);
    Provable.log('vesting: ', _.accounts.vesting.publicKey);
    Provable.log('vesting_requester: ', _.accounts.vesting_requester.publicKey);
    Provable.log('participation: ', _.accounts.participation.publicKey);
    Provable.log('treasury_manager: ', _.accounts.treasury_manager.publicKey);
}

main();
