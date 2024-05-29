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

const DEPLOY = true;
const CREATE_CAMPAIGN = true;
const ROLLUP_CAMPAIGN = true;
const CREATE_FIRST_PROJECT = true;
const CREATE_SECOND_PROJECT = true;
const ROLLUP_PROJECT = true;
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

    // compile all contract
    await compile(undefined, [], undefined, {
        error: true,
        info: true,
        memoryUsage: true,
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

    if (DEPLOY) {
        await Utils.deployZkApps(
            [
                projectZkApp,
                campaignZkApp,
                participationZkApp,
                fundingZkApp,
                treasuryManagerZkApp,
                fundingRequesterZkApp,
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
        commitmentTree: new CommitmentStorage(),
        requesterKeyIndexTree: new RequesterKeyIndexStorage(),
        requesterAccumulationTree: new RequesterAccumulationStorage(),
    };

    const responseTrees = {
        responseTree: new ResponseStorage(),
        responseProcessTree: new ProcessStorage(),
        responseContributionTree: new ResponseContributionStorage(),
    };

    //#endregion

    //#region "Prepare data for test cases"
    let start: number,
        startParticipation: number,
        startFunding: number,
        startRequesting: number,
        timeline: Timeline,
        proof: any;

    let deployerAccount: PublicKey,
        deployerKey: PrivateKey,
        senderAccount: PublicKey,
        senderKey: PrivateKey,
        treasuryPublicKey: PublicKey,
        treasuryPrivateKey: PrivateKey;

    ({ privateKey: deployerKey, publicKey: deployerAccount } = _.accounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } = _.accounts[0]);
    ({ privateKey: treasuryPrivateKey, publicKey: treasuryPublicKey } =
        _.accounts[2]);

    let projectCounter = Field(0);
    let nextProjectId = Field(0);
    const campaignId = Field(0);
    const requestId = Field(0);
    const committeeId = Field(CampaignMockData[0].committeeId);
    const keyId = Field(CampaignMockData[0].keyId);
    const key = PrivateKey.random().toPublicKey();
    const totalAmounts: UInt64[] = [];
    let nextCampaignId = Field(0);
    let nextFundingId = Field(0);

    let resultVector: UInt64[] = [new UInt64(0), new UInt64(0), new UInt64(0)];
    start = Date.now() + 1000 * 60 * 10; // 10 minutes
    startParticipation = start + CampaignMockData[0].timelinePeriod.preparation;
    startFunding =
        startParticipation + CampaignMockData[0].timelinePeriod.participation;
    startRequesting = startFunding + CampaignMockData[0].timelinePeriod.funding;
    timeline = new Timeline({
        startParticipation: new UInt64(startParticipation),
        startFunding: new UInt64(startFunding),
        startRequesting: new UInt64(startRequesting),
    });

    let mockSecret: any;
    let committees: {
        members: MemberArray;
        threshold: Field;
        ipfsHash: IpfsHash;
    }[] = [];
    let keys: {
        committeeId: Field;
        keyId: Field;
        key?: Group;
        round1Contributions?: Round1Contribution[];
        round2Contributions?: Round2Contribution[];
    }[] = [];
    let committeeSecrets: SecretPolynomial[] = [];
    const NUM_TASKS = 1;
    const SUBMISSION_PERIOD = 1.5 * 60 * 1000; //ms

    let requests: {
        taskId: UInt32;
        keyIndex: Field;
        requester: PublicKey;
        requestId: Field;
        submissionTs: UInt64;
        expirationTs: UInt64;
        R: Group[][];
        M: Group[][];
        D: Group[][];
        sumR: Group[];
        sumM: Group[];
        sumD: Group[];
        accumulationRootR?: Field;
        accumulationRootM?: Field;
        accumulationRootD?: Field;
        result: { [key: number]: bigint };
        encryptions: {
            indices: number[];
            packedIndices: Field;
            secrets: SecretVector;
            randoms: RandomVector;
            nullifiers: NullifierArray;
            R: Group[];
            M: Group[];
            notes: SecretNote[];
        }[];
        contributions: ResponseContribution[];
    }[] = [];

    for (let i = 0; i < FundingMockData.length; i++) {
        const amounts = FundingMockData[i].amounts;
        const dimensionIndexes = FundingMockData[i].dimensionIndexes;
        for (let j = 0; j < amounts.length; j++) {
            resultVector[dimensionIndexes[j]] = resultVector[
                dimensionIndexes[j]
            ].add(amounts[j]);
        }
    }

    let users = [_.accounts[0], _.accounts[1], _.accounts[2]];
    committees = [
        {
            members: new MemberArray([users[0].publicKey, users[1].publicKey]),
            threshold: Field(1),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        },
        {
            members: new MemberArray([users[0].publicKey, users[1].publicKey]),
            threshold: Field(3),
            ipfsHash: IpfsHash.fromString(
                'QmdZyvZxREgPctoRguikD1PTqsXJH3Mg2M3hhRhVNSx4tn'
            ),
        },
    ];
    keys = [
        {
            committeeId,
            keyId,
        },
    ];

    // Calculate mock committee trees
    for (let i = 0; i < committees.length; i++) {
        let committee = committees[i];
        for (let j = 0; j < Number(committee.members.length); j++)
            committeeTrees.memberTree.updateRawLeaf(
                {
                    level1Index: Field(i),
                    level2Index: Field(j),
                },
                committee.members.get(Field(j))
            );

        committeeTrees.settingTree.updateRawLeaf(
            { level1Index: Field(i) },
            {
                T: committees[i].threshold,
                N: Field(committee.members.length),
            }
        );
    }

    // Calculate mock dkg trees
    let committee = committees[Number(committeeId)];
    let T = Number(committee.threshold);
    let N = Number(committee.members.length);
    keys[0].round1Contributions = [];
    keys[0].round2Contributions = [];
    let filename = `mock/secrets-${T}-${N}.json`;
    let isMockSecretsUsed = fs.existsSync(filename);
    if (isMockSecretsUsed) {
        mockSecret = JSON.parse(fs.readFileSync(filename, 'utf8'));
    }
    for (let j = 0; j < N; j++) {
        let secret = isMockSecretsUsed
            ? {
                  a: mockSecret.secrets[j].a.map((e: any) => Scalar.from(e)),
                  C: mockSecret.secrets[j].C.map(
                      (e: any) => new Group({ x: e.x, y: e.y })
                  ),
                  f: mockSecret.secrets[j].f.map((e: any) => Scalar.from(e)),
              }
            : generateRandomPolynomial(T, N);
        committeeSecrets.push(secret);
        let round1Contribution = getRound1Contribution(secret);
        keys[0].round1Contributions.push(round1Contribution);
    }
    keys[0].key = calculatePublicKeyFromContribution(
        keys[0].round1Contributions
    );
    for (let j = 0; j < N; j++) {
        let randoms = isMockSecretsUsed
            ? mockSecret.randoms[j]
            : [...Array(N)].map(() => Scalar.random());
        let round2Contribution = getRound2Contribution(
            committeeSecrets[j],
            j,
            keys[0].round1Contributions,
            randoms.map((e: string) => Scalar.from(e))
        );
        keys[0].round2Contributions.push(round2Contribution);
    }
    dkgTrees.keyStatusTree.updateRawLeaf(
        {
            level1Index: dkgTrees.keyStatusTree.calculateLevel1Index({
                committeeId,
                keyId,
            }),
        },
        Field(KeyStatus.ACTIVE)
    );
    dkgTrees.keyTree.updateRawLeaf(
        {
            level1Index: dkgTrees.keyTree.calculateLevel1Index({
                committeeId,
                keyId,
            }),
        },
        keys[0].key
    );

    //#endregion

    Provable.log('sharedAddressStorage: ', sharedAddressStorage.root);

    if (CREATE_CAMPAIGN) {
        await fetchAccounts([
            _.accounts.campaign.publicKey,
            _.accounts.dkg.publicKey,
            _.accounts.request.publicKey,
            _.accounts.funding_requester.publicKey,
        ]);
        await Utils.proveAndSendTx(
            CampaignContract.name,
            'createCampaign',
            async () => {
                await campaignZkApp.contract.createCampaign(
                    timeline,
                    IpfsHash.fromString(CampaignMockData[0].ipfsHash),
                    Field(CampaignMockData[0].committeeId),
                    Field(CampaignMockData[0].keyId),
                    dkgTrees.keyStatusTree.getWitness(Field(0)),
                    zkAppStorageForFundingRequester.getWitness(
                        Field(RequesterAddressBook.TASK_MANAGER)
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.DKG,
                        _.accounts.dkg.publicKey
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.FUNDING_REQUESTER,
                        _.accounts.funding_requester.publicKey
                    )
                );
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    let actions: Action[] = (await Mina.fetchActions(
        _.accounts.campaign.publicKey
    )) as Action[];

    await fetchAccounts([_.accounts.campaign.publicKey]);

    const campaignAction = CampaignAction.fromFields(
        Utilities.stringArrayToFields(actions[0].actions[0])
    );

    if (ROLLUP_CAMPAIGN) {
        let proof = await RollupCampaign.firstStep(
            nextCampaignId,
            campaignTrees.timelineTree.root,
            campaignTrees.ipfsHashTree.root,
            campaignTrees.keyIndexTree.root,
            campaignZkApp.contract.actionState.get()
        );
        proof = await RollupCampaign.createCampaignStep(
            proof,
            campaignAction,
            campaignTrees.timelineTree.getLevel1Witness(nextCampaignId),
            campaignTrees.ipfsHashTree.getLevel1Witness(nextCampaignId),
            campaignTrees.keyIndexTree.getLevel1Witness(nextCampaignId)
        );

        await Utils.proveAndSendTx(
            CampaignContract.name,
            'rollup',
            async () => {
                await campaignZkApp.contract.rollup(proof);
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    campaignTrees.timelineTree.updateLeaf(
        nextCampaignId,
        TimelineStorage.calculateLeaf(campaignAction.timeline)
    );
    campaignTrees.ipfsHashTree.updateLeaf(
        nextCampaignId,
        CampaignIpfsHashStorage.calculateLeaf(campaignAction.ipfsHash)
    );
    campaignTrees.keyIndexTree.updateLeaf(
        nextCampaignId,
        KeyIndexStorage.calculateLeaf({
            committeeId: campaignAction.committeeId,
            keyId: campaignAction.keyId,
        })
    );

    let members = new MemberArray();
    members.push(senderAccount);
    for (let i = 0; i < ProjectMockData[0].members.length; i++) {
        members.push(PublicKey.fromBase58(ProjectMockData[0].members[i]));
    }
    if (CREATE_FIRST_PROJECT) {
        await fetchAccounts([_.accounts.project.publicKey]);
        await Utils.proveAndSendTx(
            ProjectContract.name,
            'createProject',
            async () => {
                await projectZkApp.contract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[0].ipfsHash),
                    treasuryPublicKey
                );
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    members = new MemberArray();
    members.push(senderAccount);
    for (let i = 0; i < ProjectMockData[1].members.length; i++) {
        members.push(PublicKey.fromBase58(ProjectMockData[1].members[i]));
    }
    if (CREATE_SECOND_PROJECT) {
        await fetchAccounts([_.accounts.project.publicKey]);
        await Utils.proveAndSendTx(
            ProjectContract.name,
            'createProject',
            async () => {
                await projectZkApp.contract.createProject(
                    members,
                    IpfsHash.fromString(ProjectMockData[1].ipfsHash),
                    treasuryPublicKey
                );
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    await fetchAccounts([_.accounts.project.publicKey]);

    actions = (await Mina.fetchActions(
        _.accounts.project.publicKey
    )) as Action[];

    proof = await RollupProject.firstStep(
        nextProjectId,
        projectTrees.memberTree.root,
        projectTrees.ipfsHashTree.root,
        projectTrees.treasuryAddressTree.root,
        projectZkApp.contract.actionState.get()
    );

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const projectAction = ProjectAction.fromFields(
            Utilities.stringArrayToFields(action.actions[0])
        );
        proof = await RollupProject.createProjectStep(
            proof,
            projectAction,
            projectTrees.memberTree.getLevel1Witness(nextProjectId),
            projectTrees.ipfsHashTree.getLevel1Witness(nextProjectId),
            projectTrees.treasuryAddressTree.getLevel1Witness(nextProjectId)
        );
        const memberTreeLevel2 = EMPTY_LEVEL_2_PROJECT_MEMBER_TREE();
        memberTreeLevel2.setLeaf(
            0n,
            ProjectMemberStorage.calculateLeaf(senderAccount)
        );
        for (let i = 0; i < ProjectMockData[0].members.length; i++) {
            memberTreeLevel2.setLeaf(
                BigInt(i + 1),
                ProjectMemberStorage.calculateLeaf(
                    PublicKey.fromBase58(ProjectMockData[0].members[i])
                )
            );
        }
        projectTrees.memberTree.updateInternal(nextProjectId, memberTreeLevel2);
        projectTrees.ipfsHashTree.updateLeaf(
            { level1Index: nextProjectId },
            ProjectIpfsHashStorage.calculateLeaf(projectAction.ipfsHash)
        );
        projectTrees.treasuryAddressTree.updateLeaf(
            { level1Index: nextProjectId },
            TreasuryAddressStorage.calculateLeaf(projectAction.treasuryAddress)
        );
        nextProjectId = nextProjectId.add(1);
    }

    if (ROLLUP_PROJECT) {
        await Utils.proveAndSendTx(
            ProjectContract.name,
            'rollup',
            async () => {
                await projectZkApp.contract.rollup(proof);
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    if (FIRST_PROJECT_JOIN) {
        await fetchAccounts([
            _.accounts.participation.publicKey,
            _.accounts.campaign.publicKey,
            _.accounts.project.publicKey,
        ]);
        const projectId = Field(0);
        const projectMemberId = Field(0);

        await Utils.proveAndSendTx(
            ParticipationContract.name,
            'participateCampaign',
            async () => {
                await participationZkApp.contract.participateCampaign(
                    campaignId,
                    projectId,
                    IpfsHash.fromString(ParticipationMockData[0].ipfsHash),
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId),
                    projectTrees.memberTree.getLevel1Witness(projectId),
                    projectTrees.memberTree.getLevel2Witness(
                        projectId,
                        projectMemberId
                    ),
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: projectId,
                        })
                    ),
                    projectCounter,
                    participationTrees.projectCounterTree.getLevel1Witness(
                        ProjectCounterStorage.calculateLevel1Index(campaignId)
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.CAMPAIGN,
                        _.accounts.campaign.publicKey
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.PROJECT,
                        _.accounts.project.publicKey
                    )
                );
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    if (SECOND_PROJECT_JOIN) {
        const projectId = Field(1);
        const projectMemberId = Field(0);

        await fetchAccounts([
            _.accounts.participation.publicKey,
            _.accounts.campaign.publicKey,
            _.accounts.project.publicKey,
        ]);

        await Utils.proveAndSendTx(
            ParticipationContract.name,
            'participateCampaign',
            async () => {
                await participationZkApp.contract.participateCampaign(
                    campaignId,
                    projectId,
                    IpfsHash.fromString(ParticipationMockData[1].ipfsHash),
                    timeline,
                    campaignTrees.timelineTree.getLevel1Witness(campaignId),
                    projectTrees.memberTree.getLevel1Witness(projectId),
                    projectTrees.memberTree.getLevel2Witness(
                        projectId,
                        projectMemberId
                    ),
                    participationTrees.projectIndexTree.getLevel1Witness(
                        ProjectIndexStorage.calculateLevel1Index({
                            campaignId: campaignId,
                            projectId: projectId,
                        })
                    ),
                    projectCounter,
                    participationTrees.projectCounterTree.getLevel1Witness(
                        ProjectCounterStorage.calculateLevel1Index(campaignId)
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.CAMPAIGN,
                        _.accounts.campaign.publicKey
                    ),
                    sharedAddressStorage.getZkAppRef(
                        ZkAppIndex.PROJECT,
                        _.accounts.project.publicKey
                    )
                );
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    actions = (await Mina.fetchActions(
        _.accounts.participation.publicKey
    )) as Action[];

    proof = await RollupParticipation.firstStep(
        participationTrees.projectIndexTree.root,
        participationTrees.projectCounterTree.root,
        participationTrees.ipfsHashTree.root,
        participationZkApp.contract.actionState.get()
    );
    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        const participationAction = ParticipationAction.fromFields(
            Utilities.stringArrayToFields(action.actions[0])
        );
        proof = await RollupParticipation.participateCampaignStep(
            proof,
            participationAction,
            projectCounter,
            participationTrees.projectIndexTree.getLevel1Witness(
                ProjectIndexStorage.calculateLevel1Index({
                    campaignId: campaignId,
                    projectId: participationAction.projectId,
                })
            ),
            participationTrees.projectCounterTree.getLevel1Witness(
                ProjectCounterStorage.calculateLevel1Index(campaignId)
            ),
            participationTrees.ipfsHashTree.getLevel1Witness(
                ParticipationIpfsHashStorage.calculateLevel1Index({
                    campaignId: campaignId,
                    projectId: participationAction.projectId,
                })
            )
        );
        participationTrees.projectIndexTree.updateLeaf(
            ProjectIndexStorage.calculateLevel1Index({
                campaignId: campaignId,
                projectId: participationAction.projectId,
            }),
            ProjectIndexStorage.calculateLeaf(projectCounter.add(1))
        );
        projectCounter = projectCounter.add(1);
        participationTrees.projectCounterTree.updateLeaf(
            ProjectCounterStorage.calculateLevel1Index(campaignId),
            projectCounter
        );
        participationTrees.ipfsHashTree.updateLeaf(
            ParticipationIpfsHashStorage.calculateLevel1Index({
                campaignId: campaignId,
                projectId: participationAction.projectId,
            }),
            ParticipationIpfsHashStorage.calculateLeaf(
                participationAction.ipfsHash
            )
        );
    }

    if (ROLLUP_PARTICIPATION) {
        await fetchAccounts([
            _.accounts.participation.publicKey,
            _.accounts.campaign.publicKey,
            _.accounts.project.publicKey,
        ]);

        await Utils.proveAndSendTx(
            ParticipationContract.name,
            'rollup',
            async () => {
                await participationZkApp.contract.rollup(proof);
            },
            _.feePayer,
            true,
            undefined,
            logger
        );
    }

    if (FUND_PROJECT) {
    }
}

main();
